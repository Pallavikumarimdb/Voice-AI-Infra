"""
Voice TTS Service.
Provides streaming text-to-speech synthesis (16kHz 16-bit mono PCM).
Uses high-quality Japanese neural voices (edge-tts) with local fallback.
"""

import os
import io
import time
import asyncio
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Voice TTS Streaming Service", version="0.2.0")

class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "ja-JP-NanamiNeural"
    sample_rate: int = 16000

@app.get("/health")
async def health():
    return {"status": "ok", "service": "tts", "engine": "edge-tts-streaming"}

@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    """
    Synthesize text into a streaming sequence of 16kHz 16-bit mono PCM chunks.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    async def pcm_stream_generator():
        try:
            import edge_tts
            import soundfile as sf
            from scipy import signal

            voice = req.voice if req.voice.startswith("ja-") else "ja-JP-NanamiNeural"
            communicate = edge_tts.Communicate(req.text, voice=voice)
            
            # Accumulate audio data
            audio_bytes = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes.extend(chunk["data"])

            if audio_bytes:
                # Read into float array
                data, in_sr = sf.read(io.BytesIO(audio_bytes))
                if data.ndim > 1:
                    data = data.mean(axis=1)

                target_sr = req.sample_rate
                if in_sr != target_sr:
                    num_samples = int(len(data) * target_sr / in_sr)
                    data = signal.resample(data, num_samples).astype(np.float32)

                # Convert float32 [-1.0, 1.0] to int16 bytes
                pcm16 = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16).tobytes()

                # Stream out in 50ms frames (1600 bytes at 16kHz mono 16-bit)
                frame_bytes = 1600
                for i in range(0, len(pcm16), frame_bytes):
                    yield pcm16[i:i + frame_bytes]
                    await asyncio.sleep(0.01) # yield to event loop
                return
        except Exception as ex:
            print(f"[TTS] Notice: Falling back to local synthesizer due to: {ex}")

        # Local fallback: Generate soft sine tone speech envelope (16kHz 16-bit PCM)
        duration_s = max(0.5, min(len(req.text) * 0.12, 4.0))
        t = np.linspace(0, duration_s, int(16000 * duration_s), endpoint=False)
        # 440Hz modulated by envelope
        waveform = 0.3 * np.sin(2 * np.pi * 440 * t) * np.sin(np.pi * t / duration_s)
        pcm16 = (waveform * 32767).astype(np.int16).tobytes()

        frame_bytes = 1600
        for i in range(0, len(pcm16), frame_bytes):
            yield pcm16[i:i + frame_bytes]
            await asyncio.sleep(0.01)

    return StreamingResponse(pcm_stream_generator(), media_type="audio/pcm")
