"""
Champion (v1 baseline) Single-Prompt Collections Voice Agent.
No state graph; relies on a single system prompt, full history, and tools,
wrapped in the exact same compliance guard for fair champion/challenger comparison.
"""

import time
import os
from typing import Dict, Any, Optional, List

from .state import CallState
from .compliance.guard import ComplianceGuard
from .audit import AuditLogger
from .llm import llm_client
from .mock_crm.crm import crm

BASELINE_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "prompts", "ja", "baseline.txt")

class BaselineCollectionsAgent:
    def __init__(self, guard: Optional[ComplianceGuard] = None):
        self.guard = guard or ComplianceGuard()
        self.system_prompt = self._load_prompt()

    def _load_prompt(self) -> str:
        if os.path.exists(BASELINE_PROMPT_PATH):
            with open(BASELINE_PROMPT_PATH, "r", encoding="utf-8") as f:
                return f.read()
        return "あなたは親切で丁寧な債権管理センターのAIオペレーターです。"

    def process_turn(
        self,
        session_id: str,
        user_text: str,
        state: CallState,
        audit_logger: Optional[AuditLogger] = None
    ) -> Dict[str, Any]:
        t_start = time.perf_counter()
        events = []

        # 1. PRE-TURN COMPLIANCE CHECK
        pre_block = self.guard.check_pre_turn(state)
        if pre_block:
            rule_code, fallback = pre_block
            events.append({
                "type": "compliance_block",
                "payload": {"rule": rule_code, "action": "blocked_pre_turn"},
                "ts": int(time.time() * 1000)
            })
            if audit_logger:
                audit_logger.append("compliance_block", {"rule": rule_code, "text": fallback})
            return {
                "text": fallback,
                "events": events,
                "state": state,
                "metrics": {"llmMs": 5.0, "tokensIn": 0, "tokensOut": len(fallback), "model": "guard_fallback"}
            }

        state["last_user_text"] = user_text
        state["turn_count"] = state.get("turn_count", 0) + 1
        state["messages"] = state.get("messages", []) + [{"role": "user", "content": user_text}]

        if audit_logger:
            audit_logger.append("user_utterance", {"text": user_text, "turn": state["turn_count"]})

        # Check identity verification in baseline
        debtor_id = state.get("debtor_id", "deb_001")
        if not state.get("identity_verified"):
            if crm.verify_credentials(debtor_id, stated_dob=user_text):
                state["identity_verified"] = True
                record = crm.get_by_id(debtor_id) or {}
                state["debtor_profile"] = record
                state["balance"] = record.get("current_balance")
                state["disclosure_done"] = True # baseline assumes disclosure after verification

        # Format system prompt
        debtor_record = crm.get_by_id(debtor_id) or {}
        terms = debtor_record.get("approved_terms", {})
        formatted_system = self.system_prompt.format(
            debtor_name=debtor_record.get("name", "お客様"),
            creditor=debtor_record.get("creditor", "委託元"),
            balance=debtor_record.get("current_balance", 48000),
            min_down_payment=terms.get("min_down_payment", 5000),
            max_installments=terms.get("max_installments", 6)
        )

        messages = [{"role": "system", "content": formatted_system}] + state["messages"]

        # Call LLM
        # Baseline deterministic response logic if mock LLM
        if not state.get("identity_verified"):
            mock_reply = "恐れ入ります、個人情報保護のため生年月日をお伺いできますでしょうか。"
        elif not state.get("promise_to_pay"):
            if any(w in user_text for w in ["はい", "払います", "大丈夫", "わかりました"]):
                mock_reply = f"ありがとうございます。それでは残高{state.get('balance', 48000):,}円を来月までに分割でお支払いいただくということでお間違いございませんでしょうか。"
                state["promise_to_pay"] = {"amount": state.get("balance", 48000), "status": "RECORDED"}
            else:
                mock_reply = f"現在の未払い残高は{state.get('balance', 48000):,}円となっております。月々の分割でのお支払いは可能でしょうか。"
        else:
            mock_reply = "ご確認いただきありがとうございます。振込先等のご案内をSMSにてお送りいたします。失礼いたします。"

        llm_out = llm_client.complete(
            messages=messages,
            model="gpt-4o-mini",
            mock_response=mock_reply
        )

        proposed_reply = llm_out["text"]
        attempted_reply = proposed_reply

        # 2. POST-LLM COMPLIANCE CHECK
        post_block = self.guard.check_post_llm(proposed_reply, state)
        if post_block:
            rule_code, fallback = post_block
            events.append({
                "type": "compliance_block",
                "payload": {"rule": rule_code, "attempted": proposed_reply, "replaced": fallback},
                "ts": int(time.time() * 1000)
            })
            final_reply = fallback
            if audit_logger:
                audit_logger.append("compliance_block", {
                    "rule": rule_code,
                    "attempted": proposed_reply,
                    "final": fallback
                })
        else:
            final_reply = proposed_reply

        state["agent_final_text"] = final_reply
        state["messages"].append({"role": "assistant", "content": final_reply})

        t_elapsed = (time.perf_counter() - t_start) * 1000

        if audit_logger:
            audit_logger.append("agent_utterance", {
                "attempted": attempted_reply,
                "final": final_reply,
                "turn": state["turn_count"],
                "latency_ms": round(t_elapsed, 2)
            })

        return {
            "text": final_reply,
            "events": events,
            "state": state,
            "metrics": {
                "llmMs": round(t_elapsed, 2),
                "tokensIn": llm_out["tokens_in"],
                "tokensOut": llm_out["tokens_out"],
                "model": "v1_baseline"
            }
        }
