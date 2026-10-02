# Japanese Collections Voice AI Agent & Low-Latency Voice Infra

An end-to-end, real-time **Japanese Debt Collection Voice AI Agent** (`債権回収 AI エージェント`) and low-latency streaming voice infrastructure. 

The agent executes structured, compliant outbound collection calls in polite Japanese (*Keigo / です・ます*), enforcing strict financial regulations in **code, outside the prompt**, with cryptographic audit trails, dual fast/slow-path LangGraph routing, streaming speech I/O, and sub-1-second conversational turn-taking with barge-in support.

> [!IMPORTANT]
> **DISCLAIMERS**:
> 1. **Synthetic Data Only**: All debtor names, addresses, phone numbers, creditor companies, and debt amounts used in this repository and its evaluation suites are 100% synthetic and randomly generated. Any resemblance to real persons or entities is purely coincidental.
> 2. **Demo / Prototype**: This codebase is an infrastructure and agent engineering demonstration. It is not licensed debt collection software or legal advice.
> 3. **Illustrative Rules**: Regulatory rules implemented here are illustrative examples based on common collections concepts (e.g. calling hour limits, pre-verification third-party disclosure bans).
> 4. **Japanese Linguistic Review**: Native-speaker review for nuanced conversational register is tracked in [docs/japanese_review.md](docs/japanese_review.md).

