from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io

app = FastAPI(title="Voice TTS Service (Optional)", version="0.1.0")

class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "en_default"

@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    """
    Synthesize text into a stream of raw PCM chunks (sentence-flushed).
    Placeholder implementation for Kokoro / Piper integration.
    """
    def dummy_pcm_generator():
        # Generates empty/silence PCM buffer chunk (16kHz 16-bit mono)
        chunk = b"\x00" * 3200 # 100ms silence
        yield chunk

    return StreamingResponse(dummy_pcm_generator(), media_type="audio/pcm")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "tts"}
