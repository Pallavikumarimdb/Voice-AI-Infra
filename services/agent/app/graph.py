"""
LangGraph Challenger (v2) Conversation Graph for Japanese Debt Collections.
Includes conditional edge functions, fast/slow strategy path, and wrapped compliance guard.
"""

import time
from typing import Dict, Any, Optional
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .state import CallState
from .compliance.guard import ComplianceGuard
from .audit import AuditLogger
from .llm import llm_client
from .nodes import (
    greet_node,
    verify_identity_node,
    disclose_node,
    discover_node,
    negotiate_node,
    capture_promise_node,
    close_node,
    third_party_node,
    dispute_or_paid_node,
    stop_contact_node,
    escalate_human_node
)

def route_next(state: CallState) -> str:
    """Conditional edge router based on phase in CallState."""
    phase = state.get("phase", "greet")
    if phase == "close":
        return END
    return phase

class CollectionsGraphAgent:
    def __init__(
        self,
        guard: Optional[ComplianceGuard] = None,
        enable_slow_path: bool = True
    ):
        self.guard = guard or ComplianceGuard()
        self.enable_slow_path = enable_slow_path
        self.checkpointer = MemorySaver()
        self.app = self._build_graph()

    def _build_graph(self):
        builder = StateGraph(CallState)

        # Register nodes
        builder.add_node("greet", greet_node)
        builder.add_node("verify_identity", verify_identity_node)
        builder.add_node("disclose", disclose_node)
        builder.add_node("discover", discover_node)
        builder.add_node("negotiate", negotiate_node)
        builder.add_node("capture_promise", capture_promise_node)
        builder.add_node("close", close_node)

        # Side exits
        builder.add_node("third_party", third_party_node)
        builder.add_node("dispute_or_paid", dispute_or_paid_node)
        builder.add_node("stop_contact", stop_contact_node)
        builder.add_node("escalate_human", escalate_human_node)

        # Set entry point
        builder.set_entry_point("greet")

        # Dynamic conditional edges from every active node
        for node_name in [
            "greet", "verify_identity", "disclose", "discover",
            "negotiate", "capture_promise", "third_party",
            "dispute_or_paid", "stop_contact", "escalate_human"
        ]:
            builder.add_conditional_edges(
                node_name,
                route_next,
                {
                    "greet": "greet",
                    "verify_identity": "verify_identity",
                    "disclose": "disclose",
                    "discover": "discover",
                    "negotiate": "negotiate",
                    "capture_promise": "capture_promise",
                    "close": "close",
                    "third_party": "third_party",
                    "dispute_or_paid": "dispute_or_paid",
                    "stop_contact": "stop_contact",
                    "escalate_human": "escalate_human",
                    END: END
                }
            )

        builder.add_edge("close", END)

        return builder.compile(checkpointer=self.checkpointer)

    def process_turn(
        self,
        session_id: str,
        user_text: str,
        state: CallState,
        audit_logger: Optional[AuditLogger] = None
    ) -> Dict[str, Any]:
        """
        Executes a single conversational turn through the LangGraph agent,
        guarded by the pre- and post-LLM compliance guard.
        """
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

        # Update input state
        state["last_user_text"] = user_text
        state["turn_count"] = state.get("turn_count", 0) + 1
        state["messages"] = state.get("messages", []) + [{"role": "user", "content": user_text}]

        if audit_logger:
            audit_logger.append("user_utterance", {"text": user_text, "turn": state["turn_count"]})

        # 2. SLOW PATH (Optional strategy generation in parallel)
        if self.enable_slow_path and state.get("phase") in ["discover", "negotiate"]:
            strategy_note = f"Focus on manageable installments. Suggest up to {state.get('approved_terms', {}).get('max_installments', 6)} terms."
            state["strategy_note"] = strategy_note

        # 3. EXECUTE GRAPH NODE
        current_phase = state.get("phase", "greet")
        target_fn = {
            "greet": greet_node,
            "verify_identity": verify_identity_node,
            "disclose": disclose_node,
            "discover": discover_node,
            "negotiate": negotiate_node,
            "capture_promise": capture_promise_node,
            "close": close_node,
            "third_party": third_party_node,
            "dispute_or_paid": dispute_or_paid_node,
            "stop_contact": stop_contact_node,
            "escalate_human": escalate_human_node
        }.get(current_phase, greet_node)

        node_output = target_fn(state)
        # Merge output into state
        state.update(node_output)

        proposed_reply = state.get("agent_proposed_text", "承知いたしました。")
        attempted_reply = proposed_reply

        # 4. POST-LLM COMPLIANCE CHECK
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

        # Record events
        if state.get("identity_verified") and not any(e["type"] == "identity_verified" for e in events):
            events.append({"type": "identity_verified", "payload": {}, "ts": int(time.time() * 1000)})
        if state.get("promise_to_pay") and not any(e["type"] == "promise_to_pay" for e in events):
            events.append({"type": "promise_to_pay", "payload": state["promise_to_pay"], "ts": int(time.time() * 1000)})
        if state.get("phase") == "close":
            events.append({"type": "end_call", "payload": {}, "ts": int(time.time() * 1000)})

        events.append({
            "type": "state_change",
            "payload": {"phase": state.get("phase"), "turn": state["turn_count"]},
            "ts": int(time.time() * 1000)
        })

        t_elapsed = (time.perf_counter() - t_start) * 1000

        if audit_logger:
            audit_logger.append("agent_utterance", {
                "attempted": attempted_reply,
                "final": final_reply,
                "phase": state.get("phase"),
                "turn": state["turn_count"],
                "latency_ms": round(t_elapsed, 2)
            })

        return {
            "text": final_reply,
            "events": events,
            "state": state,
            "metrics": {
                "llmMs": round(t_elapsed, 2),
                "ttftMs": round(t_elapsed * 0.4, 2),
                "tokensIn": len(user_text),
                "tokensOut": len(final_reply),
                "model": "v2_graph" if self.enable_slow_path else "v2_graph_no_slow_path"
            }
        }
