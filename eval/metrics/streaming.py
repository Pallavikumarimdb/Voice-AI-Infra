"""
Pure function streaming quality metrics (flicker rate, first partial latency, finalize latency).
Contract: (log: list[dict], reference: Any = None) -> dict[str, float]
"""

def compute(log: list[dict], reference=None) -> dict[str, float]:
    partials = [e for e in log if e.get("stage") == "asr_partial" or e.get("type") == "partial"]
    finals = [e for e in log if e.get("stage") == "asr_final" or e.get("type") == "final"]

    # 1. First partial latency
    first_partial_ms = 0.0
    if partials:
        p0 = partials[0]
        t_capture = p0.get("tCapture", 0)
        t_emit = p0.get("tEmit", 0)
        if t_capture and t_emit:
            first_partial_ms = max(0.0, float(t_emit - t_capture))

    # 2. Finalize latency
    finalize_ms = 0.0
    if finals:
        f0 = finals[0]
        t_capture = f0.get("tCapture", 0)
        t_final = f0.get("tFinal", 0)
        if t_capture and t_final:
            finalize_ms = max(0.0, float(t_final - t_capture))

    # 3. Flicker rate
    # Flicker measures the amount of text retroactively rewritten/erased across consecutive partials.
    total_reversals = 0
    total_length = 0

    prev_text = ""
    for p in partials:
        curr_text = p.get("text", "")
        # Common prefix between consecutive partial hypotheses
        l = 0
        min_len = min(len(prev_text), len(curr_text))
        while l < min_len and prev_text[l] == curr_text[l]:
            l += 1

        erased_chars = len(prev_text) - l
        total_reversals += erased_chars
        total_length += len(curr_text)
        prev_text = curr_text

    flicker_rate = float(total_reversals) / float(max(1, total_length))

    return {
        "streaming.flicker_rate": round(flicker_rate, 4),
        "streaming.first_partial_ms": round(first_partial_ms, 1),
        "streaming.finalize_ms": round(finalize_ms, 1),
    }
