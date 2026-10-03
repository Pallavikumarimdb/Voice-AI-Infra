# Voicebench UI (`client/`)

The **Voicebench** browser client: live voice calls with a selectable conversation brain, turn-level call inspection, blinded human labeling, and eval results — built with **TypeScript, React, Vite, and the Web Audio API**. It reads **live data only** from the gateway data API (`/api/*`, proxied by Vite in dev); unreachable API surfaces explicit error states, and label-save failures are reported, never faked.

---

## 1. What This Component Does

- **Microphone Capture**: Accesses local audio hardware via `navigator.mediaDevices.getUserMedia` with echo cancellation and noise suppression.
- **Audio Worklet Processing**: Runs on a separate high-priority audio thread to convert incoming 32-bit float audio chunks into signed 16-bit PCM samples with zero garbage collection allocations.
- **Binary Audio Framing**: Assembles 13-byte protocol headers with client timestamps (`tCapture`) and sequence IDs, streaming raw frames to the Gateway.
- **Speculative vs Committed Text Rendering**: Renders speculative partial hypotheses in muted grey (replacing text in-place) and locked final transcripts with translations in solid high-contrast text.
- **Real-Time HUD**: Surfaces real-time end-to-end latency metrics, Real-Time Factor (RTF), and Gateway backpressure queue depth.

---

## 2. Internal Architecture & Key Modules

```
client/src/
├── audio/
│   ├── worklet.ts         # AudioWorkletProcessor (runs on the Web Audio thread)
│   ├── ringBuffer.ts      # Main thread buffer staging
│   └── resample.ts        # Linear interpolation fallback resampler
├── session/
│   ├── SessionManager.ts  # State machine (idle -> connecting -> streaming -> idle) + PCM playback
│   └── protocol.ts        # Re-export from @voice/protocol
├── data/
│   ├── apiClient.ts       # Live /api client (throws on failure, no fixtures)
│   ├── loaders.ts         # Typed parsers for summary CSV, labels, personas, runs
│   ├── hashChain.ts       # SHA-256 audit-chain verifier (TS port)
│   └── types.ts           # Shared UI data models
├── ui/
│   ├── LiveCallPanel.tsx   # Live call: brain selector, transcript, workflow state, safety feed
│   ├── CallList.tsx         # Filterable call browser, newest first
│   ├── CallInspector.tsx    # Turn-by-turn timeline, guard diffs, judge, handoff
│   ├── ResultsViewer.tsx    # Champion/challenger tables rendered from result files
│   ├── LabelingScreen.tsx   # Blind human-rating console (writes via POST /api/labels)
│   ├── TranslatePanel.tsx   # Realtime translation demo
│   ├── Navbar.tsx           # Sidebar + topbar shell
│   ├── Badges.tsx           # Status badges (unknowns render as "—")
│   ├── Captions.tsx         # Stable React DOM diffing for partial/final text
│   ├── LatencyHUD.tsx       # Telemetry readout (unmeasured RTF/GPU render as "—")
│   └── primitives.tsx       # Shared Page/Card/Badge/EmptyState primitives
├── App.tsx                # Route router (/live, /calls, /calls/:id, /results, /label, /translate)
└── main.tsx               # Entry point
```

### 2.1 The Zero-Allocation AudioWorklet (`worklet.ts`)
The audio thread acts like an interrupt service routine. Any memory allocation on this thread risks invoking the browser JavaScript garbage collector, resulting in audible audio dropouts or packet jitter.
- Pre-allocates a fixed-size `Int16Array(512)` buffer (~32ms at 16kHz).
- Quantizes `Float32` audio samples to signed 16-bit integers (`-32768` to `+32767`).
- Transfers memory directly to the main thread using `postMessage(..., [buffer])` transferables.

### 2.2 Client Session State Machine (`SessionManager.ts`)
Tracks connection lifecycle:
- **`idle`**: Microphone and WebSocket inactive.
- **`connecting`**: WebSocket handshaking with the Gateway (`/session`), awaiting session start ACK.
- **`streaming`**: Media stream source connected to worklet; frames flow continuously. The manager is created once per panel mount and never recreated mid-call.
- Call start sends `{ type: 'start', mode: 'translate' | 'agent', srcLang, tgtLang, sampleRate: 16000, config }` where `config` carries domain, language, greeting, instructions, guardrails, and the selected conversation brain (`llm: { provider, model }`).
- Reconnects are server-side (gateway re-establishes STT); the client surfaces `status` notices and keeps streaming.

### 2.3 Non-Flickering Caption Diffing (`Captions.tsx`)
Naive streaming UI implementations cause severe visual flicker when partial hypotheses update several times a second because they remount the DOM element (`key={uttId + seq}`).
`Captions.tsx` uses **`key={entry.uttId}`**:
- React diffs only the inner text node when partial hypotheses arrive.
- The parent container and styles remain mounted, producing a smooth reading experience.

---

## 3. How It Connects to Other Components

```
┌────────────────────────────────────────────────────────┐
│                        BROWSER                         │
│                                                        │
│  [Microphone]                                          │
│        │                                               │
│        ▼                                               │
│  [AudioWorklet] ── (Zero-alloc PCM16) ──► [Main Thread]│
│                                                 │      │
│                                   packAudioFrame()     │
│                                                 │      │
└─────────────────────────────────────────────────┼──────┘
                                                  │
                                                  │ Binary Frame (msgType: 0x01)
                                                  │ wss://<gateway>:8443/session
                                                  ▼
                                       ┌─────────────────────┐
                                       │   Gateway Service   │
                                       │    (gateway/)       │
                                       └──────────┬──────────┘
                                                  │
                        JSON Events               │
     ┌────────────────────────────────────────────┘
     ▼
  { type: "partial", text: "...", stableChars: 6 }  ──► Rendered as muted italic
  { type: "final", text: "...", words: [...] }       ──► Rendered as solid text
  { type: "translated", translation: "..." }         ──► Rendered as translation block
  { type: "agent_text", text: "...", events, metrics } ──► Agent turn + workflow state + safety feed
  { type: "agent_audio_chunk", pcm16Base64: "..." }   ──► Scheduled PCM playback (flushed on barge-in)
  { type: "agent_speech_start" / "agent_speech_end" } ──► Speaking indicator + E2E latency math
  { type: "interrupt", reason: "caller_barge_in" }    ──► Playback flush + turn flag
  { type: "status", status: "stt_reconnecting" }      ──► Transient notice banner (call continues)
  { type: "error", code: "MT_UNAVAILABLE" }           ──► Error banner; fatal errors stop the session
  { type: "hud", queueDepth: 1024, gpuUtil: null, rtf: null } ──► Rendered in Latency HUD ("—" when null)
```

- **Upstream**: Captures microphone input from user.
- **Downstream**: Connects directly to the **Gateway** (`:8443`) via WebSocket. It never connects directly to STT or MT services, keeping client security and networking isolated behind the Gateway.

---

## 4. Local Development

```bash
# Start Vite development server
npm run dev
```
Open `http://localhost:5173` to test live speech capture.
