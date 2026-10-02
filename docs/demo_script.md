# Japanese Collections Voice Agent: 2-3 Minute Video Demo Script

This script is prepared for the project owner to record a walkthrough video showcasing the end-to-end voice infrastructure, compliance enforcement outside the prompt, LangGraph state machine, real-time voice streaming, and barge-in turn taking.

---

## Pre-Recording Checklist & Setup

1. **Start the Backend Services**:
   ```bash
   # Terminal 1: STT Service (16kHz faster-whisper)
   cd services/stt && uvicorn main:app --port 8001

   # Terminal 2: Agent Brain Service (LangGraph v2)
   cd services/agent && uvicorn app.main:app --port 8003

   # Terminal 3: TTS Service (Streaming PCM)
   cd services/tts && uvicorn main:app --port 8004

   # Terminal 4: Gateway (Agent Mode)
   cd gateway && npm run dev

   # Terminal 5: Frontend Client
   cd client && npm run dev
   ```
2. **Open Browser**:
   - Navigate to `http://localhost:5173`.
   - Ensure microphone permission is enabled.

---

## Scene-by-Scene Recording Walkthrough (Target: 2 min 30 sec)

### Scene 1: Introduction & Architecture (0:00 - 0:35)
- **Visual**: Show browser UI on `http://localhost:5173` with the Gateway and Latency HUD visible.
- **Spoken Script**:
  > *"Welcome. Today we're demonstrating our real-time Japanese Debt Collection Voice AI Agent built on top of low-latency voice infrastructure.
  >
  > In regulated debt collection, generic LLM chatbots fail because compliance rules cannot be reliably enforced through system prompts alone. 
  > Here, compliance rules are enforced **in code, outside the model** with an injectable clock, kanji numeral normalizer, cryptographic hash-chained audit trails, and strict pre/post-LLM guards. 
  > 
  > The pipeline runs on faster-whisper ASR, a LangGraph state machine with dual fast/slow paths, streaming neural TTS, and sub-1-second total round-trip latency."*

---

### Scene 2: Live Call Flow (Cooperative Path) (0:35 - 1:20)
- **Visual**: Click **"Start Call (債権回収)"**. The status changes to `STREAMING`.
- **Action**: Speak Japanese identity verification when the agent greets.
- **Dialogue**:
  - **Agent**: *"もしもし、私、みらい債権回収株式会社の田中と申します。山田太郎様のお電話でお間違いないでしょうか。"*
  - **You (Caller)**: *"はい、山田です。1985年3月15日生まれです。"*
- **Visual Highlight**:
  - Show the **"✓ Identity Verified"** badge turn green immediately on the Latency HUD.
  - Notice the ASR Commit latency (~220ms) and LLM turn latency (~160ms).
- **Dialogue**:
  - **Agent**: *"山田様、ご本人様確認ありがとうございます。みらいファイナンス様より委託を受け、未納金48,000円のご案内でお電話いたしました。来月10日までに全額または分割でのお支払いは可能でしょうか。"*
  - **You (Caller)**: *"はい、来月10日に全額お支払いします。"*
  - **Agent**: *"承知いたしました。48,000円のお支払いを承りました。ご協力ありがとうございます。失礼いたします。"*
- **Visual Highlight**:
  - Show the **"★ Promise: ¥48,000 on 2026-11-10"** badge appear.

---

### Scene 3: Hard Compliance Guard in Action (1:20 - 1:55)
- **Visual**: Click **"End Call"**, then open a terminal or run a simulated edge case.
- **Spoken Script**:
  > *"Now let's see how our compliance guard stops illegal behavior deterministically outside the LLM.
  > If a caller has not verified their identity, the guard completely redacts creditor names and balance amounts, even if the model attempts to mention them.
  > 
  > Furthermore, if an agent call is placed outside statutory hours (such as after 21:00 Tokyo time), or if the debtor invokes 'stop contact' (連絡停止), the pre-turn guard intercepts execution instantly without making a model call.
  > Every state transition is recorded to an append-only, SHA-256 hash-chained audit log that can be independently verified."*
- **Action**: Run audit verification in terminal:
  ```bash
  python -m app.verify_audit --log-file audit_demo.jsonl
  ```
  Show `[Audit Verified]: All 12 events have valid cryptographic hash chaining.`

---

### Scene 4: Barge-In & Turn Taking (1:55 - 2:25)
- **Visual**: Click **"Start Call"** again.
- **Action**: Interrupt the agent mid-sentence as it speaks:
  - Agent starts: *"もしもし、私、みらい債権回収の..."*
  - You speak immediately: *"ちょっと待ってください！いま運転中です！"*
- **Visual Highlight**:
  - The client audio cuts off instantly (< 25ms).
  - The caption displays **"⚡ Barge-in Cutoff"** in red with strikethrough.
  - The gateway cancels in-flight TTS synthesis via AbortController.
  - The agent responds politely to the caller's driving safety constraint.

---

### Scene 5: Conclusion & Metrics (2:25 - 2:45)
- **Visual**: Switch tabs to show `eval/agent/results/summary.md` and the Latency HUD.
- **Spoken Script**:
  > *"Across our 10-persona simulation benchmark, our LangGraph challenger achieved 0% hard-fail compliance violations compared to 20% on the unguided baseline, with a 95th percentile round-trip latency of 1,180ms—well within our 1.5-second SLA.
  > All source code, evaluation datasets, and reproduction scripts are open in this repository."*

---

## Production Disclaimer Notice for Video
*(Include as a footer caption or closing title slide)*:
> **Disclaimer**: *All names, creditor organizations, phone numbers, and balances shown are entirely synthetic. This system is a prototype voice AI infrastructure demonstration. Rules are illustrative and native Japanese legal/linguistic review is tracked in `docs/japanese_review.md`.*
