# Observability Stack (`observability/`)

Real-time telemetry, stage-boundary latency tracking, and queue monitoring powered by **Prometheus** and pre-configured **Grafana** dashboards.

---

## 1. What This Component Does

- **Time-Series Metric Scraping**: Automatically polls the Gateway, STT service, and MT service every 2 seconds. (The Agent `:8003` and TTS `:8004` services also expose `/metrics`, but are not yet in `prometheus.yml` — see gap note below.)
- **Stage-Boundary Latency Histograms**: Tracks p50, p90, and p95 latencies across capture-to-partial, capture-to-final, and final-to-translated boundaries.
- **Backpressure & Queue Monitoring**: Visualizes `gateway_queue_depth` and `gateway_audio_dropped_frames_total` in real-time, providing immediate visual feedback when concurrency exceeds system capacity.
- **Inference Telemetry**: Graphs STT chunk inference times and vLLM Time-To-First-Token (TTFT) and decode durations.

---

## 2. Directory Layout & Architecture

```
observability/
├── prometheus.yml                  # Scrape configurations for all pipeline services
└── grafana/
    └── dashboards/
        └── voice_translation_pipeline.json # Pre-built dashboard definition
```

### 2.1 Prometheus Metrics Exposed Across the Pipeline

| Metric Name | Type | Exposed By | Description |
| :--- | :--- | :--- | :--- |
| `active_sessions` | Gauge | Gateway | Number of currently connected client sessions |
| `gateway_audio_dropped_frames_total` | Counter | Gateway | Audio frames dropped by drop-oldest backpressure |
| `gateway_queue_depth` | Gauge | Gateway | Buffered depth (bytes) for STT and MT pipelines |
| `e2e_latency_seconds` | Histogram | Gateway | Latencies across stage boundaries |
| `mt_request_duration_seconds` | Histogram | Gateway | Wall-clock time spent making MT HTTP requests |
| `stt_asr_duration_seconds` | Histogram | STT Service | Time spent running Whisper ASR inference per chunk |
| `stt_vad_duration_seconds` | Histogram | STT Service | Time spent running Silero VAD frame evaluation |
| `mt_ttft_seconds` | Histogram | MT Service | vLLM Time-To-First-Token generation latency |
| `mt_decode_seconds` | Histogram | MT Service | Time spent generating remaining output tokens |
| `agent_turn_latency_seconds` | Histogram | Gateway | Agent turn round-trip by stage |
| `agent_compliance_blocks_total` | Counter | Gateway | Compliance guard interceptions by rule |
| `agent_escalations_total` | Counter | Gateway | Escalations by reason |
| `agent_calls_total` | Counter | Gateway | Agent calls by outcome |
| `agent_llm_tokens_total` | Counter | Gateway | LLM tokens by direction |
| `tts_first_audio_seconds` | Histogram | Gateway | TTS time-to-first-audio |
| `turn_end_to_agent_audio_seconds` | Histogram | Gateway | Final-to-agent-audio delay |

> **Gap**: `prometheus.yml` scrapes Gateway (`:8443`), STT (`:8001`), and MT (`:8002`) only. Agent (`:8003/metrics`) and TTS (`:8004/metrics`) export metrics but have no scrape jobs yet — add them to get full coverage.

---

## 3. How It Connects to Other Components

```
   ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
   │    Gateway     │         │      STT       │         │       MT       │
   │  (:8443/metrics)│         │  (:8001/metrics)│         │  (:8002/metrics)│
   └───────┬────────┘         └───────┬────────┘         └───────┬────────┘
           │                          │                          │
           └──────────────────────────┼──────────────────────────┘
                                      │
                                      ▼ Scrapes every 2s
                         ┌─────────────────────────┐
                         │   Prometheus (:9090)    │
                         └────────────┬────────────┘
                                      │
                                      ▼ Queries metrics
                         ┌─────────────────────────┐
                         │     Grafana (:3000)     │
                         │   Real-Time Dashboard   │
                         └─────────────────────────┘
```

- **Prometheus** runs as a container on port `9090`, scraping `/metrics` endpoints across all containers on the Docker bridge network `voice-net`.
- **Grafana** automatically provisions the `voice_translation_pipeline.json` dashboard on port `3000`, connecting to Prometheus as its default data source.

---

## 4. Viewing the Dashboard

1. Launch the stack:
   ```bash
   npm run dev:docker
   ```
2. Navigate to `http://localhost:3000`.
3. Log in with `admin` / `admin`.
4. Open the **"Streaming Voice Translation Pipeline - Realtime Telemetry"** dashboard.
