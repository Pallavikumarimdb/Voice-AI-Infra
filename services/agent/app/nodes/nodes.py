"""
LangGraph Nodes for Japanese Collections Voice Agent.
All nodes conform to Section 4.2 of AGENT_BUILD_PLAN.md.
"""

import time
import re
from typing import Dict, Any, List

from ..state import CallState
from ..mock_crm.crm import crm
from ..tools import lookup_account, get_approved_terms, record_promise, flag_stop_contact, escalate
from ..compliance.guard import parse_japanese_amount
from .classifier import classifier

def greet_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "greet"
    debtor_id = state.get("debtor_id", "deb_001")
    target_record = crm.get_by_id(debtor_id) or {"name": "お客様"}
    target_name = target_record.get("name", "お客様")

    user_text = state.get("last_user_text", "")
    cls = classifier.classify(user_text, "greet")

    if not user_text or state.get("turn_count", 0) <= 1:
        reply = f"もしもし、恐れ入ります。{target_name}様のお電話でいらっしゃいますでしょうか。"
        return {"phase": "greet", "agent_proposed_text": reply}

    if cls["is_third_party"]:
        return {"phase": "third_party", "third_party_detected": True}

    if cls["is_stop_contact"]:
        return {"phase": "stop_contact", "stop_contact": True}

    if cls["is_hostile_or_escalate"]:
        return {"phase": "escalate_human", "escalation_reason": "hostile_or_person_requested"}

    if cls["is_affirmative"] or target_name.split()[0] in user_text or "私です" in user_text or "はい" in user_text:
        # Move directly to verify identity
        reply = "お忙しいところ恐れ入ります。個人情報保護のため、詳しいご案内の前にご本人様確認をお願いしております。恐れ入りますが、生年月日をお伺いできますでしょうか。"
        return {
            "phase": "verify_identity",
            "agent_proposed_text": reply
        }

    # Re-ask politely
    reply = f"恐れ入ります、{target_name}様でお間違いないでしょうか。"
    return {"phase": "greet", "agent_proposed_text": reply}

def verify_identity_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "verify_identity"
    debtor_id = state.get("debtor_id", "deb_001")
    user_text = state.get("last_user_text", "")
    cls = classifier.classify(user_text, "verify_identity")

    if cls["is_third_party"]:
        return {"phase": "third_party", "third_party_detected": True}
    if cls["is_stop_contact"]:
        return {"phase": "stop_contact", "stop_contact": True}

    attempts = state.get("verification_attempts", 0) + 1

    # Check for date of birth or credentials
    # Normalize input like 1985年4月12日, 昭和60年4月12日, 1985-04-12, 昭和60, 4月12日
    dob_match = re.search(r'([0-9]{4}|昭和[0-9]{1,2}|平成[0-9]{1,2})?年?\s*([0-9]{1,2})月\s*([0-9]{1,2})日?', user_text)
    
    verified = False
    if dob_match or any(c.isdigit() for c in user_text):
        verified = crm.verify_credentials(debtor_id, stated_dob=user_text)

    if verified:
        # Load account into state (allowed ONLY after verification!)
        record = crm.get_by_id(debtor_id) or {}
        approved = record.get("approved_terms", {})
        reply = "ご本人様確認が取れました。ご協力誠にありがとうございます。それでは、本日のお電話のご用件についてご説明いたします。"
        return {
            "phase": "disclose",
            "identity_verified": True,
            "verification_attempts": attempts,
            "debtor_profile": record,
            "balance": record.get("current_balance"),
            "approved_terms": approved,
            "agent_proposed_text": reply
        }

    if attempts >= 3:
        reply = "恐れ入りますが、ご本人様確認が完了できませんでした。本日のご案内は終了させていただきます。失礼いたします。"
        return {
            "phase": "close",
            "verification_attempts": attempts,
            "escalation_reason": "verification_failed",
            "agent_proposed_text": reply
        }

    reply = "生年月日の確認が取れませんでした。恐れ入りますが、もう一度生年月日を西暦または和暦でお伺いできますでしょうか。"
    return {
        "phase": "verify_identity",
        "verification_attempts": attempts,
        "agent_proposed_text": reply
    }

