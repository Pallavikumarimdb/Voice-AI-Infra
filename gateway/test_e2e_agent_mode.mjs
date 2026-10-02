/**
 * M1 End-to-end test: Verify agent stub echoes text through the gateway in agent mode.
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MOCK_AGENT_PORT = 8093;
const MOCK_STT_PORT = 8091;
const GATEWAY_TEST_PORT = 8445;

async function runM1Test() {
  console.log('[M1 E2E Test] Starting mock Agent service on port', MOCK_AGENT_PORT);
  const agentServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/turn') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const parsed = JSON.parse(body);
        const reply = {
          text: `お電話ありがとうございます。お伺いいたしました：${parsed.text}`,
          events: [
            { type: 'state_change', payload: { phase: 'greet' }, ts: Date.now() }
          ],
          metrics: {
            llmMs: 25.0,
            ttftMs: 10.0,
            tokensIn: parsed.text.length,
            tokensOut: 20,
            model: 'agent_stub_v0'
          }
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(r => agentServer.listen(MOCK_AGENT_PORT, r));

  console.log('[M1 E2E Test] Starting mock STT WebSocket server on port', MOCK_STT_PORT);
  let sttClientWs = null;
  const sttWss = new WebSocketServer({ port: MOCK_STT_PORT });
  sttWss.on('connection', (ws) => {
    sttClientWs = ws;
    console.log('[Mock STT] Gateway connected to STT stream');
  });

  console.log('[M1 E2E Test] Launching Gateway with MODE=agent...');
  const gatewayProcess = spawn('node', [path.join(__dirname, 'dist', 'server.js')], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(GATEWAY_TEST_PORT),
      GATEWAY_PORT: String(GATEWAY_TEST_PORT),
      GATEWAY_MODE: 'agent',
      STT_SERVICE_URL: `ws://localhost:${MOCK_STT_PORT}/stream`,
      AGENT_SERVICE_URL: `http://localhost:${MOCK_AGENT_PORT}/turn`
    }
  });

  const readyPromise = new Promise((resolve, reject) => {
    gatewayProcess.stdout.on('data', d => {
      const msg = d.toString().trim();
      console.log(`[Gateway Log] ${msg}`);
      if (msg.includes('Server running')) {
        resolve();
      }
    });
    gatewayProcess.stderr.on('data', d => {
      console.error(`[Gateway Err] ${d.toString().trim()}`);
    });
    gatewayProcess.on('error', reject);
    gatewayProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Gateway exited with code ${code}`));
      }
    });
  });

  // Wait for gateway ready
  await readyPromise;

  try {
    console.log('[M1 E2E Test] Connecting client to Gateway on ws://localhost:' + GATEWAY_TEST_PORT + '/session');
    const clientWs = new WebSocket(`ws://localhost:${GATEWAY_TEST_PORT}/session`);

    await new Promise((resolve, reject) => {
      clientWs.on('open', resolve);
      clientWs.on('error', reject);
    });

    console.log('[M1 E2E Test] Sending start message with mode: agent...');
    clientWs.send(JSON.stringify({
      type: 'start',
      mode: 'agent',
      srcLang: 'ja',
      tgtLang: 'ja',
      sampleRate: 16000
    }));

    // Wait for started message
    const startedMsg = await new Promise(resolve => {
      clientWs.once('message', data => resolve(JSON.parse(data.toString())));
    });
    console.log('[M1 E2E Test] Received from Gateway:', startedMsg);
    if (startedMsg.type !== 'started' || startedMsg.mode !== 'agent') {
      throw new Error(`Expected started with mode=agent, got: ${JSON.stringify(startedMsg)}`);
    }

    // Wait until gateway connects to STT
    while (!sttClientWs || sttClientWs.readyState !== WebSocket.OPEN) {
      await new Promise(r => setTimeout(r, 100));
    }

    console.log('[M1 E2E Test] Simulating STT final message: "もしもし、田中です"');
    sttClientWs.send(JSON.stringify({
      type: 'final',
      uttId: 101,
      text: 'もしもし、田中です',
      words: [],
      tCapture: Date.now() - 500,
      tFinal: Date.now()
    }));

    // Expect Gateway to forward agent_text message back to client!
    const agentMsg = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for agent_text')), 4000);
      clientWs.on('message', data => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'agent_text') {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    console.log('[M1 E2E Test] Received agent_text message:', agentMsg);
    if (!agentMsg.text.includes('もしもし、田中です')) {
      throw new Error(`Agent text did not contain expected text: ${agentMsg.text}`);
    }
    if (!agentMsg.events || agentMsg.events.length === 0) {
      throw new Error('Agent text did not contain events');
    }

    console.log('\n[M1 SUCCESS] Agent stub echoed text through Gateway in agent mode cleanly!');
    clientWs.close();
  } finally {
    gatewayProcess.kill();
    sttWss.close();
    agentServer.close();
  }
}

runM1Test().catch(err => {
  console.error('[M1 TEST FAILURE]', err);
  process.exit(1);
});
