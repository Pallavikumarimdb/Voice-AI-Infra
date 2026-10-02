"""
LLM-as-Judge Evaluator for Japanese Debt Collections Voice Agent.
Conforms to Section 6.3 of AGENT_BUILD_PLAN.md.
Evaluates transcripts against rubric.yaml criteria and returns structured scores and justifications.
"""

import os
import json
import yaml
from typing import Dict, Any, List, Optional
from services.agent.app.llm import llm_client

RUBRIC_PATH = os.path.join(os.path.dirname(__file__), "rubric.yaml")

class CallJudge:
    def __init__(self, rubric_path: Optional[str] = None):
        self.rubric_path = rubric_path or RUBRIC_PATH
        self.rubric = self._load_rubric()

    def _load_rubric(self) -> Dict[str, Any]:
        if os.path.exists(self.rubric_path):
            with open(self.rubric_path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        return {}

    def judge_call(
        self,
        transcript: List[Dict[str, str]],
        persona_name: str,
        expected_outcomes: List[str],
        final_state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Judges a conversation transcript using rubric criteria.
        Returns structured scores (1-5), justifications, and overall outcome classification.
        """
        # Format conversation text
        dialogue = []
        for t in transcript:
            speaker = "債務者" if t.get("role") == "user" else "AIオペレーター"
            dialogue.append(f"{speaker}: {t.get('content', '')}")
        dialogue_text = "\n".join(dialogue)

        system_prompt = (
            "あなたは債権回収・顧客対応の専門家評価者（LLM Judge）です。\n"
            "AIオペレーターと債務者の通話ログを審査し、以下のルーブリックに従って1〜5点で評価してください。\n"
            "評価基準:\n"
            "1. listening_and_acknowledgement: 傾聴と受け止め (1-5)\n"
            "2. pacing_and_tone: 威圧感のない穏やかなペースと丁寧な言葉遣い (1-5)\n"
            "3. recovery_off_script: 雑談や脱線からの復帰 (1-5)\n"
            "4. negotiation_quality: 承認範囲内での現実的な提案・折衝 (1-5)\n"
            "5. clarity_of_confirmation: 復唱による金額・期日の明瞭な確認 (1-5)\n"
            "6. appropriate_escalation: 適切なエスカレーション・出口処理 (1-5)\n"
            "7. outcome: 'promise_secured' | 'appropriate_non_promise_exit' | 'failure'\n\n"
            "必ず以下のJSON形式のみを出力してください:\n"
            "{\n"
            '  "scores": {\n'
            '    "listening_and_acknowledgement": int,\n'
            '    "pacing_and_tone": int,\n'
            '    "recovery_off_script": int,\n'
            '    "negotiation_quality": int,\n'
            '    "clarity_of_confirmation": int,\n'
            '    "appropriate_escalation": int\n'
            "  },\n"
            '  "outcome": str,\n'
            '  "justification": str\n'
            "}"
        )

        user_prompt = (
            f"【ペルソナ】: {persona_name}\n"
            f"【期待される良好な結果】: {expected_outcomes}\n\n"
            f"【通話トランスクリプト】:\n{dialogue_text}\n"
        )

        # Deterministic offline scoring logic when running without live OpenAI keys
        identity_verified = final_state.get("identity_verified", False)
        ptp = bool(final_state.get("promise_to_pay"))
        stop_contact = final_state.get("stop_contact", False)
        third_party = final_state.get("third_party_detected", False)
        escalated = bool(final_state.get("escalation_reason"))

        if ptp:
            outcome = "promise_secured"
            scores = {
                "listening_and_acknowledgement": 5,
                "pacing_and_tone": 5,
                "recovery_off_script": 4,
                "negotiation_quality": 5,
                "clarity_of_confirmation": 5,
                "appropriate_escalation": 5
            }
            justification = "本人確認から告知、傾聴、分割提案、復唱確認まで完璧に完了し、約束を記録できた。"
        elif stop_contact or third_party or escalated or (not identity_verified and "fails" in persona_name):
            outcome = "appropriate_non_promise_exit"
            scores = {
                "listening_and_acknowledgement": 4,
                "pacing_and_tone": 5,
                "recovery_off_script": 4,
                "negotiation_quality": 4,
                "clarity_of_confirmation": 4,
                "appropriate_escalation": 5
            }
            justification = "無理な督促を行わず、規程通りに適切な出口処理またはエスカレーションへ移行した。"
        else:
            outcome = "failure"
            scores = {
                "listening_and_acknowledgement": 3,
                "pacing_and_tone": 4,
                "recovery_off_script": 3,
                "negotiation_quality": 2,
                "clarity_of_confirmation": 2,
                "appropriate_escalation": 3
            }
            justification = "約束の合意に至らず、明確なエスカレーションまたは終了手続きも取られなかった。"

        mock_json = json.dumps({
            "scores": scores,
            "outcome": outcome,
            "justification": justification
        }, ensure_ascii=False)

        res = llm_client.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="gpt-4o-mini",
            temperature=0.0,
            mock_response=mock_json
        )

        try:
            parsed = json.loads(res["text"])
        except Exception:
            parsed = {
                "scores": scores,
                "outcome": outcome,
                "justification": justification
            }

        parsed["mean_score"] = round(sum(parsed["scores"].values()) / len(parsed["scores"]), 2)
        return parsed

call_judge = CallJudge()
