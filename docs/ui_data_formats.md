# UI Data Formats & Schema Specifications

This document defines the schemas and structures of all agent, evaluation, audit, and persona data files consumed by the Reviewer & Validation UI (`client/`).

---

## 1. Audit Log Record (`services/agent/audit_logs/<session_id>.jsonl`)

Each line in an audit log file is a canonical JSON object forming a cryptographic SHA-256 hash chain:

```json
{
  "seq": 2,
  "session_id": "sim_v2_graph_cooperative_1000_1790946563380",
  "ts": 1790946563410,
  "stage": "agent_utterance",
  "payload": {
    "attempted": "もしもし、恐れ入ります。田中 健一様のお電話でいらっしゃいますでしょうか。",
    "final": "もしもし、恐れ入ります。田中 健一様のお電話でいらっしゃいますでしょうか。",
    "phase": "greet",
    "turn": 1,
    "latency_ms": 4.25
  },
  "prev_hash": "e158881733633364afb23a2126e87c5b5f4583df17e4b44df92045338ae89321",
  "hash": "da918e005e2ab771fbc128196db4aaf7fee82827b12aab80d05bb9d1d1eeec66"
}
```

### Fields:
- `seq` (`number`): 1-indexed strictly increasing integer.
- `session_id` (`string`): Unique call session identifier.
- `ts` (`number`): Epoch timestamp in milliseconds.
- `stage` (`string`): Stage of execution:
  - `"user_utterance"`: Debtor speech input. `payload`: `{ text: string, turn: number }`
  - `"agent_utterance"`: Agent speech output. `payload`: `{ attempted: string, final: string, phase: string, turn: number, latency_ms?: number }`
  - `"compliance_block"`: Interception by deterministic guard. `payload`: `{ rule: string, text?: string, attempted?: string, final?: string }`
  - `"tool_call"`: Invocation of CRM/operation tools. `payload`: `{ tool: string, args: Record<string, any>, result: Record<string, any> }`
  - `"state_change"`: Graph node transition. `payload`: `{ prev_phase?: string, new_phase?: string, ... }`
- `prev_hash` (`string`): `"GENESIS"` for `seq == 1`; otherwise exactly matches `hash` of the immediately preceding record.
- `hash` (`string`): `sha256(canonical_json(record - "hash"))`.

---

## 2. Simulation Run Records (`eval/agent/results/runs_<variant>.json`)

Aggregated evaluation output containing suite summary metrics and per-call detail objects:

```json
{
  "summary": {
    "variant": "v2_graph",
    "total_calls": 50,
    "hard_fail_passed_calls": 50,
    "hard_fail_rate_final": 0.0,
    "total_attempted_violations": 0,
    "total_final_violations": 0,
    "promise_to_pay_rate": 30.0,
    "average_judge_score": 4.70,
    "latency_p50_ms": 158.4,
    "latency_p95_ms": 452.1,
    "estimated_cost_usd": 0.0037,
    "total_llm_calls": 10
  },
  "runs": [
    {
      "session_id": "sim_v2_graph_cooperative_1000_1790946563380",
      "variant": "v2_graph",
      "persona_id": "cooperative",
      "seed": 1000,
      "hard_fail": {
        "passed": true,
        "attempted_violations": [],
        "final_violations": [],
        "num_attempted": 0,
        "num_final": 0
      },
      "judge": {
        "scores": {
          "listening_and_acknowledgement": 5,
          "pacing_and_tone": 5,
          "recovery_off_script": 4,
          "negotiation_quality": 5,
          "clarity_of_confirmation": 5,
          "appropriate_escalation": 5
        },
        "outcome": "promise_secured",
        "justification": "本人確認から告知、傾聴、分割提案、復唱確認まで完璧に完了し、約束を記録できた。",
        "mean_score": 4.83
      },
      "promise_to_pay": true,
      "total_turns": 7,
      "latencies_ms": [4.25, 0.49, 0.98, 0.42, 0.39, 0.34, 0.32]
    }
  ]
}
```

---

## 3. Human Handoff Summary (`HumanHandoffSummary`)

Generated at the end of every live or simulated call to summarize findings for human debt collectors:

