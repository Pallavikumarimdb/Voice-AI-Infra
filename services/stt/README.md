# STT Service (`services/stt/`)

A high-throughput, low-latency streaming speech-to-text service implemented in **Python, FastAPI, faster-whisper, and Silero VAD**, featuring **LocalAgreement-n stabilization** and anti-hallucination gating.

---

## 1. What This Component Does

- **Streaming WebSocket Endpoint**: Exposes `/stream` over WebSocket, receiving raw 16kHz PCM audio frames forwarded from the Gateway.
- **Voice Activity Detection (VAD)**: Runs Silero VAD frame-by-frame (`prob > 0.5`) to gate incoming audio and prevent near-silent audio from reaching the ASR model.
- **Acoustic Segmentation**: Implements a robust state machine with speech hangover (500ms), preroll buffering (200ms), and maximum length forced cuts (18s).
- **LocalAgreement-n Stabilization**: Stabilizes streaming ASR output across consecutive inference runs, committing words only when `n` consecutive runs agree on their prefix, eliminating screen flicker.
- **Audio Buffer Trimming**: Trims audio buffer memory according to committed word timestamps so memory usage never grows unbounded.
- **Anti-Hallucination ASR**: Configures `faster-whisper` with `condition_on_previous_text=False` to prevent Whisper's failure mode on background noise or silence.

---

## 2. Internal Architecture & Algorithms

```
services/stt/
├── vad.py            # Silero VAD wrapper (prob > 0.5 evaluation)
├── segmenter.py      # VAD segmentation state machine (IDLE -> SPEECH -> FINALIZING)
├── stabilizer.py     # LocalAgreement-n longest common prefix stabilizer
├── asr.py            # faster-whisper model wrapper with word timestamps
├── session_state.py  # Per-session audio ring buffer and state container
├── main.py           # FastAPI WebSocket server & Prometheus metrics
└── Dockerfile        # CUDA 12.1 runtime image
```

### 2.1 The VAD & Segmentation State Machine (`segmenter.py`)
```
                     speech_prob > 0.5 for 2 frames
          ┌──────────────────────────────────────────────────┐
          ▼                                                  │
     ┌──────────┐                                      ┌───────────┐
     │   IDLE   │                                      │  SPEECH   │
     └──────────┘                                      └─────┬─────┘
          ▲                                                  │
          │      silence_run >= 500ms (hangover)             │
          │  OR segment_duration >= 18000ms (forced cut)     │
          └──────────────────────────────────────────────────┘
```
1. **Preroll Window (200ms)**: Speech starts slightly before VAD confidence crosses 0.5. The segmenter retains a ring buffer of the preceding 200ms to avoid clipping word onsets.
2. **Hangover (500ms)**: Brief natural pauses between words (e.g. 200–400ms) do not terminate the utterance.
3. **Max Length Cut (18000ms)**: Prevents runaway utterances from causing GPU OOM or unbounded latency during continuous speech.

### 2.2 LocalAgreement-n Stabilization (`stabilizer.py`)
Streaming Whisper on a growing audio buffer produces shifting hypotheses as more context arrives. If unmanaged, this causes text on screen to constantly rewrite itself (flicker).

`LocalAgreement-n` maintains a rolling window of the last `n` hypotheses (default `n=2`):
```python
# Hypotheses across consecutive 500ms runs:
Run 1: "すみません、"
Run 2: "すみません、駅は"
Run 3: "すみません、駅はどこ"

# Longest Common Prefix across last n=2 runs:
LCP(Run 2, Run 3) = "すみません、駅は"
```
- **Committed**: `"すみません、駅は"` is locked and guaranteed never to change.
- **Partial**: `"どこ"` is emitted as speculative grey text.
- **Audio Trimming**: The audio buffer up to the timestamp of `"駅は"` is trimmed, preventing memory growth over long speech.

---

## 3. How It Connects to Other Components

```
                ┌─────────────────────────┐
                │     Gateway Service     │
                │        (gateway/)       │
                └────────────┬────────────┘
                             │
     ws://:8001/stream       │ 1. { type: "session_start", sessionId, srcLang }
  (Persistent Per Session)   │ 2. Continuous Binary PCM Audio Frames (Offset 13..)
                             ▼
                ┌─────────────────────────┐
                │       STT SERVICE       │
                │     (services/stt/)     │
                └────────────┬────────────┘
                             │
                             │ Emits JSON Results
                             ├─────────────────────────────────────────┐
                             ▼                                         ▼
                 { type: "partial", ... }                  { type: "final", ... }
                 (Every ~500ms while speaking)             (On silence hangover)
                             │                                         │
                             ▼                                         ▼
                     Forwarded to Client                      Forwarded to Client
                     for live captions                         AND dispatched to MT
```

- **Upstream**: Accepts a persistent WebSocket connection from the **Gateway** for each client session.
- **Downstream**: Emits `partial` and `final` JSON messages back to the Gateway. The Gateway forwards `partial` directly to the client, and automatically routes `final` to the MT service.
- **Metrics**: Scraped by Prometheus on `http://:8001/metrics`.

---

## 4. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `STT_HOST` | `0.0.0.0` | Bind host |
| `STT_PORT` | `8001` | Listening port |
| `STT_MODEL_SIZE` | `large-v3-turbo` | Faster-whisper model checkpoint |
| `STT_DEVICE` | `cuda` | Hardware target (`cuda` or `cpu`) |
| `STT_COMPUTE_TYPE`| `float16` | Quantization / compute precision (`float16` or `int8`) |
| `LOCAL_AGREEMENT_N`| `2` | Number of consecutive runs required to lock text |
| `MIN_CHUNK_MS` | `500` | Inference cadence for streaming partials (ms) |
| `VAD_THRESHOLD` | `0.5` | Speech confidence probability threshold |
