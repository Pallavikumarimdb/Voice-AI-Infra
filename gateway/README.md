# Gateway Service (`gateway/`)

The Gateway is the edge router, session manager, and backpressure controller for the streaming voice platform (agent calls + translation), implemented in **Node.js and TypeScript**. It runs in `translate` or `agent` mode per session (`GATEWAY_MODE`, overridable per call).

---

## 1. What This Component Does

- **Client Session Termination**: Accepts browser WebSocket connections on `wss://<host>:8443/session`.
- **Audio Framing & Passthrough**: Validates binary protocol headers and forwards PCM audio to the downstream STT service without re-encoding.
- **Drop-Oldest Backpressure**: Monitors downstream WebSocket buffer fullness (`ws.bufferedAmount`). When the downstream STT service falls behind, it sheds the oldest audio frames to keep real-time latency strictly bounded.
- **Agent Dispatch**: In `agent` mode, finalized utterances go to the Agent Brain (`POST :8003/turn`) with the last 5 lines of a 10-line rolling context window; replies stream back as text plus synthesized TTS audio. The agent greets first on every call (turn 0).
- **Translator Dispatch**: In `translate` mode, finalized utterances go to MT (`POST :8002/translate`) with the last 3 lines of context.
- **Barge-in & Echo Handling**: Caller speech during agent playback cuts TTS (< 25 ms) via `interrupt`; finals captured during own playback that overlap it are classified as speaker echo — shown, never acted on.
- **STT Auto-Reconnect**: A dropped STT leg reconnects with backoff (utterance numbering continues); the client gets `status` notices and keeps streaming.
- **Reviewer Data API**: Serves read-only `/api/*` endpoints (calls newest-first, call detail with 404s, eval summary with honestly aggregated violations, personas, labels + append-only label writes).
- **Telemetry & Observability**: Emits Prometheus metrics on `/metrics` and broadcasts periodic HUD messages to connected clients. `gpuUtil`/`rtf` are reported as `null` (rendered "—") — no GPU exporter or RTF probe is wired up, and the gateway will not invent them.

---

## 2. Internal Architecture & Key Modules

```
gateway/src/
├── server.ts         # Main HTTP/WSS server, session lifecycle, agent/translate dispatch, greeting, echo guard
├── Session.ts        # Session data structure and SessionManager container
├── agentConfig.ts    # Validated per-call agent config (domain, language, brain provider/model allowlist)
├── backpressure.ts   # Drop-oldest frame backpressure policy
├── metrics.ts        # Prometheus metrics registry (counters, gauges, histograms)
└── routes/
    ├── sttClient.ts  # Persistent WebSocket client connecting to STT service (auto-reconnect)
    ├── mtClient.ts    # Stateless HTTP client invoking MT translation service
    ├── agentClient.ts # HTTP client invoking the Agent Brain turn endpoint
    ├── ttsClient.ts   # Streaming HTTP client for TTS synthesis
    └── dataApi.ts     # Read-only reviewer endpoints (/api/calls, /api/results, /api/personas, /api/labels)
```

### 2.1 The Backpressure Policy (`backpressure.ts`)
In live voice translation, **audio that is 3 seconds delayed is worse than audio with a brief gap**.
Instead of maintaining an unbounded in-memory queue that bloats RAM and inflates latency:
```typescript
if (session.sttWs.bufferedAmount > MAX_BUFFERED_BYTES) {
  metrics.droppedFrames.inc({ session: session.id });
  return false; // Drop frame immediately
}
session.sttWs.send(frame);
```
- `MAX_BUFFERED_BYTES` defaults to `262144` bytes (~8 seconds of audio at 32 kB/s).
- Any frame dropped immediately surfaces as an increment in the Prometheus `gateway_audio_dropped_frames_total` counter.

