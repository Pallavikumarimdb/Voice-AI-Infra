from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Voice Diarization Service (Optional)", version="0.1.0")

class DiarizeRequest(BaseModel):
    sessionId: str = Field(..., pattern=r"^[a-zA-Z0-9_\-]{1,128}$")
    audioPath: str = Field(..., max_length=256, pattern=r"^[a-zA-Z0-9_\-./\\]+$")

@app.post("/diarize")
async def diarize(req: DiarizeRequest):
    """
    Offline/Batch pyannote diarization placeholder for computing DER.
    """
    return {
        "sessionId": req.sessionId,
        "speakers": [
            {"speaker": "SPEAKER_00", "start": 0.0, "end": 2.5},
            {"speaker": "SPEAKER_01", "start": 2.6, "end": 5.1}
        ]
    }

@app.get("/health")
async def health():
    return {"status": "ok", "service": "diarization"}
