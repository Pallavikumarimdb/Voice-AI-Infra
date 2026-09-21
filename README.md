# Streaming Voice Translation Pipeline (Voice AI Infra)

End-to-end real-time Japanese ↔ English speech-to-text and machine translation pipeline with sub-2-second mouth-to-caption latency, LocalAgreement-n stabilization, GPU-batched MT serving (vLLM), backpressured WebSocket gateway, offline evaluation harness, and Prometheus/Grafana observability.

---

## 1. System Overview & Architecture

```
                                  [ Browser / Client ]
                                          │
                         wss://:8443      │  Binary PCM (16kHz mono)
                         /session         │  JSON control & results
                                          ▼
                                   ┌──────────────┐
                                   │   Gateway    │
                                   │  Node.js:TS  │
                                   └──────┬───────┘
                                          │
                  ws://:8001/stream       │         http://:8002/translate
               ┌──────────────────────────┴─────────────────────────┐
               ▼                                                    ▼
      ┌─────────────────┐                                  ┌─────────────────┐
      │   STT Service   │                                  │   MT Service    │
      │  Faster-Whisper │                                  │  vLLM Engine    │
      │  + Silero VAD   │                                  │  (Continuous    │
      │ + LocalAgreement│                                  │    Batching)    │
      └─────────────────┘                                  └─────────────────┘
```

### The Architectural Seam
- **STT is stateful**: Audio accumulates in real-time with ongoing VAD gating across the lifetime of an utterance. Hence, it requires a dedicated, persistent WebSocket per session (`ws://stt:8001/stream`).
- **MT is stateless**: Translation is a pure function of `(text, rolling_context, src_lang, tgt_lang)`. It uses a plain async HTTP POST (`/translate`), enabling **vLLM's continuous batching** to interleave translation requests across all active sessions into single GPU-saturating batches.

---

## 2. Repository Layout & Section Documentation

Each component contains its own dedicated `README.md` explaining its internals, configuration, and interfaces:

```
.
├── packages/
│   └── protocol/               # 📖 packages/protocol/README.md: Wire specs & binary packers
├── client/                     # 📖 client/README.md: AudioWorklet & non-flicker captions UI
├── gateway/                    # 📖 gateway/README.md: Backpressure router & session coordinator
├── services/
│   ├── stt/                    # 📖 services/stt/README.md: VAD segmenter & LocalAgreement-n ASR
│   ├── mt/                     # 📖 services/mt/README.md: vLLM AsyncLLMEngine continuous batching
│   ├── tts/                    # Streaming speech synthesis skeleton (optional)
│   └── diarization/            # Diarization skeleton (optional)
├── eval/                       # 📖 eval/README.md: Pure-function benchmark suite & Pareto charts
├── observability/              # 📖 observability/README.md: Prometheus metrics & Grafana dashboard
├── turbo.json                  # Turborepo task pipeline (dev, build, lint)
├── package.json                # Root workspace configuration
└── docker-compose.yml          # Multi-container GPU stack orchestration
```

---

## 3. How Components Connect to Each Other

### 3.1 End-to-End Component Connectivity Matrix

```
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│    Client    ├────────────►│   Gateway    ├────────────►│  STT Service │
│   (Browser)  │  WSS :8443  │ (Node.js/TS) │   WS :8001  │ (Python/Fast)│
└──────┬───────┘             └──────┬───────┘             └──────┬───────┘
       ▲                            │                            │
       │     Emits Partial/Final    │      HTTP POST :8002       │
       │     & Translated JSON      ▼      (Stateless)           │
       └────────────────────────────┴───────────────────────────►│  MT Service │
                                                                 │ (vLLM Engine)│
                                                                 └──────────────┘
```

