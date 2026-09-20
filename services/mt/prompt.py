"""
Prompt formatting contracts for streaming MT.
Kept terse deliberately: decode time is proportional to output length.
"""

SYSTEM = """Translate {src} to {tgt}. Output ONLY the translation.
No preamble, no quotes. Preserve numbers and proper nouns exactly."""

def build_prompt(text: str, src: str, tgt: str, context: list[str]) -> str:
    """
    Constructs the prompt including rolling context of the last 3 utterances.
    """
    ctx = "\n".join(context[-3:]) if context else "(None)"
    return f"{SYSTEM.format(src=src, tgt=tgt)}\n\nContext:\n{ctx}\n\nTranslate:\n{text}"
