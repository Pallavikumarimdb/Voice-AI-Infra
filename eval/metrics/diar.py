"""
Pure function Diarization metrics (DER placeholder).
Contract: (log: list[dict], reference: Any) -> dict[str, float]
"""

def compute(log: list[dict], reference=None) -> dict[str, float]:
    return {
        "diar.der": 0.12 # baseline 12% DER placeholder for pyannote offline benchmark
    }
