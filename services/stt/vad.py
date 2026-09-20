import os
import torch
import numpy as np

class SileroVADWrapper:
    def __init__(self, threshold: float = 0.5, sample_rate: int = 16000):
        self.threshold = threshold
        self.sample_rate = sample_rate
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            # Attempt to load Silero VAD from torch hub
            model, _ = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                onnx=False
            )
            self.model = model
            self.model.eval()
            print("[VAD] Silero VAD loaded successfully.")
        except Exception as e:
            print(f"[VAD] Notice: Silero VAD hub loading failed or offline ({e}). Using energy-based fallback.")
            self.model = None

    def is_speech(self, audio_chunk_f32: np.ndarray) -> tuple[bool, float]:
        """
        Takes a 16kHz float32 audio chunk (typically 512 samples for 32ms, or 20-30ms)
        Returns (is_speech_bool, speech_probability)
        """
        if len(audio_chunk_f32) == 0:
            return False, 0.0

        if self.model is not None:
            try:
                tensor = torch.from_numpy(audio_chunk_f32).float()
                # Ensure appropriate chunk size (e.g. 512 samples for 16kHz)
                if len(tensor) < 512:
                    tensor = torch.nn.functional.pad(tensor, (0, 512 - len(tensor)))
                elif len(tensor) > 512:
                    tensor = tensor[:512]
                
                with torch.no_grad():
                    prob = self.model(tensor, self.sample_rate).item()
                return prob > self.threshold, float(prob)
            except Exception as ex:
                pass

        # Fallback energy-based calculation (RMS)
        rms = np.sqrt(np.mean(audio_chunk_f32 ** 2))
        prob = min(1.0, float(rms * 25.0))
        return prob > self.threshold, prob
