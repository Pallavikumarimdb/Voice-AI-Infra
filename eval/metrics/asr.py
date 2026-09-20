"""
Pure function ASR evaluation metrics (WER and CER).
Contract: (log: list[dict], reference: str, lang: str) -> dict[str, float]
"""

def normalize_text(text: str, lang: str = "ja") -> str:
    import re
    # Remove basic punctuation and whitespace normalization
    text = re.sub(r"[、。，．！？!?\.,\s]+", "" if lang == "ja" else " ", text)
    return text.strip().lower()

def compute_cer(hypothesis: str, reference: str) -> float:
    ref_chars = list(reference)
    hyp_chars = list(hypothesis)
    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0

    # Dynamic programming Levenshtein distance
    dp = [[0] * (len(hyp_chars) + 1) for _ in range(len(ref_chars) + 1)]
    for i in range(len(ref_chars) + 1):
        dp[i][0] = i
    for j in range(len(hyp_chars) + 1):
        dp[0][j] = j

    for i in range(1, len(ref_chars) + 1):
        for j in range(1, len(hyp_chars) + 1):
            cost = 0 if ref_chars[i - 1] == hyp_chars[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,      # deletion
                dp[i][j - 1] + 1,      # insertion
                dp[i - 1][j - 1] + cost # substitution
            )

    return float(dp[len(ref_chars)][len(hyp_chars)]) / float(len(ref_chars))

def compute(log: list[dict], reference: str, lang: str = "ja") -> dict[str, float]:
    # Find final committed text from log
    final_events = [e for e in log if e.get("stage") == "asr_final" or e.get("type") == "final"]
    hypothesis = final_events[-1].get("text", "") if final_events else ""

    norm_hyp = normalize_text(hypothesis, lang)
    norm_ref = normalize_text(reference, lang)

    try:
        import jiwer
        if lang == "ja":
            # For Japanese, compute Character Error Rate
            cer = jiwer.cer(norm_ref, norm_hyp)
            return {"asr.cer": round(cer, 4)}
        else:
            wer = jiwer.wer(norm_ref, norm_hyp)
            return {"asr.wer": round(wer, 4)}
    except ImportError:
        cer = compute_cer(norm_hyp, norm_ref)
        return {"asr.cer": round(cer, 4)}
