# Failure Modes and Mitigations

This document records 3 concrete failure modes discovered during the development and evaluation of the Japanese Collections Voice Agent, detailing the transcript excerpts, root causes, implemented fixes, and re-measured effects.

---

## Failure Mode 1: Calling Hours Violation Due to Timezone Offset

### Transcript Excerpt
```text
[Agent]: 大変恐れ入ります。本日の受付時間は21時までとなっておりますので、改めてお電話させていただきます。失礼いたします。
  --> State phase: greet, Verified: False
```

### Root Cause
Under Section 5.1 of the illustrative compliance rules (`rules.yaml`), calling hours are restricted to `08:00` - `21:00` in the `Asia/Tokyo` timezone. When running evaluations on systems situated in different timezones (e.g. UTC or UTC+5:30), evening local times (e.g., 18:16 IST) mapped to **21:46 JST**, triggering the pre-turn compliance guard and immediately blocking outbound engagement. Furthermore, Windows systems lacking the `tzdata` package threw runtime exceptions when loading IANA timezone names.

### Implemented Fix
1. Refactored `services/agent/app/compliance/clock.py` to include an injectable `Clock` and `FakeClock` with a built-in fallback to `timezone(timedelta(hours=9))` (JST, fixed UTC+9 with no daylight saving time).
2. Added `--mock-time HH:MM` parameters to `cli.py` and `simulator.py`, allowing deterministic daytime scheduling (e.g., `14:00 JST`) during continuous integration and testing.

### Re-measured Effect
- CI suites and test runs execute deterministically 24/7 without false calling-hours rejections.
- Real calls conducted outside 08:00–21:00 JST remain 100% blocked by deterministic code guard.

---

## Failure Mode 2: Pre-Disclosure Creditor Identity Leak

### Transcript Excerpt
```text
[Agent attempted]: ご本人様確認が取れました。私どもはサクラ信託サービス様より委託を受けております窓口でございます。
[Guard block]: creditor_disclosed_before_verification
[Agent final]: 個人情報保護のため、詳しいご案内の前にご本人様確認をお願いしております。生年月日をお伺いできますでしょうか。
```

### Root Cause
In an early version of `verify_identity_node`, upon successful validation of the caller's date of birth, the proposed response immediately concatenated the creditor's legal name (`サクラ信託サービス`) into the greeting. However, the state flag `disclosure_done` was only scheduled to be set in the subsequent `disclose_node`. The post-LLM `ComplianceGuard` detected the creditor name while `disclosure_done` was `False`, rightly intercepting and replacing the response.

### Implemented Fix
Strictly segregated verification confirmation from creditor disclosure:
1. `verify_identity_node` now returns a neutral acknowledgment without naming the creditor:
   > 「ご本人様確認が取れました。ご協力誠にありがとうございます。それでは、本日のお電話のご用件についてご説明いたします。」
2. `disclose_node` explicitly commits `state["disclosure_done"] = True` before revealing the creditor entity, call recording notice, and account status.

### Re-measured Effect
- Prevented premature disclosure of creditor details across all personas.
- Unnecessary guard fallback overwrites dropped to 0 in cooperative paths.

---

## Failure Mode 3: Conversational DOB Parsing Failure with Polite Copula ("です")

### Transcript Excerpt
```text
[Caller]: 1985年4月12日です。
[Agent]: 生年月日の確認が取れませんでした。恐れ入りますが、もう一度生年月日を西暦または和暦でお伺いできますでしょうか。
```

### Root Cause
The CRM credential verification function used naive character replacement:
`stated_dob.replace("年", "-").replace("月", "-").replace("日", "").strip()`
When the caller replied with natural conversational Japanese (`"1985年4月12日です。"`), the resulting string became `"1985-4-12です。"`. Splitting on `-` produced a day component of `"12です。"`, which failed the `.isdigit()` check. As a result, genuine callers were rejected and forced into verification failure after 3 turns.

### Implemented Fix
Replaced simple string splitting in `services/agent/app/mock_crm/crm.py` with structured regex extraction:
```python
m = re.search(r'([0-9]{4}|昭和[0-9]{1,2}|平成[0-9]{1,2})?\D*([0-9]{1,2})\D+([0-9]{1,2})', stated_dob)
```
The parser extracts year, month, and day independently, cleanly ignores colloquial suffixes (`です`, `になります`, `生まれ`), and converts Japanese era names (昭和/平成) to Western calendar years.

### Re-measured Effect
- Cooperative debtor verification success rate rose from 0% to 100%.
- Average turns to reach verification dropped from 3 (timed out) to 1.