def disclose_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "disclose"
    state["disclosure_done"] = True
    record = state.get("debtor_profile", {})
    creditor = record.get("creditor", "委託元")
    balance = state.get("balance", record.get("current_balance", 48000))

    user_text = state.get("last_user_text", "")
    cls = classifier.classify(user_text, "disclose")

    if cls["is_stop_contact"]:
        return {"phase": "stop_contact", "stop_contact": True}
    if cls["is_dispute_or_paid"]:
        return {"phase": "dispute_or_paid", "flags": {**state.get("flags", {}), "dispute": True}}

    reply = f"今回は{creditor}様に関するお支払期日を過ぎたご請求についてのご案内となります。現在、未払い残高が{balance:,}円となっておりますが、現在のご状況はいかがでしょうか。"
    return {
        "phase": "discover",
        "disclosure_done": True,
        "agent_proposed_text": reply
    }

def discover_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "discover"
    user_text = state.get("last_user_text", "")
    cls = classifier.classify(user_text, "discover")
    balance = state.get("balance", 48000)

    if cls["is_stop_contact"]:
        return {"phase": "stop_contact", "stop_contact": True}

    if cls["is_dispute_or_paid"]:
        return {
            "phase": "dispute_or_paid",
            "debtor_stated_situation": user_text,
            "flags": {**state.get("flags", {}), "dispute": True}
        }

    if cls["is_hostile_or_escalate"]:
        return {
            "phase": "escalate_human",
            "escalation_reason": "hostile_or_escalate_requested",
            "debtor_stated_situation": user_text
        }

    # Check for immediate willing to pay
    amounts = parse_japanese_amount(user_text)
    if cls["is_affirmative"] and (amounts or "全額" in user_text or "払います" in user_text):
        target_amt = amounts[0] if amounts else balance
        reply = f"全額のお支払いをいただける旨、誠にありがとうございます。それでは、{target_amt:,}円を今週中にお振込いただくということでよろしいでしょうか。"
        return {
            "phase": "capture_promise",
            "debtor_stated_situation": "immediate_full_payment",
            "agent_proposed_text": reply
        }

    # Hardship or request for installments
    situation_note = user_text if cls["is_hardship"] else "monthly_installment_requested"
    terms = state.get("approved_terms", {})
    max_inst = terms.get("max_installments", 6)
    suggested_monthly = max(5000, int(balance / max_inst))

    reply = f"ご事情を丁寧にお話しいただきありがとうございます。無理のないお支払いとして、例えば月々{suggested_monthly:,}円ずつの分割払いに調整することも可能ですが、いかがでしょうか。"
    return {
        "phase": "negotiate",
        "debtor_stated_situation": situation_note,
        "flags": {**state.get("flags", {}), "hardship": cls["is_hardship"]},
        "agent_proposed_text": reply
    }

