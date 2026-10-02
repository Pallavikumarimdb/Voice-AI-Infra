"""
Generalized Multi-Domain Voice Agent.
Supports Candidate Screening (HR), Customer KYC / Support, and Custom Enterprise Voice Agents.
Seamlessly configured via UI instructions, domain presets, and language selection (ja / en).
"""

import time
from typing import Dict, Any, Optional, List
from .state import CallState
from .audit import AuditLogger
from .compliance.guard import ComplianceGuard

# ─────────────────────────────────────────────────────────────────────────────
# Per-language response templates
# ─────────────────────────────────────────────────────────────────────────────
_SCREENING_TEMPLATES = {
    "ja": {
        1: lambda name, role, greeting: greeting or (
            f"{name}様、本日は面談のお時間をいただきありがとうございます。AI採用アシスタントでございます。"
            f"今回は{role}職の一次選考として、ご経歴とご希望についてお伺いします。"
            f"最近携わられた主な技術スタックやプロジェクトについて教えていただけますか。"
        ),
        2: lambda: "詳しくお聞かせいただきありがとうございます。堅牢なシステム開発のご経験がよくわかりました。"
                   "続いて、勤務形態のご希望（フルリモートやハイブリッドなど）と、ご希望の年収レンジについてお聞かせいただけますでしょうか。",
        3: lambda role: (
            f"ご希望条件を詳しくお聞かせいただきありがとうございます。当社の{role}の募集要項および評価基準に合致していることを確認いたしました。"
            f"本日のスクリーニング内容を採用担当官へ引き継ぎ、2営業日以内に二次面接の日程調整をご連絡いたします。本日はお時間をいただきありがとうございました。"
        ),
        "default": "ご回答ありがとうございます。ご質問や追加のご要望がございましたら、メールにてお気軽にお申し付けください。それでは失礼いたします。",
    },
    "en": {
        1: lambda name, role, greeting: greeting or (
            f"Hello {name}, thank you for making time for this interview today. I'm an AI Recruiting Assistant. "
            f"I'll be conducting your first-round screening for the {role} position. "
            f"To start, could you tell me about your recent experience — key tech stacks and notable projects you've worked on?"
        ),
        2: lambda: (
            "Thank you for sharing that — it's clear you have solid systems engineering experience. "
            "Moving on, could you tell me about your preferred working arrangement (fully remote, hybrid, or on-site) "
            "and your expected compensation range?"
        ),
        3: lambda role: (
            f"Thank you for walking me through your background and expectations. "
            f"We've confirmed you're a strong match for the {role} position. "
            f"I'll pass your screening summary to our hiring team, and you'll hear back within 2 business days regarding next steps. "
            f"It was a pleasure speaking with you today!"
        ),
        "default": "Thank you for your responses. If you have any questions, feel free to reach out by email. Have a great day!",
    },
}

_KYC_TEMPLATES = {
    "ja": {
        1: lambda name, account, greeting: greeting or (
            f"お電話ありがとうございます。カスタマーサポートAIでございます。"
            f"お客様番号{account}の{name}様でいらっしゃいますでしょうか。"
            f"セキュリティ認証のため、ご登録の生年月日またはお電話番号の下4桁をお知らせください。"
        ),
        2: lambda: "ご本人様確認が完了いたしました。ご協力ありがとうございます。本日はアカウントのお手続きでしょうか、それともご利用明細の確認でしょうか。",
        "default": "承知いたしました。お手続きを完了し、確認通知をご登録のメールアドレスへ送付いたしました。他にご不明な点はございますでしょうか。",
    },
    "en": {
        1: lambda name, account, greeting: greeting or (
            f"Thank you for calling. This is your AI Customer Support assistant. "
            f"Am I speaking with {name}, account number {account}? "
            f"For security verification, could you please provide your registered date of birth or the last 4 digits of your phone number?"
        ),
        2: lambda: (
            "Your identity has been successfully verified — thank you for your patience. "
            "How can I help you today? Are you calling about your account details, a transaction query, or something else?"
        ),
        "default": (
            "Understood. I've completed your request and a confirmation has been sent to your registered email address. "
            "Is there anything else I can help you with today?"
        ),
    },
}

