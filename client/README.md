# Client Service (`client/`)

A high-performance browser testing harness built with **TypeScript, React, Vite, and the Web Audio API** for real-time speech capture, latency HUD telemetry, and non-flickering caption rendering.

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
│   ├── SessionManager.ts  # State machine (Idle -> Connecting -> Streaming -> Reconnecting)
│   └── protocol.ts        # Re-export from @voice/protocol
├── ui/
│   ├── Captions.tsx       # Stable React DOM diffing for partial/final text
│   └── LatencyHUD.tsx     # Telemetry readout component
├── App.tsx                # Main control bar, language picker, and state wiring
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
- **`streaming`**: Media stream source connected to worklet; frames flow continuously.
- **`reconnecting`**: Automatic retry upon unexpected network drops (creates a new session rather than attempting complex server-side resume).

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
  { type: "final", text: "...", words: [...] }       ──► Rendered as solid white
  { type: "translated", translation: "..." }         ──► Rendered as blue translation
  { type: "hud", queueDepth: 1024, rtf: 0.32 }       ──► Rendered in Latency HUD
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
