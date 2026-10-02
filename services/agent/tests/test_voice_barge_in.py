"""
Tests for voice turn-taking, barge-in logic, and state synchronization.
"""

import pytest
from app.state import CallState
from app.compliance.guard import ComplianceGuard

def test_barge_in_flag_state():
    """Verify that state properly records when an agent utterance was cut off mid-speech."""
    state: CallState = {
        "session_id": "test_barge_in",
        "debtor_id": "D-1001",
        "history": [
            {"role": "agent", "content": "こんにちは、みらい債権回収の...", "interrupted": True}
        ],
        "turns": 1,
        "identity_verified": False,
        "disclosure_done": False,
        "stop_contact": False,
        "dispute_raised": False,
        "hardship_raised": False,
        "third_party_detected": False,
        "promise_captured": None,
        "audit_trail": []
    }
    assert len(state["history"]) == 1
    assert state["history"][0]["interrupted"] is True
    # Verify disclosure remains False when interrupted
    assert state.get("disclosure_done") is False

def test_interrupted_disclosure_requires_re_disclosure():
    """If debtor interrupts during creditor disclosure, agent cannot disclose amounts without full disclosure."""
    guard = ComplianceGuard()
    state: CallState = {
        "session_id": "test_barge_in_disc",
        "debtor_id": "D-1001",
        "identity_verified": True,
        "disclosure_done": False, # cut off before completing disclosure
        "turns": 2,
        "stop_contact": False,
        "dispute_raised": False,
        "hardship_raised": False,
        "third_party_detected": False,
        "promise_captured": None,
        "history": [],
        "audit_trail": [],
        "debtor_profile": {"creditor": "みらいファイナンス", "amount": 48000}
    }
    
    # Attempting to propose debt amounts before disclosure completed must be blocked
    proposed = "現在48,000円のお支払いが残っておりますが、いつ頃お支払い可能でしょうか。"
    violation = guard.check_post_llm(proposed, state)
    assert violation is not None
    code, fallback = violation
    assert code == "amount_disclosed_before_verification"
    assert "生年月日" in fallback or "確認" in fallback
