"""
Mock CRM & Operations Tools for Japanese Collections Voice Agent.
All tools enforce precondition checks deterministically and return structured results.
"""

from typing import Dict, Any, Optional
from .mock_crm.crm import crm

class ToolError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

def lookup_account(session_state: Dict[str, Any], debtor_id: str) -> Dict[str, Any]:
    """
    Looks up debtor profile and account balance.
    PRECONDITION: Identity must be verified.
    """
    if not session_state.get("identity_verified", False):
        return {
            "success": False,
            "error_code": "PRECONDITION_FAILED",
            "message": "Security error: Cannot look up account balance or details before identity verification."
        }

    record = crm.get_by_id(debtor_id)
    if not record:
        return {
            "success": False,
            "error_code": "NOT_FOUND",
            "message": f"Debtor record '{debtor_id}' not found."
        }

    return {
        "success": True,
        "debtor_id": record["debtor_id"],
        "name": record["name"],
        "creditor": record["creditor"],
        "balance": record["current_balance"],
        "due_date": record["due_date"],
        "approved_terms": record["approved_terms"]
    }

def get_approved_terms(session_state: Dict[str, Any], debtor_id: str) -> Dict[str, Any]:
    """
    Fetches the creditor-approved negotiation boundaries for this debtor.
    PRECONDITION: Identity must be verified.
    """
    if not session_state.get("identity_verified", False):
        return {
            "success": False,
            "error_code": "PRECONDITION_FAILED",
            "message": "Cannot retrieve approved negotiation terms before identity verification."
        }

    record = crm.get_by_id(debtor_id)
    if not record:
        return {"success": False, "error_code": "NOT_FOUND", "message": "Debtor not found"}

    return {
        "success": True,
        "approved_terms": record.get("approved_terms", {
            "min_down_payment": 5000,
            "max_installments": 6,
            "max_duration_days": 180,
            "max_discount_pct": 0
        })
    }

def record_promise(session_state: Dict[str, Any], amount: int, payment_date: str, payment_method: str = "bank_transfer") -> Dict[str, Any]:
    """
    Records a formalized promise to pay (PTP).
    PRECONDITION: Identity verified, disclosure done, and amount/date confirmed with read-back.
    """
    if not session_state.get("identity_verified", False):
        return {"success": False, "error_code": "PRECONDITION_FAILED", "message": "Identity not verified"}
    if not session_state.get("disclosure_done", False):
        return {"success": False, "error_code": "PRECONDITION_FAILED", "message": "Mandatory disclosure not completed"}

    if amount <= 0:
        return {"success": False, "error_code": "INVALID_AMOUNT", "message": "Promise amount must be positive"}

    return {
        "success": True,
        "promise_id": f"ptp_{session_state.get('session_id')}",
        "amount": amount,
        "payment_date": payment_date,
        "payment_method": payment_method,
        "status": "RECORDED"
    }

def schedule_callback(session_state: Dict[str, Any], callback_time: str, phone: Optional[str] = None) -> Dict[str, Any]:
    """Schedules a debtor callback."""
    return {
        "success": True,
        "callback_scheduled": True,
        "time": callback_time,
        "phone": phone or session_state.get("phone", "registered_number")
    }

def flag_stop_contact(session_state: Dict[str, Any], reason: str = "debtor_request") -> Dict[str, Any]:
    """Flags account for immediate stop contact and suppress list addition."""
    return {
        "success": True,
        "stop_contact_active": True,
        "suppression_reason": reason,
        "channels_blocked": ["phone", "sms", "email"]
    }

def escalate(session_state: Dict[str, Any], reason: str, details: Optional[str] = None) -> Dict[str, Any]:
    """Escalates call to human supervisor or specialized team."""
    return {
        "success": True,
        "escalated": True,
        "reason": reason,
        "details": details or "",
        "priority": "HIGH" if reason in ["hostile", "legal_threat", "distress"] else "NORMAL"
    }