### 2.2 Routing Final Segments (`server.ts`, `routes/agentClient.ts`, `routes/mtClient.ts`, `routes/ttsClient.ts`)
When the STT service emits a `final` committed segment:
1. The final transcript is forwarded immediately to the client so the user sees their speech finalized.
2. In `agent` mode, the Gateway calls the Agent Brain (`POST :8003/turn`) with the text and the last 5 lines of context. The reply streams back as `agent_text` (with behavior events + real model metrics) followed by synthesized TTS audio chunks. Fresh caller speech during playback triggers `interrupt` (barge-in); stale delayed partials do not.
3. In `translate` mode, the Gateway asynchronously triggers `mtClient.translate()` with the text and the last 3 sentences of context:
   ```typescript
   const res = await mtClient.translate({
     uttId: msg.uttId,
     text: msg.text,
     srcLang: session.srcLang,
     tgtLang: session.tgtLang,
     context: session.contextWindow.slice(-3)
   });
   ```
4. Because handlers use async/await within event callbacks, each turn **suspends only its own session's continuation**; all other sessions continue streaming audio and receiving partials without delay.
5. When MT responds, `{ type: "translated", translation: ... }` is sent to the client, and the end-to-end latency histogram (`final_to_translated`) is recorded. MT failures surface as honest `MT_UNAVAILABLE` errors.

---

## 3. How It Connects to Other Components

```
                           ┌──────────────────┐
                           │  Browser Client  │
                           │     (client/)    │
                           └────────┬─────────┘
                                    │
               wss://:8443/session  │ (Binary Audio Frames + JSON Control)
                                    ▼
                         ┌───────────────────────┐
                         │    GATEWAY SERVICE    │
                         │      (gateway/)       │
                         └───────┬───────┬───────┘
                                 │       │       │
       ws://:8001/stream         │       │ POST  │ POST
       (Persistent Per-Session)  │       │ :8003 │ :8002
                                 │       │ /turn │ /translate
                                 ▼       ▼       ▼
                       ┌───────────┐ ┌───────────┐ ┌───────────┐
                       │    STT    │ │   AGENT   │ │    MT     │
                       │  Service  │ │   Brain   │ │  Service  │
                       └───────────┘ └─────┬─────┘ └───────────┘
                                           │ POST :8004/synthesize
                                           ▼
                                     ┌───────────┐
                                     │    TTS    │
                                     │  Service  │
                                     └───────────┘
```

| Upstream / Downstream | Target | Protocol | Description |
| :--- | :--- | :--- | :--- |
| **Upstream** | `client` | WebSocket (`:8443/session`) | Receives raw PCM frames; sends partial/final/translated/agent/tts JSON |
| **Downstream** | `services/stt` | WebSocket (`:8001/stream`) | Persistent 1-to-1 connection per client session for streaming audio |
| **Downstream** | `services/agent` | HTTP (`:8003/turn`) | Per-turn brain request (text + context + config); validated agent config |
| **Downstream** | `services/mt` | HTTP (`:8002/translate`) | Stateless JSON POST per finalized utterance (translate mode) |
| **Downstream** | `services/tts` | HTTP (`:8004/synthesize`) | Streaming PCM synthesis for agent replies |
| **Reviewer API** | `client` | HTTP (`:8443/api/*`) | Calls, results, personas, labels (see `routes/dataApi.ts`) |
| **Telemetry** | `observability/prometheus` | HTTP (`:8443/metrics`) | Scraped every 2 seconds by Prometheus |

---

## 4. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GATEWAY_PORT` | `8443` | Listening port for the Gateway HTTP/WSS server |
| `GATEWAY_HOST` | `0.0.0.0` | Bind host |
| `GATEWAY_MODE` | `translate` | Default session mode (`translate` or `agent`; per-call `start` overrides) |
| `STT_SERVICE_URL` | `ws://localhost:8001/stream` | URL to downstream STT WebSocket service |
| `MT_SERVICE_URL` | `http://localhost:8002/translate` | URL to downstream MT HTTP translation service |
| `AGENT_SERVICE_URL` | `http://localhost:8003/turn` | URL to Agent Brain turn endpoint |
| `TTS_SERVICE_URL` | `http://localhost:8004/synthesize` | URL to TTS synthesis endpoint |
| `MAX_SESSIONS` | `500` | Hard cap on concurrent client sessions |
| `SESSION_IDLE_TIMEOUT_MS` | `1800000` | Reap sessions idle longer than this (30 min) |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed origin for the data API (never `*` in production) |
| `MAX_BUFFERED_BYTES`| `262144` | Maximum allowed socket buffer before drop-oldest backpressure triggers |
