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

## 2. Repository Layout (Turborepo Polyglot Monorepo)

```
.
├── turbo.json                  # Turborepo task pipeline (dev, build, lint)
├── package.json                # Root workspace configuration
├── packages/
│   └── protocol/               # Shared TypeScript protocol & binary framing (@voice/protocol)
├── client/                     # Lightweight browser audio capture & HUD (TS, Vite)
│   ├── src/
│   │   ├── audio/              # AudioWorklet (no-alloc process loop), ring buffer, resampler
│   │   ├── session/            # SessionManager state machine
│   │   └── ui/                 # React Captions & LatencyHUD components
│   └── package.json
├── gateway/                    # Edge WebSocket router & backpressure controller (Node/TS)
│   ├── src/
│   │   ├── server.ts           # WebSocket & HTTP metrics server (:8443)
│   │   ├── Session.ts          # Session tracking & rolling context window
│   │   ├── backpressure.ts     # Drop-oldest bufferedAmount backpressure policy
│   │   ├── metrics.ts          # Prometheus instrumentation
│   │   └── routes/             # STT WS client & MT HTTP client
│   └── package.json
├── services/
│   ├── stt/                    # Streaming ASR & segmentation (Python, FastAPI)
│   │   ├── vad.py              # Silero VAD wrapper (threshold = 0.5)
│   │   ├── segmenter.py        # Hangover (500ms), preroll (200ms), maxLen (18s) state machine
│   │   ├── stabilizer.py       # LocalAgreement-n streaming text stabilizer
│   │   ├── asr.py              # faster-whisper with anti-hallucination settings
│   │   ├── session_state.py    # Per-session audio ring buffer & utterance state
│   │   ├── main.py             # WebSocket /stream endpoint
│   │   └── package.json        # Turborepo integration
│   ├── mt/                     # Machine translation service (Python, FastAPI, vLLM)
│   │   ├── engine.py           # vLLM AsyncLLMEngine wrapper with dev fallback
│   │   ├── prompt.py           # Terse translation system contract
│   │   ├── main.py             # Stateless POST /translate
│   │   └── package.json        # Turborepo integration
│   ├── tts/                    # Optional streaming speech synthesis skeleton
│   └── diarization/            # Optional speaker diarization skeleton
├── eval/                       # Offline benchmark & ablation harness
│   ├── configs/                # Sweep definitions (*.yaml)
│   ├── datasets/               # CoVoST 2 / Common Voice datasets (*.jsonl)
│   ├── metrics/                # Pure-function metrics: asr, streaming, mt, serving
│   ├── runner.py               # Dataset replay runner
│   └── report.py               # Latency vs quality Pareto chart generator
├── observability/
│   ├── prometheus.yml          # Prometheus scrape config
│   └── grafana/dashboards/     # Real-time pipeline telemetry dashboard
└── docker-compose.yml          # Containerized multi-service stack
```

---

## 3. Protocol Specification

### 3.1 Client ↔ Gateway Binary Audio Frame
```
Offset    Type       Field        Description
0         uint8      msgType      0x01 = audio
1..4      uint32LE   seq          Monotonically increasing sequence number
5..12     float64LE  tCapture     Client-side timestamp (Date.now() in ms)
13..      int16LE[]  pcm          16kHz 16-bit mono signed PCM samples
```

### 3.2 Shared Package (`@voice/protocol`)
Both `client` and `gateway` import protocol contracts directly from the workspace package:
```typescript
import { packAudioFrame, unpackAudioFrame, GatewayMessage, Utterance } from '@voice/protocol';
```

### 3.3 JSON Control & Telemetry Messages
- **Client → Gateway (`start`)**:
  ```json
  { "type": "start", "srcLang": "ja", "tgtLang": "en", "sampleRate": 16000 }
  ```
- **Gateway → Client (`partial`)**:
  ```json
  {
    "type": "partial",
    "uttId": 7,
    "seq": 31,
    "text": "すみません、駅は",
    "stableChars": 6,
    "tCapture": 1700000000120,
    "tEmit": 1700000000450
  }
  ```
- **Gateway → Client (`final`)**:
  ```json
  {
    "type": "final",
    "uttId": 7,
    "text": "すみません、駅はどこですか",
    "words": [{"text": "すみません", "start": 0.0, "end": 0.62}],
    "tCapture": 1700000000120,
    "tFinal": 1700000000850
  }
  ```
- **Gateway → Client (`translated`)**:
  ```json
  {
    "type": "translated",
    "uttId": 7,
    "translation": "Excuse me, where is the station?",
    "ttftMs": 84.2,
    "decodeMs": 195.4,
    "tTranslated": 1700000001150
  }
  ```
- **Gateway → Client (`hud`)**:
  ```json
  {
    "type": "hud",
    "queueDepth": 1024,
    "gpuUtil": 68,
    "rtf": 0.32
  }
  ```

---

## 4. Single-Command Startup & Quickstart

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

## 5. Offline Evaluation Harness

The evaluation harness evaluates streaming latency, flicker rate, ASR accuracy (CER/WER), translation metrics (chrF/BLEU), and GPU throughput.

```bash
# 1. Install eval dependencies
cd eval
pip install -r requirements.txt

# 2. Run parameter sweep across chunk sizes, agreement-n, and models:
python runner.py --sweep configs/streaming_ablation.yaml

# 3. Generate the Latency vs Flicker Pareto Frontier chart:
python report.py --input results/streaming_ablation.csv --output results/pareto_chart.png
```

### Pure Function Metric Contracts
All metric functions in `eval/metrics/` follow a stateless contract:
```python
def compute(log: list[dict], reference: Any = None) -> dict[str, float]:
    ...
```
No metric touches disk, networks, or GPUs.

---

## 6. Observability & Key Metrics

Prometheus scrapes metrics from all components:
- `gateway_audio_dropped_frames_total`: Audio frames dropped due to `ws.bufferedAmount` backpressure.
- `e2e_latency_seconds`: Latency across stage boundaries (`capture_to_partial`, `capture_to_final`, `final_to_translated`).
- `stt_asr_duration_seconds`: Histogram of chunk and final transcription durations.
- `mt_ttft_seconds` & `mt_decode_seconds`: vLLM time-to-first-token and token generation time.
- `gateway_queue_depth`: Buffered depth for STT and MT pipelines.