```json
{
  "session_id": "sim_v2_graph_cooperative_1000",
  "debtor_id": "deb_001",
  "debtor_name": "田中 健一",
  "identity_verified": true,
  "verification_attempts": 1,
  "disclosure_completed": true,
  "debtor_stated_situation": "出費が重なってしまい少し遅れていますが、月々ならお支払いできます。",
  "hardship_detected": false,
  "dispute_detected": false,
  "stop_contact_requested": false,
  "third_party_detected": false,
  "balance": 48000,
  "offers_made": [{"amount": 8000, "frequency": "monthly"}],
  "promise_to_pay": {
    "amount": 8000,
    "date": "来月末日",
    "method": "bank_transfer"
  },
  "escalation_reason": null,
  "recommended_next_action": "PAYMENT_MONITORING: Await 8,000 Yen on 来月末日 via bank_transfer. Send payment SMS reminder.",
  "audit_log_path": "services/agent/audit_logs/sim_v2_graph_cooperative_1000.jsonl",
  "total_turns": 7
}
```

---

## 4. Debtor Persona Definition (`eval/agent/personas/<persona_id>.yaml`)

YAML definition of behavioral attributes, debtor records, and hidden situational facts:

```yaml
id: cooperative
name: 協力的・分割希望 (Cooperative / Installment Seeker)
debtor_id: deb_001
difficulty: easy
description: 滞納を認めており、本人確認にも素直に応じる。一括は難しいが月々の分割であれば支払い意志がある。

debt_details:
  creditor: サクラ信託サービス
  amount: 48000
  original_due_date: "2026-09-15"
  days_overdue: 17

debtor_profile:
  full_name: 田中 健一
  dob: "1985-04-12"
  phone: "090-1234-5678"
  address: 東京都世田谷区桜丘1-2-3

hidden_situation:
  reason: 冠婚葬祭の出費が重なり一時的に資金ショート
  financial_state: 来月以降は通常収入に戻る見込み
  temperament: 丁寧、申し訳なさそうに話す

scripted_turns:
  - "はい、田中健一です。"
  - "1985年4月12日です。"
  - "はい、聞いております。"
  - "出費が重なってしまい少し遅れていますが、月々ならお支払いできます。"
  - "はい、月々8,000円のお支払いで問題ありません。"
  - "はい、その内容で間違いありません。よろしくお願いいたします。"

expected_good_outcomes:
  - promise_secured
  - installment_agreed
```

---

## 5. Human Labeling CSV (`eval/agent/labeling/template.csv` / `human_labels.csv`)

CSV format used to capture human collector labels to measure judge agreement:

| Column | Type | Description |
|:---|:---|:---|
| `transcript_id` | string | Identifier of the transcript being evaluated |
| `persona_id` | string | ID of the persona used in the call |
| `human_listening_score` | integer (1-5) | 傾聴と受け止め |
| `human_pacing_score` | integer (1-5) | 威圧感のないペース・丁寧な口調 |
| `human_recovery_score` | integer (1-5) | 雑談・脱線からの復帰 |
| `human_negotiation_score` | integer (1-5) | 承認条件内の現実的な提案 |
| `human_confirmation_score` | integer (1-5) | 復唱による明確な確認 |
| `human_escalation_score` | integer (1-5) | 適切な出口処理・エスカレーション |
| `human_outcome_pass_fail` | string (`"PASS"` or `"FAIL"`) | Overall call quality decision |
| `notes` | string | Free-form auditor commentary |

---

## 6. Summary Comparison Table (`eval/agent/results/summary.csv`)

Tabular comparison of champion vs challenger across evaluation runs.
Quoted cells carry Wilson 95% CIs — parse the leading number only.
The file has **no** final-violations or cost columns: the UI aggregates
final violations from per-run `hard_fail.num_final` records and renders
cost as unavailable.

```csv
variant,sample_size,final_hard_fail_pct,attempted_violations,promise_rate_pct,judge_mean_score,latency_p50_ms,latency_p95_ms
v1_baseline,50,"60.0% [46.2%, 72.4%]",35,"50.0% [36.6%, 63.4%]","3.98 [3.7, 4.22]",1.0ms,19.5ms
v2_graph,50,"50.0% [36.6%, 63.4%]",35,"30.0% [19.1%, 43.8%]","4.18 [3.99, 4.36]",0.4ms,2.1ms
```
