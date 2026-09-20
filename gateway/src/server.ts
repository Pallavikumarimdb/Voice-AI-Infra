import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { SessionManager, Session } from './Session';
import { forwardAudioFrame } from './backpressure';
import { createSTTConnection, STTMessage } from './routes/sttClient';
import { MTClient } from './routes/mtClient';
import { metrics } from './metrics';

dotenv.config();

const PORT = parseInt(process.env.GATEWAY_PORT || process.env.PORT || '8443', 10);
const HOST = process.env.GATEWAY_HOST || '0.0.0.0';
const STT_URL = process.env.STT_SERVICE_URL || 'ws://localhost:8001/stream';
const MT_URL = process.env.MT_SERVICE_URL || 'http://localhost:8002/translate';

const sessionManager = new SessionManager();
const mtClient = new MTClient(MT_URL);

// HTTP Server for metrics and health
const server = http.createServer(async (req, res) => {
  if (req.url === '/metrics' && req.method === 'GET') {
    res.setHeader('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', activeSessions: sessionManager.getAll().length }));
    return;
  }

  res.writeHead(404);
  res.end();
});

// WebSocket Server for client sessions
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
  if (pathname === '/session') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (clientWs: WebSocket) => {
  const sessionId = `s_${Math.random().toString(36).substring(2, 9)}`;
  const session = sessionManager.create(sessionId, clientWs);
  metrics.activeSessions.inc();

  console.log(`[Gateway] Session connected: ${sessionId}`);

  // Safe JSON sender
  const sendJson = (ws: WebSocket, obj: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  };

  // Connect downstream to STT Service
  const connectSTT = () => {
    session.sttWs = createSTTConnection(
      session,
      STT_URL,
      async (sttMsg: STTMessage) => {
        const now = Date.now();

        if (sttMsg.type === 'partial') {
          // Record capture-to-partial latency if tCapture is present
          if (sttMsg.tCapture) {
            const latSec = (now - sttMsg.tCapture) / 1000;
            metrics.e2eLatency.observe({ boundary: 'capture_to_partial' }, latSec);
          }
          sendJson(clientWs, { ...sttMsg, tEmit: now });
        } else if (sttMsg.type === 'final') {
          const tFinal = now;
          if (sttMsg.tCapture) {
            const latSec = (tFinal - sttMsg.tCapture) / 1000;
            metrics.e2eLatency.observe({ boundary: 'capture_to_final' }, latSec);
          }

          // Forward final transcript to client immediately
          sendJson(clientWs, { ...sttMsg, tFinal });

          // Asynchronously dispatch translation to stateless MT service
          if (sttMsg.text && sttMsg.uttId !== undefined) {
            const currentUttId = sttMsg.uttId;
            const currentText = sttMsg.text;

            const res = await mtClient.translate({
              uttId: currentUttId,
              text: currentText,
              srcLang: session.srcLang,
              tgtLang: session.tgtLang,
              context: session.contextWindow.slice(-3),
            });

            const tTranslated = Date.now();
            const mtLatSec = (tTranslated - tFinal) / 1000;
            metrics.e2eLatency.observe({ boundary: 'final_to_translated' }, mtLatSec);

            if (res && res.translation) {
              session.contextWindow.push(currentText);
              // Bound context window
              if (session.contextWindow.length > 5) {
                session.contextWindow.shift();
              }

              sendJson(clientWs, {
                type: 'translated',
                uttId: currentUttId,
                translation: res.translation,
                ttftMs: res.ttft_ms,
                decodeMs: res.decode_ms,
                tTranslated,
              });
            } else {
              sendJson(clientWs, {
                type: 'error',
                code: 'MT_UNAVAILABLE',
                uttId: currentUttId,
              });
            }
          }
        }
      },
      (err) => {
        console.error(`[Gateway] STT service error in session ${sessionId}:`, err.message);
        sendJson(clientWs, { type: 'error', code: 'STT_ERROR', message: err.message });
      },
      () => {
        console.log(`[Gateway] STT connection closed for session ${sessionId}`);
      }
    );
  };

  clientWs.on('message', (data: Buffer | string, isBinary: boolean) => {
    session.lastActivityAt = Date.now();

    if (isBinary && Buffer.isBuffer(data)) {
      // Protocol header check: Offset 0 = msgType (0x01 = audio)
      if (data.length < 13) return;
      const msgType = data.readUInt8(0);
      if (msgType === 0x01) {
        if (!session.isStarted) {
          // Client sent audio before start control message - drop safely
          return;
        }
        // Forward through backpressure policy
        forwardAudioFrame(session, data);
      }
    } else {
      // Control JSON message
      try {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        const msg = JSON.parse(text);

        if (msg.type === 'start') {
          session.srcLang = msg.srcLang || 'ja';
          session.tgtLang = msg.tgtLang || 'en';
          session.sampleRate = msg.sampleRate || 16000;
          session.isStarted = true;
          connectSTT();
          sendJson(clientWs, { type: 'started', sessionId });
        } else if (msg.type === 'stop') {
          session.isStarted = false;
          if (session.sttWs && session.sttWs.readyState === WebSocket.OPEN) {
            session.sttWs.send(JSON.stringify({ type: 'session_stop' }));
          }
          sendJson(clientWs, { type: 'stopped' });
        }
      } catch (err) {
        console.error(`[Gateway] Invalid control frame for session ${sessionId}:`, err);
      }
    }
  });

  clientWs.on('close', () => {
    console.log(`[Gateway] Client disconnected: ${sessionId}`);
    metrics.activeSessions.dec();
    sessionManager.remove(sessionId);
  });

  clientWs.on('error', (err) => {
    console.error(`[Gateway] Client error for session ${sessionId}:`, err.message);
  });
});

// Periodic HUD metrics broadcast
setInterval(() => {
  const sessions = sessionManager.getAll();
  for (const session of sessions) {
    if (session.clientWs.readyState === WebSocket.OPEN) {
      session.clientWs.send(
        JSON.stringify({
          type: 'hud',
          queueDepth: session.audioChannelDepth,
          gpuUtil: 0, // In production, fed by nvidia-smi exporter
          rtf: 0.35,
        })
      );
    }
  }
}, 1000);

server.listen(PORT, HOST, () => {
  console.log(`[Gateway] Server running on http://${HOST}:${PORT}`);
  console.log(`[Gateway] Metrics available at http://${HOST}:${PORT}/metrics`);
});
