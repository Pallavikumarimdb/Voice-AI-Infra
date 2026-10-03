"""
CallState Definition for Japanese Collections Voice Agent.
State schema conforms to Section 4.1 of AGENT_BUILD_PLAN.md.
"""

from typing import TypedDict, Optional, List, Dict, Any

class CallState(TypedDict, total=False):
    session_id: str
    debtor_id: str
    messages: List[Dict[str, str]]
    phase: str
    identity_verified: bool
    verification_attempts: int
    disclosure_done: bool
    debtor_profile: Optional[Dict[str, Any]]
    balance: Optional[int]
    approved_terms: Dict[str, Any]
    offers_made: List[Dict[str, Any]]
    promise_to_pay: Optional[Dict[str, Any]]
    stop_contact: bool
    third_party_detected: bool
    escalation_reason: Optional[str]
    debtor_stated_situation: Optional[str]
    turn_count: int
    flags: Dict[str, Any]
    strategy_note: Optional[str]
    last_user_text: str
    agent_proposed_text: str
    agent_final_text: str
    compliance_events: List[Dict[str, Any]]
    tool_events: List[Dict[str, Any]]
