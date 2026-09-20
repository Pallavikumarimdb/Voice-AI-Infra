import numpy as np

def longest_common_prefix(strs: list[str]) -> str:
    """Find the longest common prefix among a list of strings."""
    if not strs:
        return ""
    prefix = strs[0]
    for s in strs[1:]:
        while not s.startswith(prefix):
            prefix = prefix[:-1]
            if not prefix:
                return ""
    return prefix

class LocalAgreementStabilizer:
    """
    LocalAgreement-n stabilizer:
    Maintains a rolling window of the last n hypotheses from the ASR model.
    A prefix is considered stable and committed only when all n consecutive runs agree on it.
    """
    def __init__(self, agreement_n: int = 2):
        self.agreement_n = max(1, agreement_n)
        self.hypotheses: list[str] = []
        self.committed_text = ""
        self.committed_until_s = 0.0

    def update(self, latest_hypothesis: str, word_timestamps: list[dict] | None = None) -> dict:
        self.hypotheses.append(latest_hypothesis)
        if len(self.hypotheses) > self.agreement_n:
            self.hypotheses.pop(0)

        # Require agreement across available hypotheses window up to n
        trim_audio_s = 0.0
        if len(self.hypotheses) >= self.agreement_n:
            stable_prefix = longest_common_prefix(self.hypotheses)
            if len(stable_prefix) > len(self.committed_text):
                new_commit_len = len(stable_prefix)
                self.committed_text = stable_prefix

                # Estimate or calculate audio trim timestamp
                if word_timestamps:
                    accum_chars = 0
                    for word in word_timestamps:
                        accum_chars += len(word.get("text", ""))
                        if accum_chars >= new_commit_len:
                            end_s = word.get("end", 0.0)
                            if end_s > self.committed_until_s:
                                trim_audio_s = end_s - self.committed_until_s
                                self.committed_until_s = end_s
                            break

        partial_text = latest_hypothesis[len(self.committed_text):] if len(latest_hypothesis) >= len(self.committed_text) else ""

        return {
            "committed": self.committed_text,
            "partial": partial_text,
            "stable_chars": len(self.committed_text),
            "trim_audio_s": trim_audio_s
        }

    def reset(self):
        self.hypotheses.clear()
        self.committed_text = ""
        self.committed_until_s = 0.0
