# Architecture & Technical Decisions Record (ADR)

This document logs key design and implementation decisions made during the construction of the Japanese Collections Voice Agent.

---

## ADR-001: Separation of STT, Gateway, and Agent Brain

- **Context**: The existing monorepo has a stateful streaming WebSocket STT pipeline (VAD + faster-whisper + LocalAgreement-n) and a frozen MT service.
- **Decision**: Introduce a discrete Brain contract (`BrainRequest` and `BrainResponse`) in `@voice/protocol`. The Gateway maintains persistent WebSockets to the client and STT, and dispatches stabilized transcripts to `services/agent` via HTTP `/turn`.
- **Rationale**: Keeps the speech layer decoupled from conversational logic, allowing independent scaling, testing, and replacement of agent graph backends without touching low-level audio sockets.

---

## ADR-002: Code-Enforced Compliance Guard (Outside Prompts)

- **Context**: Japanese debt collection requires strict compliance with calling hours, debtor privacy, third-party non-disclosure, and term limits. LLM prompt compliance is stochastic and prone to jailbreaks.
- **Decision**: Implemented `services/agent/app/compliance/guard.py` with pre-turn and post-LLM checkpoints using regex, kanji number normalization, and an injectable clock.
- **Rationale**: Ensures determinism. Even if a model or attacker tries to leak amounts pre-verification or exceed approved terms, the guard intercepts and replaces the utterance with a compliant template.

---

## ADR-003: LangGraph for Conversation Graph (Challenger v2) vs Single-Prompt Baseline (Champion v1)

- **Context**: Measuring the value of conversational state management requires an honest champion/challenger comparison.
- **Decision**: Built `v1_baseline` (single system prompt, full history, identical tools and guard) and `v2_graph` (LangGraph state machine with discrete nodes for greet, verify, disclose, discover, negotiate, capture_promise, and side exits).
- **Rationale**: Enables direct statistical evaluation of hard-fail rate, promise capture, and conversational flow between graph-based state control and single-prompt prompting.

---

## ADR-004: Default Model and Disk-Level Caching

- **Context**: Evaluations across 10 personas with multiple seeds could incur unpredictable latency and API costs.
- **Decision**: Used `gpt-4o-mini` as the default model tier, backed by SHA256 prompt-hash disk caching in `.llm_cache/`, and budget-limiting `--max-usd` and `--max-calls` flags.
- **Rationale**: Provides fast, reproducible, and cost-controlled simulation runs that run deterministically in CI without external spending surprises.

---

## ADR-005: Cryptographic Hash Chain for Audit Logs

- **Context**: Regulatory audits require tamper-evident records of what the debtor heard and what the model attempted.
- **Decision**: Each call produces an append-only JSONL log where each entry contains a SHA-256 `hash` computed over its content plus the `prev_hash` of the preceding record, verifiable via `verify_audit.py`.
- **Rationale**: Provides mathematical proof of log integrity and auditability.
