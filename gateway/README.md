# Gateway Service (`gateway/`)

The Gateway is the edge router, session manager, and backpressure controller for the streaming voice translation pipeline, implemented in **Node.js and TypeScript**.

---

## 1. What This Component Does

- **Client Session Termination**: Accepts browser WebSocket connections on `wss://<host>:8443/session`.
- **Audio Framing & Passthrough**: Validates binary protocol headers and forwards PCM audio to the downstream STT service without re-encoding.
- **Drop-Oldest Backpressure**: Monitors downstream WebSocket buffer fullness (`ws.bufferedAmount`). When the downstream STT service falls behind, it sheds the oldest audio frames to keep real-time latency strictly bounded.
- **Rolling Context Window**: Maintains a memory-capped history of the last 3 committed sentences per session to provide translation context to the MT model.
- **Asynchronous Fan-Out**: Dispatches committed utterances to the MT service via stateless HTTP (`POST /translate`) without blocking the event loop or other active sessions.
- **Telemetry & Observability**: Emits Prometheus metrics on `/metrics` and broadcasts periodic HUD messages to connected clients.

---

## 2. Internal Architecture & Key Modules

```
gateway/src/
├── server.ts         # Main HTTP/WSS server, session lifecycle, and event dispatching
├── Session.ts        # Session data structure and SessionManager container
├── backpressure.ts   # Drop-oldest frame backpressure policy
├── metrics.ts        # Prometheus metrics registry (counters, gauges, histograms)
└── routes/
    ├── sttClient.ts  # Persistent WebSocket client connecting to STT service
    └── mtClient.ts   # Stateless HTTP client invoking MT translation service
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
- `MAX_BUFFERED_BYTES` defaults to `65536` bytes (2 seconds of audio at 32 kB/s).
- Any frame dropped immediately surfaces as an increment in the Prometheus `gateway_audio_dropped_frames_total` counter.

### 2.2 Routing Final Segments to MT (`server.ts` & `routes/mtClient.ts`)
When the STT service emits a `final` committed segment:
1. The final transcript is forwarded immediately to the client so the user sees their speech finalized.
2. The Gateway asynchronously triggers `mtClient.translate()` with the text and the last 3 sentences of context:
   ```typescript
   const res = await mtClient.translate({
     uttId: msg.uttId,
     text: msg.text,
     srcLang: session.srcLang,
     tgtLang: session.tgtLang,
     context: session.contextWindow.slice(-3)
   });
   ```
3. Because the handler uses async/await within an event callback, it **suspends only this session's continuation**; all other sessions continue streaming audio and receiving partials without delay.
4. When MT responds, `{ type: "translated", translation: ... }` is sent to the client, and the end-to-end latency histogram (`final_to_translated`) is recorded.

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
                                 │       │
       ws://:8001/stream         │       │ POST http://:8002/translate
       (Persistent Per-Session)  │       │ (Stateless HTTP Request)
                                 │       │
                                 ▼       ▼
                       ┌───────────┐   ┌───────────┐
                       │    STT    │   │    MT     │
                       │  Service  │   │  Service  │
                       └───────────┘   └───────────┘
```

| Upstream / Downstream | Target | Protocol | Description |
| :--- | :--- | :--- | :--- |
| **Upstream** | `client` | WebSocket (`:8443/session`) | Receives raw PCM frames; sends partial/final/translated JSON |
| **Downstream** | `services/stt` | WebSocket (`:8001/stream`) | Persistent 1-to-1 connection per client session for streaming audio |
| **Downstream** | `services/mt` | HTTP (`:8002/translate`) | Stateless JSON POST per finalized utterance |
| **Telemetry** | `observability/prometheus` | HTTP (`:8443/metrics`) | Scraped every 2 seconds by Prometheus |

---

## 4. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GATEWAY_PORT` | `8443` | Listening port for the Gateway HTTP/WSS server |
| `GATEWAY_HOST` | `0.0.0.0` | Bind host |
| `STT_SERVICE_URL` | `ws://localhost:8001/stream` | URL to downstream STT WebSocket service |
| `MT_SERVICE_URL` | `http://localhost:8002/translate` | URL to downstream MT HTTP translation service |
| `MAX_BUFFERED_BYTES`| `65536` | Maximum allowed socket buffer before drop-oldest backpressure triggers |
