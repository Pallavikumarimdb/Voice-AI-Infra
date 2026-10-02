#!/usr/bin/env python3
"""
Interactive or Simulated CLI for Collections Voice Agent.
Usage:
  python -m app.cli --persona cooperative
  python -m app.cli --interactive
"""

import sys
import os
import argparse
import time

# Ensure services/agent is in sys.path
agent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from datetime import datetime
from app.graph import CollectionsGraphAgent
from app.baseline import BaselineCollectionsAgent
from app.compliance.clock import FakeClock, TOKYO_TZ
from app.compliance.guard import ComplianceGuard
from app.audit import AuditLogger
from app.handoff import generate_handoff_summary
from app.state import CallState

COOPERATIVE_SCRIPT = [
    "はい、田中健一です。",
    "1985年4月12日です。",
    "はい、聞いております。",
    "すみません、出費が重なってしまい少し遅れていますが、来週給与が入るので全額お支払いできます。",
    "はい、48,000円を一括でお支払いします。",
    "はい、その内容で間違いありません。よろしくお願いいたします。"
]

def run_cli():
    parser = argparse.ArgumentParser(description="Japanese Collections Voice Agent CLI")
    parser.add_argument("--variant", choices=["v2_graph", "v1_baseline", "v2_graph_no_slow_path"], default="v2_graph")
    parser.add_argument("--persona", choices=["cooperative", "hostile", "third_party", "stop_contact"], default="cooperative")
    parser.add_argument("--interactive", action="store_true", help="Interactive terminal mode")
    parser.add_argument("--debtor-id", default="deb_001")
    parser.add_argument("--mock-time", default="14:00", help="Mock time in HH:MM (Asia/Tokyo) for calling hours")
    args = parser.parse_args()

    session_id = f"cli_{int(time.time())}"
    audit_logger = AuditLogger(session_id)

    # Set mock time within approved calling hours (08:00 - 21:00)
    hour, minute = map(int, args.mock_time.split(":"))
    fake_clock = FakeClock(datetime(2026, 10, 2, hour, minute, tzinfo=TOKYO_TZ))
    guard = ComplianceGuard(clock=fake_clock)

    if args.variant == "v1_baseline":
        agent = BaselineCollectionsAgent(guard=guard)
    else:
        enable_slow = (args.variant == "v2_graph")
        agent = CollectionsGraphAgent(guard=guard, enable_slow_path=enable_slow)

    state: CallState = {
        "session_id": session_id,
        "debtor_id": args.debtor_id,
        "messages": [],
        "phase": "greet",
        "identity_verified": False,
        "verification_attempts": 0,
        "disclosure_done": False,
        "balance": None,
        "approved_terms": {},
        "offers_made": [],
        "promise_to_pay": None,
        "stop_contact": False,
        "third_party_detected": False,
        "escalation_reason": None,
        "turn_count": 0,
        "flags": {}
    }

    print(f"=== Starting Call ({args.variant}, persona: {args.persona}, session: {session_id}) ===\n")

    # Initial turn (agent initiates or greets)
    turn_res = agent.process_turn(session_id, "", state, audit_logger)
    print(f"[Agent]: {turn_res['text']}")
    print(f"  --> State phase: {state.get('phase')}, Verified: {state.get('identity_verified')}\n")

    if args.interactive:
        while state.get("phase") != "close" and state.get("turn_count", 0) < 15:
            user_input = input("[Caller]: ").strip()
            if not user_input or user_input in ["exit", "quit"]:
                break
            turn_res = agent.process_turn(session_id, user_input, state, audit_logger)
            print(f"[Agent]: {turn_res['text']}")
            print(f"  --> State phase: {state.get('phase')}, Verified: {state.get('identity_verified')}, PTP: {bool(state.get('promise_to_pay'))}\n")
    else:
        # Scripted cooperative debtor
        script = COOPERATIVE_SCRIPT
        for user_utt in script:
            print(f"[Caller]: {user_utt}")
            turn_res = agent.process_turn(session_id, user_utt, state, audit_logger)
            print(f"[Agent]: {turn_res['text']}")
            print(f"  --> State phase: {state.get('phase')}, Verified: {state.get('identity_verified')}, PTP: {bool(state.get('promise_to_pay'))}\n")
            if state.get("phase") == "close":
                break

    # Summary
    handoff = generate_handoff_summary(state, audit_logger.log_path)
    print("=== Call Ended ===")
    print(f"Identity Verified: {handoff.identity_verified}")
    print(f"Promise Secured:   {bool(handoff.promise_to_pay)}")
    if handoff.promise_to_pay:
        print(f"Promise Details:   {handoff.promise_to_pay}")
    print(f"Recommended Action:{handoff.recommended_next_action}")
    print(f"Audit Trail:       {handoff.audit_log_path}\n")

    assert handoff.identity_verified, "Identity should have been verified in cooperative call!"
    assert handoff.promise_to_pay is not None, "Promise to pay should have been captured in cooperative call!"
    print("[M2 CLI SUCCESS] Full text call to recorded promise completed successfully!")

if __name__ == "__main__":
    run_cli()
