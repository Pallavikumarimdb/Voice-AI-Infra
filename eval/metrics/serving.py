"""
Pure function serving & GPU efficiency metrics.
Contract: (log: list[dict], reference: Any = None) -> dict[str, float]
"""

def compute(log: list[dict], reference=None) -> dict[str, float]:
    mt_events = [e for e in log if e.get("stage") == "mt_translated" or e.get("type") == "translated"]
    if not mt_events:
        return {"serving.tokens_per_sec": 0.0, "serving.avg_ttft_ms": 0.0}

    total_tokens = sum(e.get("tokensOut", 0) for e in mt_events)
    total_decode_time_s = sum(e.get("decodeMs", 0.0) / 1000.0 for e in mt_events)
    avg_ttft = sum(e.get("ttftMs", 0.0) for e in mt_events) / len(mt_events)

    tps = float(total_tokens) / max(0.001, total_decode_time_s) if total_decode_time_s > 0 else 0.0

    return {
        "serving.tokens_per_sec": round(tps, 1),
        "serving.avg_ttft_ms": round(avg_ttft, 1)
    }
