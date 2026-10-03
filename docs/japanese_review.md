# Japanese Language & Keigo Review Checklist

> **Status**: Internal synthetic draft completed. **Formal native-speaker review is pending.**
> In accordance with Hard Rule 7 of the project specification, no claims of certified native review are made until human review is conducted and signed off below.

---

## 1. Keigo & Register Guidelines Applied

- **Register**: Polite formal Japanese (丁寧語 / です・ます調) throughout all agent nodes.
- **Honorifics**: Proper caller honorifics (`{debtor_name}様`, `ご本人様`, `お電話口の方`).
- **Humbler forms (謙譲語)**: Self-referential modesty (`私ども`, `ご案内いたします`, `お伺いできますでしょうか`).
- **Non-threatening phrasing**: Avoidance of imperative / aggressive debt collection tropes. Replaced coercive demands with neutral, solution-oriented inquiries (`ご事情をお聞かせいただけますでしょうか`).

---

## 2. Review Checklist for Native Speaker

| Section | Target File | Checks Needed | Sign-off Status |
|---|---|---|---|
| Caller Greet & ID Verification | `services/agent/app/prompts/ja/greet.txt`, `verify.txt` | Natural flow, courteous inquiry of DOB | [ ] Pending |
| Legal Disclosures | `services/agent/app/prompts/ja/disclose.txt` | Clear pronunciation when spoken by TTS, standard call recording phrasing | [ ] Pending |
| Financial Discovery | `services/agent/app/prompts/ja/discover.txt` | Empathetic tone, avoiding shaming | [ ] Pending |
| Installment Negotiation | `services/agent/app/prompts/ja/negotiate.txt` | Clear statement of installment counts and monthly amounts | [ ] Pending |
| Promise Read-back | `services/agent/app/prompts/ja/capture_promise.txt` | Read-back clarity (Yen amounts, dates) | [ ] Pending |
| Third-Party Protection | `services/agent/app/prompts/ja/close.txt`, `nodes.py` | Discreet handling when family member answers | [ ] Pending |
| Stop-Contact Exit | `services/agent/app/compliance/guard.py` | Immediate polite cessation of contact | [ ] Pending |

---

## 3. Notes for Reviewer

1. Please check if any phrases sound translated or unnatural when read aloud.
2. Verify that numerals (`48,000円` vs `四万八千円`) and calendar dates sound natural across text-to-speech engines.
3. Suggest any keigo refinements that enhance debtor cooperation without reducing clarity.
