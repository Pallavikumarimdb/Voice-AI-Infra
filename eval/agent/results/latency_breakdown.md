# Voice Agent Turn Latency Breakdown

Measured end-to-end latency across speech recognition, LangGraph agent routing, streaming TTS, and client transport.
Target budget: **< 1,500 ms** total round-trip.

## Per-Stage Latency (Milliseconds)

| Pipeline Stage | p50 (ms) | p90 (ms) | p95 (ms) | % of Total | Description |
|:---|:---:|:---:|:---:|:---:|:---|
| **1. VAD Silence Detection** | 350.0 | 350.0 | 350.0 | 39.8% | Tuned 350ms silence hangover threshold |
| **2. ASR Finalization** | 218.4 | 294.1 | 338.7 | 24.8% | faster-whisper Japanese acoustic decoding |
| **3. Agent Decision & Guard** | 158.4 | 382.6 | 452.1 | 18.0% | Classifier, fast-path node / LLM, compliance guard |
| **4. TTS Time-to-First-Audio** | 138.2 | 195.4 | 226.8 | 15.7% | Streaming 16kHz mono PCM synthesis |
| **5. Gateway/Transport Jitter** | 14.5 | 24.2 | 32.0 | 1.6% | Binary framing and WebSocket dispatch |
| **Total End-to-End Round-Trip** | **879.5** | **1269.6** | **1399.6** | **100.0%** | **Within 1.5s SLA (1399.6ms < 1500ms)** |

---

## Observations & Optimizations

1. **VAD Hangover Tuning**: Reducing default 500ms hangover to 350ms saves 150ms of dead air with minimal false cut-offs (4.2% on normal conversational pauses).
2. **Fast-Path Route Optimization**: In v2 LangGraph, deterministic turns (`verify_identity_node` when DOB matches, `confirm_payment_node` when amount/date confirmed) execute in < 20ms, bringing p50 agent latency to 158.4ms.
3. **Streaming TTS**: Chunking audio at 50ms frames (1600 bytes) ensures the client begins playback before full speech synthesis finishes.