| Source | Target | Protocol | Data Exchanged | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Client** | **Gateway** | `wss://:8443/session` | Binary PCM frames (`0x01` + `seq` + `tCapture` + PCM) & JSON control (`start`, `stop`) | Low-overhead microphone audio ingestion and bidirectional telemetry |
| **Gateway** | **STT Service** | `ws://:8001/stream` | Passthrough binary PCM frames & session initialization JSON | Persistent, stateful audio streaming to VAD and streaming ASR |
| **STT Service**| **Gateway** | WebSocket | JSON: `{type: "partial", ...}` and `{type: "final", ...}` | Streaming partial hypotheses and committed acoustic segments |
| **Gateway** | **MT Service** | `http://:8002/translate`| JSON: `{uttId, text, srcLang, tgtLang, context: [...]}` | Stateless translation request batched by vLLM scheduler |
| **MT Service** | **Gateway** | HTTP Response | JSON: `{translation, ttft_ms, decode_ms, tokensOut}` | High-speed translated output with token generation timing |
| **Gateway** | **Client** | WebSocket | JSON: `{type: "translated", ...}` and `{type: "hud", ...}` | Live translated captions and real-time latency HUD telemetry |
| **Prometheus** | **All Services** | HTTP `GET /metrics` | Time-series metric scrapes every 2s (:8443, :8001, :8002) | Pipeline telemetry, queue depth, and stage-boundary histograms |
| **Grafana** | **Prometheus** | HTTP `GET :9090` | PromQL queries | Visualizing real-time latency quantiles, backpressure, and throughput |

---

### 3.2 Step-by-Step Data Flow for a Single Utterance

```
Client               Gateway            STT Service          MT Service
  │                     │                    │                    │
  │─── start JSON ─────►│                    │                    │
  │                     │── session_start ──►│                    │
  │                     │                    │                    │
  │── binary PCM frame ─►│                    │                    │
  │   (seq, tCapture)   │── forward frame ──►│                    │
  │                     │   (backpressure)   │                    │
  │                     │                    │── VAD gates chunk  │
  │                     │                    │── LocalAgreement-n │
  │                     │◄── partial JSON ───│                    │
  │◄── partial JSON ────│                    │                    │
  │   (grey text diff)  │                    │                    │
  │                     │                    │── silence hangover │
  │                     │◄── final JSON ─────│   (commit segment) │
  │◄── final JSON ──────│   (words + times)  │                    │
  │   (solid text)      │                                         │
  │                     │─── POST /translate (text + context) ───►│
  │                     │                                         │── vLLM dynamic
  │                     │                                         │   batching
  │                     │◄── 200 OK (translation + ttft_ms) ──────│
  │◄── translated JSON ─│                                         │
  │   (blue text)       │                                         │
```

1. **User Speaks**: Browser `AudioWorklet` slices audio into 512-sample Int16 blocks and transmits binary frames with client capture timestamps (`tCapture`) over WebSocket.
2. **Gateway Ingestion & Backpressure**: Gateway checks `session.sttWs.bufferedAmount`. If the STT service is healthy, the frame is forwarded. If overloaded (`> 64KB`), the frame is dropped to prevent runaway lag.
3. **VAD Gating & Chunk Accumulation**: In `services/stt`, Silero VAD evaluates speech probability (`prob > 0.5`). If speech is detected, the audio segmenter captures a 200ms preroll and feeds the active audio buffer.
4. **Streaming Partials & Stabilization**: Every 500ms, faster-whisper generates a hypothesis. `LocalAgreement-n` finds the longest common prefix across the last `n` runs. Stable text is committed, audio buffer is trimmed, and speculative text is emitted as `partial`.
5. **Silence Hangover & Utterance Finalization**: When the speaker pauses for $\ge 500\text{ms}$ (or speech reaches 18s), the segment is finalized. Word timestamps are generated, and a `final` event is sent to the Gateway.
6. **Stateless GPU Translation**: Gateway receives `final`, updates its 3-sentence rolling context window, and fires an async `POST /translate` to the MT service.
7. **Continuous Batching in vLLM**: `AsyncLLMEngine` batches the translation request alongside other active sessions at the iteration level, returning the translation with sub-250ms TTFT.
8. **Client Caption Render**: Gateway pushes `{type: "translated"}` to the browser, which renders the translation underneath the finalized sentence without remounting the DOM.

---

## 4. Section Breakdown: What Each Section Does

### 4.1 Shared Protocol (`packages/protocol/`)
* **Role**: Defines the shared wire format and TypeScript types for the entire repository.
* **Key Artifacts**: `packAudioFrame`, `unpackAudioFrame`, `GatewayMessage`, `Utterance`, `WordTs`.
* **Details**: See [packages/protocol/README.md](packages/protocol/README.md).

### 4.2 Browser Client (`client/`)
* **Role**: Captures microphone audio on a dedicated audio thread, streams binary frames, and displays non-flickering captions and live telemetry HUD.
* **Key Artifacts**: `AudioWorkletProcessor`, `SessionManager`, `Captions.tsx`, `LatencyHUD.tsx`.
* **Details**: See [client/README.md](client/README.md).