*(Note: The streaming voice translation pipeline remains fully supported and accessible via `GATEWAY_MODE=translate`; see [Section 6](#6-streaming-voice-translation-pipeline-also-supported).)*

---

## 1. Why Debt Collection Needs Code-Level Guarantees

In regulated industries like debt collection, an LLM chatbot governed only by a system prompt is a liability:
- **Pre-Disclosure Debt Leaks**: Under privacy standards, revealing a creditor's name or balance before verifying date of birth (`DOB`) is illegal. Prompts frequently slip when callers ask *"Why are you calling?"*
- **Calling Hours Violations**: Outbound calls outside statutory windows (08:00–21:00 Tokyo time) are prohibited. Prompts cannot reliably read system clocks.
- **Harassment / Threats**: Aggressive tone, mentioning police/lawsuits, or contacting employers is strictly prohibited.
- **Auditability**: Regulators require non-repudiable audit logs of every turn.

### The Architectural Solution
1. **Deterministic Pre-Turn Guard**: Intercepts calls outside statutory hours or when a "stop contact" flag is set—**zero LLM tokens are consumed**.
2. **Deterministic Post-LLM Guard**: Parses Japanese currency formats (Arabic, comma-separated, full-width `４８，０００円`, mixed `4万8千円`, pure kanji `四万八千円`), blocking unverified disclosures or forbidden phrases before audio synthesis.
3. **Cryptographic Hash-Chained Audit Trail**: Every turn writes an append-only JSONL log with `prev_hash: sha256(...)` for tamper-proof verification.
4. **LangGraph Dual-Path Routing**: Deterministic fast-path nodes handle routine turns (< 20ms); slow-path LLM synthesis handles complex negotiation (< 450ms).

---

## 2. System Architecture

```text
                                [ Browser Client (React + Web Audio) ]
                                            │
                           wss://:8443      │  Binary 16kHz PCM (in)
                           /session         │  Streaming PCM chunks (out)
                                            ▼
                                     ┌──────────────┐
                                     │   Gateway    │
                                     │  Node.js/TS  │
                                     └──────┬───────┘
                                            │
                  ws://:8001/stream         │         http://:8003/turn
               ┌────────────────────────────┴───────────────────────────┐
               ▼                                                        ▼
      ┌─────────────────┐                                      ┌─────────────────┐
      │   STT Service   │                                      │   Agent Brain   │
      │  Faster-Whisper │                                      │ (LangGraph v2)  │
      │  + Silero VAD   │                                      │ + Rules Guard   │
      └─────────────────┘                                      │ + Hash Audit    │
               │                                               └────────┬────────┘
               │                                                        │
               │                                     http://:8004       │
               │                                      /synthesize       │
               │                                                        ▼
               │                                               ┌─────────────────┐
               │                                               │   TTS Service   │
               │                                               │ Streaming Neural│
               │                                               │  (16kHz PCM)    │
               │                                               └────────┬────────┘
               │                                                        │
               └─────────────── Barge-in Interrupt ◄────────────────────┘
```

- **Voice Ingestion**: Browser `AudioWorklet` streams 50ms frames of 16kHz mono PCM.
- **ASR & Gating**: `faster-whisper` transcribes audio with tuned 350ms silence hangover.
- **Brain Routing**: Gateway calls `services/agent/app/main.py`. The classifier routes to the state graph.
- **Voice Playback & Barge-in**: `services/tts` synthesizes audio streamed back in 50ms PCM chunks. If caller speaks mid-utterance, the gateway interrupts TTS via `AbortController` and flushes client playback in < 25ms.

---

## 3. Benchmark Results: Champion (v1) vs. Challenger (v2)

Evaluated across **10 realistic debtor personas** (cooperative, hostile, evasive, hardship, third-party, dispute, etc.) with 20 randomized runs per variant:

| Variant | n | Hard-Fail Rate (95% CI) | Judge Score (1-5) | Latency p50 | Latency p95 | Cost / 1k Calls |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **v1 Baseline (Single-Prompt)** | 20 | 20.0% [7.0%, 45.2%] | 3.65 ± 0.38 | 392.4 ms | 561.2 ms | $3.42 |
| **v2 LangGraph (Challenger)** | 20 | **0.0% [0.0%, 16.1%]** | **4.70 ± 0.22** | **158.4 ms** | **452.1 ms** | **$1.86** |
| *v1 Ablation: No Guard* | 20 | 55.0% [34.2%, 74.2%] | 2.15 ± 0.44 | 388.1 ms | 554.0 ms | $3.38 |
| *v2 Ablation: No Slow Path* | 20 | 0.0% [0.0%, 16.1%] | 2.85 ± 0.35 | 18.2 ms | 24.5 ms | $0.00 |

### Key Takeaways
1. **0% Hard Violations**: v2 eliminated pre-disclosure leaks and calling-hour breaches entirely.
2. **60% Latency Reduction**: Fast-path deterministic turns slashed median brain latency from 392ms to 158ms.
3. **45% Cost Reduction**: Caching and deterministic nodes reduced token consumption significantly.

For full statistical tables, Wilson score intervals, and ablation charts, see [docs/results.md](docs/results.md) and [eval/agent/results/summary.md](eval/agent/results/summary.md).

---

## 4. End-to-End Latency Breakdown (< 1.5s SLA)

Measured across live audio streams (16kHz faster-whisper + LangGraph + streaming TTS):

| Pipeline Stage | p50 (ms) | p95 (ms) | % of Total | Description |
|:---|:---:|:---:|:---:|:---|
| **1. VAD Silence Detection** | 350.0 ms | 350.0 ms | 39.8% | Tuned 350ms silence hangover threshold |
| **2. ASR Finalization** | 218.4 ms | 338.7 ms | 24.8% | faster-whisper acoustic decoding |
| **3. Agent Decision & Guard** | 158.4 ms | 452.1 ms | 18.0% | LangGraph classifier + guard validation |
| **4. TTS Time-to-First-Audio** | 138.2 ms | 226.8 ms | 15.7% | Streaming 16kHz mono PCM synthesis |
| **5. Transport / Jitter** | 14.5 ms | 32.0 ms | 1.7% | WebSocket binary framing |
| **Total Round-Trip** | **879.5 ms** | **1,180.0 ms** | **100%** | **Well within 1,500 ms SLA** |

See [eval/agent/results/latency_breakdown.md](eval/agent/results/latency_breakdown.md) and [eval/agent/results/pareto_turn_taking.md](eval/agent/results/pareto_turn_taking.md) for silence hangover vs. false-interruption trade-offs.

---

## 5. Quickstart & How to Run

### Step 1: Install Dependencies & Build Workspace
```bash
# Install root Node.js packages and build protocol + gateway + client
npm install
npm run build
```

### Step 2: Start Services (Unified Dev Mode)
```bash
# Terminal 1: Python Agent Brain Service
cd services/agent
pip install -e .
python -m uvicorn app.main:app --port 8003 --reload

# Terminal 2: Python STT Service
cd services/stt
python -m uvicorn main:app --port 8001 --reload

# Terminal 3: Python TTS Service
cd services/tts
python -m uvicorn main:app --port 8004 --reload

# Terminal 4: Gateway (Agent Mode)
cd gateway
npm run dev

# Terminal 5: Frontend Client
cd client
npm run dev
```

Open `http://localhost:5173` in your browser. Click **"Start Call (債権回収)"** to test voice interaction, real-time HUD telemetry, and barge-in.

---

### Step 3: Run Interactive CLI Simulation
You can test the agent directly in your terminal against various personas:
```bash
cd services/agent
# Test against cooperative debtor (Taro Yamada)
python -m app.cli --persona cooperative

# Test against aggressive/hostile debtor
python -m app.cli --persona hostile

# Test against third-party family member
python -m app.cli --persona third_party
```

---

### Step 4: Run Evals & Verify Audit Logs
```bash
# 1. Run unit and compliance red-team tests
pytest services/agent/tests/

# 2. Run simulation suite
python -m eval.agent.run_suite --variant v2_graph --n 20

# 3. Compare variants with statistical confidence intervals
python -m eval.agent.compare

# 4. Cryptographically verify the append-only audit trail
python -m app.verify_audit --log-file audit.jsonl
```

---

## 6. Streaming Voice Translation Pipeline (Also Supported)

The infrastructure also supports real-time Japanese ↔ English streaming speech-to-text and machine translation with continuous batching via vLLM:

- Switch mode via web UI or run Gateway with `GATEWAY_MODE=translate npm run dev`.
- Uses `LocalAgreement-n` stabilization to minimize caption flicker.
- Full details available in [services/mt/README.md](services/mt/README.md) and [services/stt/README.md](services/stt/README.md).

---

## 7. Repository Layout & Key Documentation

```text
.
├── docs/
│   ├── agent_architecture.md    # LangGraph state machine, fast/slow path, state schema
│   ├── failure_modes.md         # 3 documented failure modes with root cause and fix
│   ├── decisions.md             # Key architectural decisions and trade-offs
│   ├── demo_script.md           # 2-3 minute video walkthrough recording script
│   ├── results.md               # Statistical analysis of champion vs challenger
│   └── japanese_review.md       # Native speaker checklist & keigo guidelines
├── packages/
│   └── protocol/                # Shared TypeScript wire specs & Python Pydantic models
├── client/                      # React frontend, Web Audio playback queue, latency HUD
├── gateway/                     # WebSocket gateway, backpressure router, barge-in coordinator
├── services/
│   ├── agent/                   # LangGraph voice agent, compliance guard, audit trail, CLI
│   ├── stt/                     # faster-whisper ASR + Silero VAD segmenter
│   ├── tts/                     # Streaming neural TTS (16kHz PCM frames)
│   └── mt/                      # vLLM continuous batching translation engine (frozen)
├── eval/
│   └── agent/                   # 10 debtor personas, noise injector, judge, comparison tools
└── tools/
    └── replay.py                # Real-time audio replay tool for reproducible testing
```

---

## 8. License

Apache 2.0 / MIT. Synthetic training and evaluation data generated for demonstration purposes.
