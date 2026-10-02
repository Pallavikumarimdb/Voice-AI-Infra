"""
Structured Human Collector Handoff Record Generator.
Produces a clear, actionable summary for human agents when a call completes or escalates.
"""

from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

class HumanHandoffSummary(BaseModel):
    session_id: str
    debtor_id: Optional[str] = None
    debtor_name: Optional[str] = None
    identity_verified: bool
    verification_attempts: int
    disclosure_completed: bool
    debtor_stated_situation: Optional[str] = None
    hardship_detected: bool = False
    dispute_detected: bool = False
    stop_contact_requested: bool = False
    third_party_detected: bool = False
    balance: Optional[int] = None
    offers_made: list[Dict[str, Any]] = Field(default_factory=list)
    promise_to_pay: Optional[Dict[str, Any]] = None
    escalation_reason: Optional[str] = None
    recommended_next_action: str
    audit_log_path: str
    total_turns: int

def generate_handoff_summary(state: Dict[str, Any], audit_log_path: str) -> HumanHandoffSummary:
    """Generates structured human handoff record from CallState."""
    identity_verified = state.get("identity_verified", False)
    disclosure_done = state.get("disclosure_done", False)
    ptp = state.get("promise_to_pay")
    escalation_reason = state.get("escalation_reason")
    stop_contact = state.get("stop_contact", False)
    third_party = state.get("third_party_detected", False)
    flags = state.get("flags", {})

    # Determine recommended next action
    if stop_contact:
        next_action = "DO_NOT_CONTACT: Add to compliance suppress list immediately."
    elif third_party:
        next_action = "CALLBACK_PENDING: Await debtor callback. Do not disclose debt details to third party."
    elif escalation_reason == "dispute":
        next_action = "DISPUTE_REVIEW: Review debtor payment claim / transaction records before next contact."
    elif escalation_reason:
        next_action = f"MANUAL_ESCALATION: Human collector outbound required (Reason: {escalation_reason})."
    elif ptp:
        amt = ptp.get("amount")
        date = ptp.get("date")
        method = ptp.get("method", "bank_transfer")
        next_action = f"PAYMENT_MONITORING: Await {amt:,} Yen on {date} via {method}. Send payment SMS reminder."
    elif not identity_verified:
        next_action = "VERIFICATION_FAILED: Retry contact during approved hours; route to identity verification agent."
    else:
        next_action = "FOLLOW_UP: Schedule follow-up negotiation within approved calling hours."

    debtor_profile = state.get("debtor_profile", {})

    return HumanHandoffSummary(
        session_id=state.get("session_id", "unknown"),
        debtor_id=debtor_profile.get("debtor_id") or state.get("debtor_id"),
        debtor_name=debtor_profile.get("name") if identity_verified else "[PROTECTED_UNVERIFIED]",
        identity_verified=identity_verified,
        verification_attempts=state.get("verification_attempts", 0),
        disclosure_completed=disclosure_done,
        debtor_stated_situation=state.get("debtor_stated_situation"),
        hardship_detected=flags.get("hardship", False),
        dispute_detected=flags.get("dispute", False),
        stop_contact_requested=stop_contact,
        third_party_detected=third_party,
        balance=state.get("balance") if identity_verified else None,
        offers_made=state.get("offers_made", []),
        promise_to_pay=ptp,
        escalation_reason=escalation_reason,
        recommended_next_action=next_action,
        audit_log_path=audit_log_path,
        total_turns=state.get("turn_count", 0)
    )
