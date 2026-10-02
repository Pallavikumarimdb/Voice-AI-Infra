"""
ASR Noise Injection Layer for Synthetic Debtor Evaluation.
Simulates speech-to-text transcript noise:
1. Homophone and kanji swaps (e.g., 払う -> 払え, 円 -> 縁, 年 -> 念)
2. Dropped grammatical particles (は, が, を, に, で)
3. Misheard or digit-formatted numbers
"""

import random
import re
from typing import Optional

HOMOPHONE_MAP = {
    "円": "縁",
    "田中": "田仲",
    "支払": "市原",
    "全額": "前額",
    "振込": "降込",
    "来週": "回収",
    "来月": "大月",
    "分割": "文かつ",
    "口座": "高座"
}

PARTICLES = ["は", "が", "を", "に", "で", "と", "も"]

class ASRNoiseGenerator:
    def __init__(self, seed: Optional[int] = None, error_rate: float = 0.15):
        self.error_rate = error_rate
        self.rng = random.Random(seed)

    def apply_noise(self, text: str) -> str:
        """Applies realistic ASR transcription noise to text."""
        if self.rng.random() > self.error_rate:
            return text

        chars = list(text)
        result = []

        # 1. Dropped particles (common in fast/casual conversational ASR)
        for char in chars:
            if char in PARTICLES and self.rng.random() < 0.3:
                continue # drop particle
            result.append(char)
        noisy_text = "".join(result)

        # 2. Homophone substitutions
        for correct, corrupted in HOMOPHONE_MAP.items():
            if correct in noisy_text and self.rng.random() < 0.35:
                noisy_text = noisy_text.replace(correct, corrupted, 1)

        return noisy_text
