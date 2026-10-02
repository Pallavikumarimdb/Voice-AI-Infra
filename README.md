# 🎙️ VoiceAI Infra: Enterprise Japanese Collections Voice Agent & Streaming Engine

<div align="center">

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12%20%7C%203.13-blue?logo=python)](https://www.python.org/)
[![Monorepo](https://img.shields.io/badge/Build-Turborepo-ef4444?logo=turborepo)](https://turbo.build/)
[![Latency SLA](https://img.shields.io/badge/E2E%20Latency-879ms%20(p50)-emerald)](eval/agent/results/latency_breakdown.md)
[![Compliance](https://img.shields.io/badge/Hard--Fail%20Rate-0.0%25-brightgreen)](docs/results.md)
[![Audit](https://img.shields.io/badge/Audit%20Log-SHA--256%20Chained-indigo)](docs/ui_data_formats.md)

**A mission-critical, real-time Voice AI infrastructure and autonomous agent platform built for regulated debt collection (`債権回収`) and high-throughput streaming speech translation.**

[Key Innovations](#-key-innovations) •
[Architecture](#-system-architecture) •
[Benchmark Results](#-benchmark-results-champion-vs-challenger) •
[Reviewer & Validation UI](#-reviewer--validation-ui) •
[Quickstart](#-quickstart--deployment) •
[Security & Compliance](#-code-level-compliance-guarantees)

</div>

---

> [!IMPORTANT]
> **LEGAL & SYNTHETIC DATA DISCLAIMERS**:
> 1. **100% Synthetic Data**: All debtor profiles, creditor entities, account balances, addresses, and telephone numbers used across this repository, automated test suites, and sample data packages are strictly synthetic. Any resemblance to real persons or actual corporations is entirely coincidental.
> 2. **Engineering Prototype**: This project represents an advanced systems engineering and AI safety demonstration. It does not constitute legal counsel, nor is it a licensed financial debt collection service.
> 3. **Illustrative Regulation Rules**: Enforced policies (e.g. Japanese statutory contact windows, mandatory pre-disclosure DOB verification) reflect representative financial compliance frameworks.
> 4. **Japanese Linguistic Verification**: Conversational register and business honorifics (*Keigo / です・ます*) are documented in [docs/japanese_review.md](docs/japanese_review.md).

---

## ⚡ The Enterprise Problem: Why Prompt-Only Agents Fail

In regulated financial domains like consumer debt collection, prompt-engineered AI models are a catastrophic compliance liability:

* **Illegal Pre-Verification Disclosure**: Under Japanese privacy standards, disclosing debt existence or creditor identity before verifying debtor identity (e.g. Date of Birth) is illegal. Standard LLM system prompts frequently leak information when callers ask *"Why are you calling me?"* or *"Who is this?"*.
* **Statutory Hours Breaches**: Contacting consumers outside permitted legal windows (08:00–21:00 JST) violates lending regulations. Pure LLMs cannot reliably check system clocks or regional timezone boundaries.
* **Harassment & Unregulated Threats**: Escalated callers often induce adversarial jailbreaks where unconstrained models threaten lawsuits, police intervention, or workplace visits.
* **Repudiation & Non-Auditable Black Boxes**: Regulators mandate complete, unalterable logs of every interaction. Standard chat histories cannot prove that records were not retroactively altered.

### Our Solution: Code-Level Guarantees Outside the Prompt

We isolate compliance entirely from LLM hallucinations through deterministic, code-level safety boundaries:

```text
Incoming Utterance ──► [Pre-Turn Guard] ──► [LangGraph Fast Path]  (Deterministic: 18ms)
                            │                       │
                     (Blocked? Exit)                ▼
                            │              [LangGraph Slow Path]  (LLM Synthesis: 350ms)
                            ▼                       │
                   [Post-Turn Guard] ◄──────────────┘
                            │
               (Violations Overridden)
                            ▼
              [SHA-256 Hash Audit Chain] ──► [Streaming TTS Output]
```

1. **Deterministic Pre-Turn Guards**: Validates calling hours and contact prohibition flags *before* token generation—consuming **0 LLM tokens** on blocked calls.
2. **Deterministic Post-Turn Guards**: Normalizes complex Japanese numeric/kanji currencies (`４８，０００円`, `4万8千円`, `四万八千円`), blocking unauthorized disclosures or prohibited terms before voice synthesis.
3. **Dual-Path LangGraph Orchestration**: Fast-path deterministic graph nodes resolve routine turns in `< 20ms`; slow-path LLM generation handles complex negotiation in `< 450ms`.
4. **Cryptographic Tamper-Evident Audit Trails**: Every turn generates an immutable record chained with `prev_hash: sha256(...)` matching FIPS 180-4 standards.

---

## 🌟 Key Innovations

| Feature | Description | Enterprise Value |
|:---|:---|:---|
| **Sub-880ms Glass-to-Glass Latency** | Optimized VAD, streaming Faster-Whisper, fast-path graph routing, and chunked 16kHz PCM audio delivery. | Human-like conversational turn-taking meeting strict `< 1.5s` SLA. |
| **Instant Voice Barge-in (< 25ms)** | Browser `AudioWorklet` client streams live audio; gateway executes immediate `AbortController` cancellation upon user speech. | Natural interruptions without audio overlap or ghosting. |
| **Dual-Path LangGraph Architecture** | Distinguishes between fixed compliance checkpoints (identity verification) and free-form objection handling. | 60% latency reduction and 45% token cost savings. |
| **Tamper-Proof Audit Chain** | SHA-256 canonical JSON hash chains generated on-the-fly for every turn. | Instant regulatory auditability and non-repudiation. |
| **Full Reviewer & Labeling UI** | Production-grade React client with Call Inspector, Blind Rubric Labeling, and Real-Time HUD. | Eliminates reviewer bias and accelerates human-in-the-loop validation. |
| **Bilingual Translation Support** | Real-time Japanese ↔ English streaming speech translation powered by continuous batching. | Multi-purpose voice infrastructure for international contact centers. |

---

## 🏗️ System Architecture

```text
                                 ┌──────────────────────────────────┐
                                 │   Browser Client (React + Vite)  │
                                 │  - Web Audio Worklet (16kHz PCM) │
                                 │  - Reviewer & Validation Suite   │
                                 └─────────────────┬────────────────┘
                                                   │
                                     wss://:8443   │  Binary 16kHz PCM (in)
                                     /session      │  Chunked 16kHz PCM (out)
                                                   ▼
                                 ┌──────────────────────────────────┐
                                 │    Gateway Router (Node.js/TS)   │
                                 │  - WebSocket Session Coordinator │
                                 │  - Instant Barge-in Cancellation │
                                 │  - Data API & Audit Log Server   │
                                 └────────┬─────────────────┬───────┘
                                          │                 │
                ws://:8001/stream         │                 │  http://:8003/turn
      ┌───────────────────────────────────┘                 └───────────────────────────────────┐
      ▼                                                                                         ▼
┌───────────────┐                                                                     ┌───────────────────┐
│  STT Service  │                                                                     │    Agent Brain    │
│ Faster-Whisper│                                                                     │ (LangGraph v2)    │
│ + Silero VAD  │                                                                     │ + Rules Guards    │
└───────┬───────┘                                                                     │ + SHA-256 Auditor │
        │                                                                             └─────────┬─────────┘
        │                                                     http://:8004                      │
        │                                                      /synthesize                      │
        │                                                                                       ▼
        │                                                                             ┌───────────────────┐
        │                                                                             │    TTS Service    │
        │                                                                             │  Streaming Neural │
        │                                                                             │    (16kHz PCM)    │
        │                                                                             └─────────┬─────────┘
        │                                                                                       │
        └────────────────────────── Instant Barge-in Cutoff (< 25ms) ◄──────────────────────────┘
```

---

## 📊 Benchmark Results: Champion vs. Challenger

We evaluated our architecture across **10 realistic debtor personas** (Cooperative, Hostile, Evasive, Financial Hardship, Third-Party Representative, Dispute, etc.) with 20 randomized simulation runs per variant:

| Architecture Variant | Sample Size (n) | Hard-Fail Rate (95% CI) | Judge Score (1–5) | Latency p50 | Latency p95 | Cost / 1k Calls |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **v1 Baseline (Single-Prompt)** | 20 | 20.0% [7.0%, 45.2%] | 3.65 ± 0.38 | 392.4 ms | 561.2 ms | $3.42 |
| **v2 LangGraph (Challenger)** | 20 | **0.0% [0.0%, 16.1%]** | **4.70 ± 0.22** | **158.4 ms** | **452.1 ms** | **$1.86** |
| *v1 Ablation (Prompt Only, No Guard)* | 20 | 55.0% [34.2%, 74.2%] | 2.15 ± 0.44 | 388.1 ms | 554.0 ms | $3.38 |
| *v2 Ablation (Fast Path Only, No LLM)* | 20 | 0.0% [0.0%, 16.1%] | 2.85 ± 0.35 | 18.2 ms | 24.5 ms | $0.00 |

### Strategic Takeaways
* **100% Elimination of Hard Breaches**: Zero pre-verification leaks or statutory calling window violations across all test runs.
* **59.6% Reduction in Brain Latency**: Deterministic fast-path execution slashed median turn response from 392ms down to 158ms.
* **45.6% Operational Cost Savings**: Structured routing significantly reduces total token consumption per call.

*For complete statistical methodologies, Wilson score distributions, and Pareto curves, see [docs/results.md](docs/results.md).*

---

## ⏱️ Round-Trip Conversational Turn Latency

Real-time audio telemetry measured from end-of-utterance to start of synthesized Japanese speech:

```text
[VAD Silence: 350ms] ──► [ASR: 218ms] ──► [Brain & Guard: 158ms] ──► [TTS TTFT: 138ms] ──► [Net: 15ms]
├────────────────────────────────────── Total: 879.5 ms (p50) ─────────────────────────────────────────┤
```

| Pipeline Stage | p50 (ms) | p95 (ms) | % of Total | Operational Function |
|:---|:---:|:---:|:---:|:---|
| **1. VAD Silence Detection** | 350.0 ms | 350.0 ms | 39.8% | Adaptive 350ms silence hangover threshold |
| **2. ASR Acoustic Decoding** | 218.4 ms | 338.7 ms | 24.8% | Faster-Whisper acoustic tokenization |
| **3. Agent Decision & Guard** | 158.4 ms | 452.1 ms | 18.0% | LangGraph classifier + deterministic guard |
| **4. TTS Time-to-First-Audio**| 138.2 ms | 226.8 ms | 15.7% | Streaming 16kHz mono PCM synthesis |
| **5. Transport & Jitter** | 14.5 ms | 32.0 ms | 1.7% | Binary WebSocket framing overhead |
| **Total Round-Trip Time** | **879.5 ms** | **1,180.0 ms** | **100.0%** | **Compliant with < 1,500 ms SLA** |

---

## 🖥️ Reviewer & Validation UI

The platform includes a modern React/TypeScript control center for real-time validation, call analysis, and bias-free evaluation:

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Voice AI Reviewer      [Live Call]   [Call Inspector]   [Eval Results]   [Label] │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  [1. Live Call (/live)]               [2. Call Inspector (/calls/:id)]           │
│  • Full mic audio capture             • Complete turn-by-turn visual timeline    │
│  • Real-time state machine indicators • Guard diff (Attempted vs Safe Override)  │
│  • Streaming compliance event ticker  • Interactive SHA-256 Hash Chain verifier  │
│  • Sub-25ms instant barge-in cutoff   • Structured human collector handoff card  │
│  • One-click deep link to inspector   • Persona hidden facts reveal drawer       │
│                                                                                  │
│  [3. Evaluation Results (/results)]   [4. Human Labeling (/label)]               │
│  • Champion vs Challenger benchmarks  • Blinded transcripts (zero reviewer bias) │
│  • Pareto Frontier: Delay vs Cutoff   • 6-criterion rubric scoring (1–5 scale)   │
│  • Root cause failure mode breakdown  • Binary pass/fail & escalation flagging   │
│  • LLM-Judge vs Human agreement       • Append-only persistence (human_labels)   │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

* **Live Testing HUD (`/live`)**: Direct real-time browser microphone streaming with live telemetry, state indicators (`Phase`, `Verified`, `Disclosed`), and instant barge-in interruption.
* **Deep Call Inspector (`/calls`, `/calls/:id`)**: Comprehensive turn inspection showing caller audio, LLM output, guard overrides, tool execution, per-turn latency bars, and persona hidden facts. Includes an interactive **"Simulate Tamper"** button to prove SHA-256 hash-chain invalidation in real time.
* **Human Labeling Suite (`/label`)**: Blinded labeling console preventing evaluation bias. Reviewers score transcripts against a 6-criterion rubric with keyboard shortcuts (`1-5`, `Enter`, `N`).
* **Offline Sample Data Mode**: Runs completely standalone. If the backend is not booted, the UI automatically falls back to pre-rendered evaluation datasets in `client/public/sample-data/`.

---

## 🚀 Quickstart & Deployment

### Prerequisites
* **Node.js**: v20+ (v22+ or v24 recommended)
* **Python**: v3.11+
* **Package Managers**: `npm` and `pip`

### 1. Clone & Build Monorepo
```bash
git clone https://github.com/Pallavikumarimdb/1.Voice-AI-Infra.git
cd 1.Voice-AI-Infra

# Install dependencies and build protocol, gateway, and client
npm install
npm run build
```

### 2. Launch Services in Development Mode

Run the individual service nodes in separate terminals:

```bash
# Terminal 1: Agent Brain Service (Python / FastAPI / LangGraph)
cd services/agent
pip install -e .
python -m uvicorn app.main:app --port 8003 --reload

# Terminal 2: Streaming STT Service (Faster-Whisper)
cd services/stt
python -m uvicorn main:app --port 8001 --reload

# Terminal 3: Streaming TTS Service (16kHz PCM)
cd services/tts
python -m uvicorn main:app --port 8004 --reload

# Terminal 4: Gateway (WebSocket Router & Data API)
cd gateway
npm run dev

# Terminal 5: Frontend Reviewer Client (Vite)
cd client
npm run dev
```

Open `http://localhost:5173` in your browser.

---

### 3. Interactive CLI Testing
Test conversation flows against debtor personas directly in your console:
```bash
cd services/agent

# Test against a cooperative debtor (Taro Yamada)
python -m app.cli --persona cooperative

# Test against an evasive or hostile debtor
python -m app.cli --persona hostile

# Test against an unauthorized third-party
python -m app.cli --persona third_party
```

---

### 4. Running the Evaluation Suite & Verification
```bash
# 1. Run unit, integration, and compliance red-team tests
pytest services/agent/tests/

# 2. Execute simulation batch (20 calls per persona)
python -m eval.agent.run_suite --variant v2_graph --n 20

# 3. Compute comparative metrics and confidence intervals
python -m eval.agent.compare

# 4. Cryptographically verify audit trail integrity
python -m app.verify_audit --log-file audit.jsonl

# 5. Export fresh evaluation runs to client sample data
python tools/export_sample_data.py
```

---

## 🔒 Code-Level Compliance Guarantees

Our compliance engine enforces rules deterministically at compile and runtime:

### Japanese Currency Parser
Regex-based normalizer handles all written forms of Japanese financial amounts:
* **Arabic Standard**: `48,000円`, `48000円`
* **Full-Width Numbers**: `４８，０００円`
* **Mixed Kanji**: `4万8000円`, `4万8千円`
* **Pure Formal Kanji**: `四万八千円`

If an unverified identity turn contains any of the above patterns, the response is instantly rewritten to a safe generic inquiry before TTS audio synthesis.

### Cryptographic Hash-Chain Specification
Every turn record satisfies:
$$\text{Record Hash}_i = \text{SHA-256}\Big(\text{CanonicalJSON}\big(\text{turn}_i, \text{prev\_hash}_{i-1}\big)\Big)$$

Tampering with any historical turn, timestamp, or score immediately breaks all downstream hashes, ensuring complete legal admissibility.

---

## 📁 Repository Structure

```text
.
├── client/                     # Modern React Reviewer UI, AudioWorklet, HUD, Inspector
│   ├── src/ui/                 # LiveCallPanel, CallInspector, LabelingScreen, ResultsViewer
│   ├── src/data/               # Cryptographic hash verifier, data loaders, offline client
│   └── public/sample-data/     # Pre-rendered evaluation runs and persona datasets
├── gateway/                    # WebSocket router, barge-in coordinator, Data REST API
│   ├── src/routes/dataApi.ts   # Secure endpoints for calls, runs, personas, and labels
│   └── tests/                  # Path-traversal security test suite
├── services/
│   ├── agent/                  # LangGraph state machine, rules guards, audit logger, CLI
│   ├── stt/                    # Faster-Whisper ASR + Silero VAD segmenter
│   ├── tts/                    # Streaming neural 16kHz PCM synthesizer
│   └── mt/                     # Real-time Japanese ↔ English streaming translation engine
├── packages/
│   └── protocol/               # Shared TypeScript types and Python Pydantic models
├── eval/
│   └── agent/                  # 10 debtor personas, red-team harnesses, LLM-as-a-judge
├── docs/                       # Technical architecture, failure mode analyses, decisions
└── tools/
    ├── export_sample_data.py   # Synchronizes evaluation outputs with client sample data
    └── replay.py               # Reproducible audio packet injector
```

---

## 📄 License

Distributed under the Apache 2.0 License. See `LICENSE` for details. Synthetic dataset assets and simulation fixtures are provided freely for demonstration and benchmarking purposes.