def negotiate_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "negotiate"
    user_text = state.get("last_user_text", "")
    cls = classifier.classify(user_text, "negotiate")
    balance = state.get("balance", 48000)
    terms = state.get("approved_terms", {})
    max_inst = terms.get("max_installments", 6)

    if cls["is_stop_contact"]:
        return {"phase": "stop_contact", "stop_contact": True}
    if cls["is_hostile_or_escalate"]:
        return {"phase": "escalate_human", "escalation_reason": "negotiation_breakdown"}

    amounts = parse_japanese_amount(user_text)
    
    # Debtor agrees to proposal
    if cls["is_affirmative"]:
        proposed_amt = amounts[0] if amounts else max(5000, int(balance / max_inst))
        reply = f"ご承諾いただきありがとうございます。それでは確認のため復唱いたします。お支払い金額は{proposed_amt:,}円、お支払い日は来月末日、銀行振込にてお間違いございませんでしょうか。"
        return {
            "phase": "capture_promise",
            "agent_proposed_text": reply
        }

    # Debtor counter-offers amount
    if amounts:
        offered = amounts[0]
        if offered < terms.get("min_down_payment", 5000):
            reply = f"恐れ入りますが、規定により最低頭金は{terms.get('min_down_payment', 5000):,}円からとなっております。{terms.get('min_down_payment', 5000):,}円でのお支払いは可能でしょうか。"
            return {"phase": "negotiate", "agent_proposed_text": reply}
        else:
            reply = f"ご提示ありがとうございます。それでは、初回{offered:,}円のお支払いということで、お間違いございませんでしょうか。"
            return {"phase": "capture_promise", "agent_proposed_text": reply}

    reply = f"お客様のご生活に支障のない範囲で、最大{max_inst}回までの分割払いをご相談いただけます。月々のご希望金額はどのくらいでしょうか。"
    return {"phase": "negotiate", "agent_proposed_text": reply}

def capture_promise_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "capture_promise"
    user_text = state.get("last_user_text", "")
    cls = classifier.classify(user_text, "capture_promise")
    balance = state.get("balance", 48000)

    if cls["is_stop_contact"]:
        return {"phase": "stop_contact", "stop_contact": True}

    if cls["is_affirmative"] or "はい" in user_text or "間違いありません" in user_text or "大丈夫" in user_text:
        # Record Promise To Pay (PTP)
        ptp_res = record_promise(state, amount=state.get("balance", 48000), payment_date="2026-10-31", payment_method="bank_transfer")
        reply = "お約束の確認が取れました。誠にありがとうございます。振込先等のご案内をSMSにてお送りいたします。それでは失礼いたします。"
        return {
            "phase": "close",
            "promise_to_pay": ptp_res,
            "agent_proposed_text": reply
        }

    # If debtor refused or hesitated
    if cls["is_negative"]:
        reply = "失礼いたしました。それでは、改めてご都合の良いお支払い日や金額についてお聞かせいただけますでしょうか。"
        return {"phase": "negotiate", "agent_proposed_text": reply}

    # Re-ask explicit confirmation
    reply = "恐れ入ります、内容についてご了承いただけましたら「はい」とお答えいただけますでしょうか。"
    return {"phase": "capture_promise", "agent_proposed_text": reply}

def close_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "close"
    reply = "お電話ありがとうございました。失礼いたします。"
    return {"phase": "close", "agent_proposed_text": reply}

def third_party_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "third_party"
    state["third_party_detected"] = True
    reply = "恐れ入ります。ご本人様より折り返しのお電話をいただけますようお伝えいただけますでしょうか。それでは失礼いたします。"
    return {"phase": "close", "third_party_detected": True, "agent_proposed_text": reply}

def dispute_or_paid_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "dispute_or_paid"
    state["escalation_reason"] = "dispute"
    reply = "お支払いやご請求内容に関してご不明な点がございましたこと、承知いたしました。行き違い等の可能性も含め、担当部署にて確認のうえ改めてご連絡いたします。失礼いたします。"
    return {"phase": "close", "agent_proposed_text": reply}

def stop_contact_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "stop_contact"
    state["stop_contact"] = True
    flag_stop_contact(state, reason="debtor_explicit_request")
    reply = "ご連絡停止のご要望を承知いたしました。今後の連絡を控えさせていただきます。失礼いたします。"
    return {"phase": "close", "stop_contact": True, "agent_proposed_text": reply}

def escalate_human_node(state: CallState) -> Dict[str, Any]:
    state["phase"] = "escalate_human"
    reason = state.get("escalation_reason", "manual_request")
    escalate(state, reason=reason)
    reply = "承知いたしました。詳しい担当者より改めてご連絡を差し上げます。お忙しいところ恐れ入りますが、何卒よろしくお願い申し上げます。"
    return {"phase": "close", "agent_proposed_text": reply}