_COLLECTIONS_TEMPLATES = {
    "ja": {
        1: lambda name, greeting: greeting or (
            f"お電話ありがとうございます。債権管理センターのAIオペレーターでございます。"
            f"{name}様のお電話でお間違いないでしょうか。"
        ),
        2: lambda: "ご本人様確認ありがとうございます。大切なお知らせがございます。期日を過ぎましたお支払いについて、本日ご入金のご予定を伺えますでしょうか。",
        3: lambda: "お支払いのお約束を承りました。期日までのお手続きをお願い申し上げます。本日はご対応いただき誠にありがとうございました。",
        "default": "承知いたしました。ご不明な点がございましたら、サポート窓口までお問い合わせください。失礼いたします。",
    },
    "en": {
        1: lambda name, greeting: greeting or (
            f"Hello, this is Accounts Management. Am I speaking with {name}?"
        ),
        2: lambda: (
            "Thank you for confirming your identity. I am calling regarding an overdue balance on your account. "
            "Are you able to arrange a payment today, or would you like to set up a payment schedule?"
        ),
        3: lambda: (
            "Thank you for confirming your payment arrangement. We have recorded your promise to pay, "
            "and a confirmation email has been sent. Thank you for your time today and have a great day."
        ),
        "default": "Thank you for your response. If you have any further questions, please contact our support team. Goodbye.",
    },
}

_CUSTOM_TEMPLATES = {
    "ja": lambda user_text, turn, greeting: (
        greeting if (turn == 1 and greeting) else
        f"ご案内ありがとうございます。「{user_text}」について承知いたしました。ご指示いただいた方針に基づき、引き続き丁寧に対応させていただきます。"
    ),
    "en": lambda user_text, turn, greeting: (
        greeting if (turn == 1 and greeting) else
        f"Thank you for sharing that. I understand your request regarding '{user_text}'. "
        f"I'll continue assisting you in line with the provided guidelines."
    ),
}


from dataclasses import dataclass

@dataclass
class TurnContext:
    turn: int
    user_text: str
    state: Dict[str, Any]
    greeting: str
    instructions: str
    context: Dict[str, Any]
    language: str = "ja"


