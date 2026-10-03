# MT Service (`services/mt/`)

A stateless, GPU-accelerated machine translation service implemented in **Python, FastAPI, and vLLM**, utilizing **continuous batching** via `AsyncLLMEngine` to saturate GPU compute under concurrent load.

---

## 1. What This Component Does

- **Stateless HTTP Translation**: Exposes `POST /translate`, taking an utterance, source/target languages, and a rolling context window of preceding utterances.
- **Continuous Batching with vLLM**: Batches incoming requests from all active sessions at the iteration level inside `AsyncLLMEngine`. No request waits for an in-progress sentence to finish before joining the GPU batch.
- **Honest Unavailability**: vLLM requires a CUDA GPU. Without one, the engine refuses to start and `POST /translate` returns `503 Translation engine unavailable` — the service never fabricates translations or latency numbers. The gateway surfaces this as `MT_UNAVAILABLE`.
- **Solving the Multiprocessing Bottleneck**: Replaces naive multi-process architectures (which spawn multiple model copies that contend for GPU VRAM and context-switch) with a single engine process that maximizes GPU tensor core utilization.
- **Terse System Contract**: Formats prompts to enforce zero preamble, no conversational filler, and exact preservation of proper nouns and digits to minimize decode token latency.
- **Latency Telemetry**: Tracks and records Time-To-First-Token (TTFT) and decode duration histograms on Prometheus.

---

## 2. Internal Architecture & Key Modules

```
services/mt/
├── prompt.py        # System prompt formatting with 3-sentence rolling context
├── engine.py        # AsyncLLMEngine wrapper with continuous batching (raises when no GPU; no mock)
├── main.py          # FastAPI HTTP endpoints (POST /translate, GET /metrics, GET /health)
└── Dockerfile       # vLLM container runtime image (Linux-only: vLLM has no Windows support)
```

### 2.1 The Terse Prompt Contract (`prompt.py`)
In real-time translation, **generation latency is directly proportional to output token count**. Standard conversational LLM preambles (`"Sure! The translation is: ..."`) waste 50–200ms of decode time.

```python
SYSTEM = """Translate {src} to {tgt}. Output ONLY the translation.
No preamble, no quotes. Preserve numbers and proper nouns exactly."""

def build_prompt(text: str, src: str, tgt: str, context: list[str]) -> str:
    ctx = "\n".join(context[-3:]) if context else "(None)"
    return f"{SYSTEM.format(src=src, tgt=tgt)}\n\nContext:\n{ctx}\n\nTranslate:\n{text}"
```

### 2.2 Why MT Is Stateless While STT Is Stateful
- **STT must be stateful** because it accumulates audio frames and maintains acoustic context over the lifetime of a speech utterance.
- **MT is stateless** because translation is a pure function:
  $$f(\text{utterance}, \text{context}, \text{src\_lang}, \text{tgt\_lang}) \rightarrow \text{translation}$$
- By keeping the MT service stateless with a standard async HTTP endpoint, **vLLM's scheduler sees every session's requests concurrently**. It batches them together dynamically without needing per-client WebSocket connections.

---

## 3. How It Connects to Other Components

```
                    ┌─────────────────────────┐
                    │     Gateway Service     │
                    │        (gateway/)       │
                    └────────────┬────────────┘
                                 │
     POST /translate             │ Asynchronous HTTP Call
     { uttId, text, context }    │ (Non-blocking continuation)
                                 ▼
                    ┌─────────────────────────┐
                    │       MT SERVICE        │
                    │     (services/mt/)      │
                    │   vLLM AsyncLLMEngine   │
                    └────────────┬────────────┘
                                 │
     HTTP 200 OK                 │ Continuous Batching
     { translation, ttft_ms }    │ Iteration-level scheduling
                                 ▼
                    ┌─────────────────────────┐
                    │     Gateway Service     │
                    │  (Forward to Client WS) │
                    └─────────────────────────┘
```

| Route | Method | Payload | Description |
| :--- | :--- | :--- | :--- |
| `/translate` | `POST` | `{ uttId, text, srcLang, tgtLang, context }` | Main translation endpoint |
| `/health` | `GET` | — | Health check indicating model status |
| `/metrics` | `GET` | — | Prometheus metrics (`mt_ttft_seconds`, `mt_decode_seconds`) |

---

## 4. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MT_HOST` | `0.0.0.0` | Bind host |
| `MT_PORT` | `8002` | Listening port |
| `MT_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | Hugging Face model repository or local path |
| `MT_DTYPE` | `float16` | Model weights precision (`float16` or `bfloat16`) |
| `MT_GPU_MEMORY_UTILIZATION` | `0.85` | Fraction of GPU VRAM allocated to vLLM KV cache |
| `MT_MAX_NUM_SEQS` | `64` | Maximum number of concurrent sequences in a batch |
