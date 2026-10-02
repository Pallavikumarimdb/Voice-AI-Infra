# Japanese Debt Collections Voice Agent - Architecture & Design

## 1. System Overview

The system adds a production-disciplined **Japanese debt-collection voice agent** to a streaming polyglot monorepo. It features:
- **Low-Latency Streaming Gateway (Node/TS)**: Dispatches audio to STT and finalized transcripts to the Agent service.
- **Agent Service (FastAPI / LangGraph / Python)**: State machine orchestrating compliance, debtor negotiation, and promise-to-pay capture.
- **Deterministic Compliance Layer (Python)**: Code-level guards enforcing calling hours, third-party privacy, disclosure sequence, and term limits.
- **Cryptographic Audit Logger**: Hash-chained JSONL audit trail with SHA-256 tamper verification.
- **Simulation & Evaluation Harness**: 10 personas, deterministic hard-fail checks, LLM-as-judge rubric, Wilson 95% confidence intervals.

```
Browser / Replay Tool ──WSS──► Node Gateway ──WS──► STT Service (VAD + Whisper)
                                    │
                         mode: agent│
                                    ▼
                          Agent Service (FastAPI)
                                    ├─ LangGraph State Machine (v2 Challenger)
                                    ├─ Baseline Single Prompt (v1 Champion)
                                    ├─ Deterministic Compliance Guard
                                    ├─ Mock CRM & Precondition Tools
                                    └─ Hash-Chained JSONL Audit Log
```

---

## 2. Conversation Graph Nodes (LangGraph)

1. **`greet`**: Identifies the caller line, queries the expected name politely, and routes to verification without leaking balance or creditor info.
2. **`verify_identity`**: Collects and validates date of birth against mock CRM. Rejects after 3 failed attempts.
3. **`disclose`**: Delivers mandatory legal disclosures: creditor name, call recording notice, and overdue notice.
4. **`discover`**: Reveals balance and actively listens to debtor hardship, dispute claims, or timing constraints.
5. **`negotiate`**: Generates structured installment offers strictly bounded by `approved_terms` (min down payment, max installments <= 6, 0% discount).
6. **`capture_promise`**: Explicit read-back of amount, due date, and bank transfer method; requires explicit debtor confirmation before recording PTP.
7. **`close`**: Courteous summary, SMS notification trigger, and clean termination.
8. **Side Exits**:
   - `third_party`: Immediate disclosure suppression; requests debtor callback.
   - `dispute_or_paid`: Logs claim without pressure; routes to human review.
   - `stop_contact`: Immediate acknowledgment; flags suppress list.
   - `escalate_human`: Hands off hostile callers or formal escalations.

---

## 3. Compliance Guard Specification

Enforced **strictly in code**, outside prompts:
- **Pre-Turn Checks**:
  - Calling hours (08:00 - 21:00 Asia/Tokyo). Injectable clock for test reproducibility.
  - Contact frequency limits.
  - Active stop-contact flag.
- **Post-LLM Checks**:
  - Detection of Yen amounts (`parse_japanese_amount`) or creditor name before `identity_verified and disclosure_done`.
  - Detection of offers exceeding approved terms (e.g. > max installments).
  - Forbidden content: threats, shaming, false urgency, unauthorized legal action.
  - Continuing collection pitches after a stop-contact request.

On violation, the utterance is overwritten with an approved template, emitted as a `compliance_block` event, and logged to the audit trail.