class GeneralizedVoiceAgent:
    """
    Generalized agent handling domain-specific prompts, instructions,
    and stage transitions (HR Candidate Screening, Customer KYC, Custom Agents, Collections).
    Supports both Japanese (ja) and English (en) via the config.language field.
    """

    def __init__(self, guard: Optional[ComplianceGuard] = None):
        self.guard = guard or ComplianceGuard()
        self._handlers = {
            "screening": self._handle_screening,
            "kyc": self._handle_kyc,
            "collections": self._handle_collections,
            "custom": self._handle_custom,
        }

    def process_turn(
        self,
        session_id: str,
        user_text: str,
        state: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
        audit_logger: Optional[AuditLogger] = None
    ) -> Dict[str, Any]:
        config = config or {}
        domain = config.get("domain", "screening")
        language = config.get("language", "ja")  # 'ja' | 'en'
        custom_instructions = config.get("instructions", "")
        custom_greeting = config.get("greeting", "")
        context_data = config.get("context", {})

        turn_count = state.get("turn_count", 0) + 1
        state["turn_count"] = turn_count
        state["domain"] = domain
        state["language"] = language

        events: List[Dict[str, Any]] = []

        if audit_logger:
            audit_logger.append("user_utterance", {
                "text": user_text,
                "turn": turn_count,
                "domain": domain,
                "language": language,
            })

        ctx = TurnContext(
            turn=turn_count,
            user_text=user_text,
            state=state,
            greeting=custom_greeting,
            instructions=custom_instructions,
            context=context_data,
            language=language
        )

        handler = self._handlers.get(domain, self._handle_custom)
        t_start = time.perf_counter()
        reply_text, turn_events = handler(ctx)
        handler_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
        events.extend(turn_events)

        if audit_logger:
            audit_logger.append("agent_utterance", {
                "text": reply_text,
                "turn": turn_count,
                "domain": domain,
                "language": language,
                "stage": state.get("stage", "active"),
            })

        return {
            "text": reply_text,
            "events": events,
            "state": state,
            "metrics": {
                # Template engine: no LLM call happens on this path. Report the
                # honestly measured handler time and zero tokens — never fake
                # LLM timings.
                "llmMs": handler_ms,
                "ttftMs": handler_ms,
                "tokensIn": 0,
                "tokensOut": 0,
                "model": f"template_{domain}_{language}",
            }
        }

    # ─── Screening ────────────────────────────────────────────────────────────

    def _handle_screening(self, ctx: TurnContext) -> tuple[str, List[Dict[str, Any]]]:
        candidate_name = ctx.context.get("candidateName", "佐藤 健一" if ctx.language == "ja" else "Alex Johnson")
        target_role = ctx.context.get("targetRole", "シニアソフトウェアエンジニア" if ctx.language == "ja" else "Senior Software Engineer")
        tmpl = _SCREENING_TEMPLATES.get(ctx.language, _SCREENING_TEMPLATES["en"])
        events = []

        if ctx.turn == 1:
            ctx.state["stage"] = "experience_inquiry"
            ctx.state["candidate_name"] = candidate_name
            ctx.state["target_role"] = target_role
            reply = tmpl[1](candidate_name, target_role, ctx.greeting)
            events.append({"type": "state_change", "payload": {"stage": "experience_inquiry", "domain": "screening", "language": ctx.language}, "ts": int(time.time() * 1000)})
            return reply, events

        elif ctx.turn == 2:
            ctx.state["stage"] = "compensation_and_work_style"
            ctx.state["tech_stack_noted"] = True
            reply = tmpl[2]()
            events.append({"type": "state_change", "payload": {"stage": "compensation_and_work_style", "domain": "screening"}, "ts": int(time.time() * 1000)})
            return reply, events

        elif ctx.turn == 3:
            ctx.state["stage"] = "closing"
            ctx.state["qualified"] = True
            ctx.state["compensation_fit"] = True
            reply = tmpl[3](target_role)
            events.append({"type": "candidate_qualified", "payload": {"qualified": True, "role": target_role}, "ts": int(time.time() * 1000)})
            events.append({"type": "end_call", "payload": {"status": "completed"}, "ts": int(time.time() * 1000)})
            return reply, events

        else:
            reply = tmpl["default"]
            events.append({"type": "end_call", "payload": {"status": "completed"}, "ts": int(time.time() * 1000)})
            return reply, events

    # ─── KYC ──────────────────────────────────────────────────────────────────

    def _handle_kyc(self, ctx: TurnContext) -> tuple[str, List[Dict[str, Any]]]:
        customer_name = ctx.context.get("customerName", "鈴木 一郎" if ctx.language == "ja" else "John Smith")
        account_id = ctx.context.get("accountId", "ACC-88219")
        tmpl = _KYC_TEMPLATES.get(ctx.language, _KYC_TEMPLATES["en"])
        events = []
        user_lower = ctx.user_text.lower()

        if ctx.turn == 1:
            ctx.state["stage"] = "identity_verification"
            reply = tmpl[1](customer_name, account_id, ctx.greeting)
            events.append({"type": "state_change", "payload": {"stage": "auth_requested", "domain": "kyc", "language": ctx.language}, "ts": int(time.time() * 1000)})
            return reply, events

        elif ctx.turn == 2:
            # Check for denial or refusal to authenticate
            denial_patterns = ["違う", "違います", "分からない", "教えられない", "誰", "no", "wrong", "refuse", "not me", "don't know", "cannot"]
            if any(p in user_lower for p in denial_patterns):
                ctx.state["identity_verified"] = False
                ctx.state["stage"] = "auth_failed"
                reply = (
                    "恐れ入ります。ご本人様確認が取れない場合、個人情報保護の観点から詳細なご案内ができません。ご確認の上、再度お問い合わせください。"
                    if ctx.language == "ja" else
                    "I apologize, but without verifying your identity, I cannot access your account details due to privacy regulations. Please verify your information and call back."
                )
                events.append({"type": "escalate", "payload": {"reason": "kyc_auth_failed"}, "ts": int(time.time() * 1000)})
                events.append({"type": "end_call", "payload": {"status": "auth_failed"}, "ts": int(time.time() * 1000)})
                return reply, events

            ctx.state["stage"] = "service_inquiry"
            ctx.state["identity_verified"] = True
            reply = tmpl[2]()
            events.append({"type": "identity_verified", "payload": {"verified": True}, "ts": int(time.time() * 1000)})
            return reply, events

        else:
            ctx.state["stage"] = "resolved"
            reply = tmpl["default"]
            events.append({"type": "end_call", "payload": {"status": "resolved"}, "ts": int(time.time() * 1000)})
            return reply, events

    # ─── Custom ───────────────────────────────────────────────────────────────

    def _handle_custom(self, ctx: TurnContext) -> tuple[str, List[Dict[str, Any]]]:
        tmpl_fn = _CUSTOM_TEMPLATES.get(ctx.language, _CUSTOM_TEMPLATES["en"])
        events = []
        reply = tmpl_fn(ctx.user_text, ctx.turn, ctx.greeting)
        events.append({"type": "state_change", "payload": {"turn": ctx.turn, "domain": "custom", "language": ctx.language}, "ts": int(time.time() * 1000)})
        return reply, events

    # ─── Collections ──────────────────────────────────────────────────────────

    def _handle_collections(self, ctx: TurnContext) -> tuple[str, List[Dict[str, Any]]]:
        debtor_name = ctx.context.get("debtorName", "佐藤 健一" if ctx.language == "ja" else "Alex Johnson")
        tmpl = _COLLECTIONS_TEMPLATES.get(ctx.language, _COLLECTIONS_TEMPLATES["en"])
        events = []
        user_lower = ctx.user_text.lower()

        # Stop contact check
        stop_patterns = ["stop calling", "do not call", "remove my number", "don't call", "連絡しないで", "電話しないで", "かけてこないで", "二度と"]
        if any(sp in user_lower for sp in stop_patterns):
            ctx.state["stop_contact"] = True
            ctx.state["stage"] = "stop_contact"
            events.append({"type": "stop_contact", "payload": {"requested": True}, "ts": int(time.time() * 1000)})
            events.append({"type": "end_call", "payload": {"status": "stop_contact"}, "ts": int(time.time() * 1000)})
            reply = (
                "ご連絡停止のご要望を承りました。お電話番号を連絡停止リストに登録いたしました。失礼いたします。"
                if ctx.language == "ja" else
                "We have recorded your stop-contact request and added your number to our suppression list. We will not contact you again. Goodbye."
            )
            return reply, events

        if ctx.turn == 1:
            ctx.state["stage"] = "identity_verification"
            ctx.state["debtor_name"] = debtor_name
            reply = tmpl[1](debtor_name, ctx.greeting)
            events.append({"type": "state_change", "payload": {"stage": "auth_requested", "domain": "collections", "language": ctx.language}, "ts": int(time.time() * 1000)})
            return reply, events

        elif ctx.turn == 2:
            # Check third party / wrong person denial
            wrong_person_patterns = ["wrong person", "not me", "wrong number", "don't know", "人違い", "違います", "間違い電話", "そんな人はいません"]
            if any(wp in user_lower for wp in wrong_person_patterns):
                ctx.state["identity_verified"] = False
                ctx.state["third_party_detected"] = True
                events.append({"type": "escalate", "payload": {"reason": "wrong_person"}, "ts": int(time.time() * 1000)})
                events.append({"type": "end_call", "payload": {"status": "third_party"}, "ts": int(time.time() * 1000)})
                reply = (
                    "大変失礼いたしました。間違い電話のお詫びを申し上げます。登録情報を確認いたします。失礼いたします。"
                    if ctx.language == "ja" else
                    "I apologize for the inconvenience. We have noted that this is the incorrect contact number and will update our records. Have a good day."
                )
                return reply, events

            ctx.state["stage"] = "negotiation"
            ctx.state["identity_verified"] = True
            reply = tmpl[2]()
            events.append({"type": "identity_verified", "payload": {"verified": True}, "ts": int(time.time() * 1000)})
            return reply, events

        elif ctx.turn == 3:
            ctx.state["stage"] = "promise_to_pay"
            ctx.state["promise_amount"] = 35000 if ctx.language == "ja" else 350
            reply = tmpl[3]()
            events.append({"type": "promise_to_pay", "payload": {"amount": ctx.state["promise_amount"]}, "ts": int(time.time() * 1000)})
            events.append({"type": "end_call", "payload": {"status": "completed"}, "ts": int(time.time() * 1000)})
            return reply, events

        else:
            reply = tmpl["default"]
            events.append({"type": "end_call", "payload": {"status": "completed"}, "ts": int(time.time() * 1000)})
            return reply, events