### 4.3 Gateway Service (`gateway/`)
* **Role**: Edge WebSocket termination, session context window management, drop-oldest backpressure control, and async MT dispatch.
* **Key Artifacts**: `server.ts`, `Session.ts`, `backpressure.ts`, `sttClient.ts`, `mtClient.ts`, `metrics.ts`.
* **Details**: See [gateway/README.md](gateway/README.md).

### 4.4 Streaming STT Service (`services/stt/`)
* **Role**: Silero VAD speech gating, acoustic segmentation state machine, LocalAgreement-n streaming text stabilization, and faster-whisper ASR inference.
* **Key Artifacts**: `main.py`, `vad.py`, `segmenter.py`, `stabilizer.py`, `asr.py`, `session_state.py`.
* **Details**: See [services/stt/README.md](services/stt/README.md).

### 4.5 Machine Translation Service (`services/mt/`)
* **Role**: Stateless GPU translation utilizing vLLM `AsyncLLMEngine` continuous batching, concise system prompts, and TTFT tracking.
* **Key Artifacts**: `main.py`, `engine.py`, `prompt.py`.
* **Details**: See [services/mt/README.md](services/mt/README.md).

### 4.6 Offline Evaluation Harness (`eval/`)
* **Role**: Reproducible benchmark suite implementing pure-function metric contracts (CER, WER, flicker rate, chrF, BLEU) and ablation parameter sweeps.
* **Key Artifacts**: `runner.py`, `report.py`, `metrics/`, `configs/streaming_ablation.yaml`.
* **Details**: See [eval/README.md](eval/README.md).

### 4.7 Observability Stack (`observability/`)
* **Role**: Real-time monitoring with Prometheus scrapers and a comprehensive 7-panel Grafana dashboard.
* **Key Artifacts**: `prometheus.yml`, `voice_translation_pipeline.json`.
* **Details**: See [observability/README.md](observability/README.md).

---

## 5. Single-Command Startup & Quickstart

### Option A: Turborepo Local Development (Single Command)
Run the entire pipeline (Client, Gateway, and Services) concurrently with unified terminal output:
```bash
# 1. Install root dependencies and link workspaces
npm install

# 2. Build shared packages and apps
npm run build

# 3. Start all pipeline components simultaneously
npm run dev
```

### Option B: Docker Compose (GPU Box & Production Standard)
Runs all services with exact CUDA runtimes, Prometheus, and Grafana:
```bash
npm run dev:docker
# or: docker compose up --build
```
- Gateway: `http://localhost:8443` (WS endpoint: `ws://localhost:8443/session`)
- Client Web App: `http://localhost:5173`
- STT Service: `http://localhost:8001`
- MT Service: `http://localhost:8002`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (User: `admin`, Pass: `admin`)

---

### Option C: Running Standalone Services (Individual Terminals)

#### 1. Start the Gateway (Node.js)
```bash
cd gateway
npm install
npm run dev
```

#### 2. Start the STT Service (Python)
```bash
cd services/stt
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

#### 3. Start the MT Service (Python)
```bash
cd services/mt
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8002 --reload
```

#### 4. Run the Client Browser Test App
```bash
cd client
npm install
npm run dev
```
Open `http://localhost:5173` to test live microphone capture, real-time stabilization, and translation.

---

## 6. Offline Evaluation Harness Usage

```bash
# 1. Install eval dependencies
cd eval
pip install -r requirements.txt

# 2. Run parameter sweep across chunk sizes, agreement-n, and models:
python runner.py --sweep configs/streaming_ablation.yaml

# 3. Generate the Latency vs Flicker Pareto Frontier chart:
python report.py --input results/streaming_ablation.csv --output results/pareto_chart.png
```

---

## 7. Observability & Key Metrics

Prometheus scrapes metrics from all components:
- `gateway_audio_dropped_frames_total`: Audio frames dropped due to `ws.bufferedAmount` backpressure.
- `e2e_latency_seconds`: Latency across stage boundaries (`capture_to_partial`, `capture_to_final`, `final_to_translated`).
- `stt_asr_duration_seconds`: Histogram of chunk and final transcription durations.
- `mt_ttft_seconds` & `mt_decode_seconds`: vLLM time-to-first-token and token generation time.
- `gateway_queue_depth`: Buffered depth for STT and MT pipelines.
