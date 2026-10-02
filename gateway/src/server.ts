import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { SessionManager, Session } from './Session';
import { forwardAudioFrame } from './backpressure';
import { createSTTConnection, STTMessage } from './routes/sttClient';
import { MTClient } from './routes/mtClient';
import { AgentClient } from './routes/agentClient';
import { TTSClient } from './routes/ttsClient';
import { metrics } from './metrics';

dotenv.config();

const PORT = parseInt(process.env.GATEWAY_PORT || process.env.PORT || '8443', 10);
const HOST = process.env.GATEWAY_HOST || '0.0.0.0';
const DEFAULT_MODE = (process.env.GATEWAY_MODE || process.env.MODE || 'translate') as 'translate' | 'agent';
const STT_URL = process.env.STT_SERVICE_URL || 'ws://localhost:8001/stream';
const MT_URL = process.env.MT_SERVICE_URL || 'http://localhost:8002/translate';
const AGENT_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8003/turn';
const TTS_URL = process.env.TTS_SERVICE_URL || 'http://localhost:8004/synthesize';

const sessionManager = new SessionManager();
const mtClient = new MTClient(MT_URL);
const agentClient = new AgentClient(AGENT_URL);
const ttsClient = new TTSClient(TTS_URL);

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
  const session = sessionManager.create(sessionId, clientWs, DEFAULT_MODE);
  metrics.activeSessions.inc();

  console.log(`[Gateway] Session connected: ${sessionId} (mode: ${session.mode})`);

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

          // Barge-in check: If caller starts speaking while agent is speaking audio, interrupt
          if (session.mode === 'agent' && session.isAgentSpeaking) {
            console.log(`[Gateway] Barge-in detected during utterance ${session.currentSpeakingUttId}`);
            session.currentTTSAbort?.abort();
            session.isAgentSpeaking = false;
            sendJson(clientWs, {
              type: 'interrupt',
              uttId: session.currentSpeakingUttId,
              tInterrupt: now,
              reason: 'caller_barge_in'
            });
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

          if (sttMsg.text && sttMsg.uttId !== undefined) {
            const currentUttId = sttMsg.uttId;
            const currentText = sttMsg.text;

            if (session.mode === 'agent') {
              const res = await agentClient.turn({
                sessionId: session.id,
                uttId: currentUttId,
                text: currentText,
                tCaptureMs: sttMsg.tCapture,
                context: session.contextWindow.slice(-5),
              });

              const tAgentDone = Date.now();
              const agentLatSec = (tAgentDone - tFinal) / 1000;
              metrics.e2eLatency.observe({ boundary: 'final_to_agent' }, agentLatSec);

              if (res) {
                session.contextWindow.push(`Caller: ${currentText}`);
                session.contextWindow.push(`Agent: ${res.text}`);
                if (session.contextWindow.length > 10) {
                  session.contextWindow = session.contextWindow.slice(-10);
                }

                sendJson(clientWs, {
                  type: 'agent_text',
                  sessionId: session.id,
                  uttId: currentUttId,
                  text: res.text,
                  events: res.events,
                  metrics: res.metrics,
                  tEmit: tAgentDone,
                });

                if (res.metrics?.llmMs) {
                  metrics.agentTurnLatency.observe({ stage: 'llm_fast' }, res.metrics.llmMs / 1000);
                }
                if (res.metrics?.tokensIn) {
                  metrics.agentTokens.inc({ type: 'prompt' }, res.metrics.tokensIn);
                }
                if (res.metrics?.tokensOut) {
                  metrics.agentTokens.inc({ type: 'completion' }, res.metrics.tokensOut);
                }
                if (res.events) {
                  for (const ev of res.events) {
                    if (ev.type === 'compliance_block') {
                      metrics.agentComplianceBlocks.inc({ rule: ev.payload?.rule || 'unknown' });
                    } else if (ev.type === 'escalate') {
                      metrics.agentEscalations.inc({ reason: ev.payload?.reason || 'unknown' });
                    }
                  }
                }

                // Stream agent audio back to client via TTS
                session.isAgentSpeaking = true;
                session.currentSpeakingUttId = currentUttId;
                session.currentTTSAbort = new AbortController();

                sendJson(clientWs, {
                  type: 'agent_speech_start',
                  uttId: currentUttId,
                  tStart: Date.now()
                });
                metrics.turnEndToAgentAudio.observe((Date.now() - tFinal) / 1000);

                ttsClient.streamSynthesize(
                  res.text,
                  (chunkSeq, chunkBuf) => {
                    if (session.isAgentSpeaking) {
                      sendJson(clientWs, {
                        type: 'agent_audio_chunk',
                        uttId: currentUttId,
                        seq: chunkSeq,
                        pcm16Base64: chunkBuf.toString('base64'),
                        tEmit: Date.now()
                      });
                    }
                  },
                  { abortSignal: session.currentTTSAbort.signal }
                ).then(() => {
                  if (session.isAgentSpeaking) {
                    sendJson(clientWs, {
                      type: 'agent_speech_end',
                      uttId: currentUttId,
                      tEnd: Date.now()
                    });
                    session.isAgentSpeaking = false;
                  }
                }).catch((ttsErr) => {
                  if (ttsErr.name !== 'AbortError') {
                    console.error(`[Gateway] TTS error for ${currentUttId}:`, ttsErr.message);
                  }
                  session.isAgentSpeaking = false;
                });
              } else {
                sendJson(clientWs, {
                  type: 'error',
                  code: 'AGENT_UNAVAILABLE',
                  uttId: currentUttId,
                });
              }
            } else {
              // Asynchronously dispatch translation to stateless MT service
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
          if (msg.mode) {
            session.mode = msg.mode;
          }
          session.isStarted = true;
          connectSTT();
          sendJson(clientWs, { type: 'started', sessionId, mode: session.mode });
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
