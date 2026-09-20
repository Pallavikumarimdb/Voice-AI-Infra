from enum import Enum
import numpy as np

class State(Enum):
    IDLE = "IDLE"
    SPEECH = "SPEECH"
    FINALIZING = "FINALIZING"

class AudioRingBuffer:
    def __init__(self, max_samples: int = 16000 * 30):  # 30 seconds max buffer
        self.buffer = np.array([], dtype=np.float32)
        self.max_samples = max_samples

    def append(self, samples: np.ndarray):
        if len(self.buffer) == 0:
            self.buffer = samples.astype(np.float32)
        else:
            self.buffer = np.concatenate([self.buffer, samples.astype(np.float32)])
        if len(self.buffer) > self.max_samples:
            self.buffer = self.buffer[-self.max_samples:]

    def get_all(self) -> np.ndarray:
        return self.buffer

    def clear(self):
        self.buffer = np.array([], dtype=np.float32)

    def trim_samples(self, count: int):
        if count >= len(self.buffer):
            self.buffer = np.array([], dtype=np.float32)
        else:
            self.buffer = self.buffer[count:]

class Segmenter:
    """
    Voice activity detection and segmentation state machine.
    - Transitions from IDLE to SPEECH when speech_prob > 0.5.
    - Captures preroll audio preceding speech start.
    - Finalizes when silence >= hangover_ms or duration >= max_len_ms.
    """
    def __init__(self, hangover_ms: int = 500, preroll_ms: int = 200, max_len_ms: int = 18000, sample_rate: int = 16000):
        self.hangover_ms = hangover_ms
        self.preroll_ms = preroll_ms
        self.max_len_ms = max_len_ms
        self.sample_rate = sample_rate

        self.state = State.IDLE
        self.buffer = AudioRingBuffer()
        self.silence_run_ms = 0
        self.speech_run_frames = 0
        self.segment_start_ms = 0

    def on_frame(self, frame_samples: np.ndarray, prob: float, t_ms: int, frame_ms: int = 20) -> np.ndarray | None:
        self.buffer.append(frame_samples)

        if prob > 0.5:
            self.speech_run_frames += 1
            self.silence_run_ms = 0
            if self.state == State.IDLE and self.speech_run_frames >= 2:
                self.state = State.SPEECH
                self.segment_start_ms = max(0, t_ms - self.preroll_ms)
        else:
            self.speech_run_frames = 0
            if self.state == State.SPEECH:
                self.silence_run_ms += frame_ms

        # Finalization trigger: hangover exceeded or forced cut on max length
        if self.state == State.SPEECH:
            duration_ms = t_ms - self.segment_start_ms
            if self.silence_run_ms >= self.hangover_ms or duration_ms >= self.max_len_ms:
                segment = self.buffer.get_all().copy()
                self.buffer.clear()
                self.state = State.IDLE
                self.silence_run_ms = 0
                self.speech_run_frames = 0
                return segment

        return None

    def force_finalize(self) -> np.ndarray | None:
        if len(self.buffer.get_all()) > 0:
            segment = self.buffer.get_all().copy()
            self.buffer.clear()
            self.state = State.IDLE
            return segment
        return None
