import os
import time
import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from prometheus_client import Histogram, Counter, generate_latest, CONTENT_TYPE_LATEST

from engine import MTEngine

app = FastAPI(title="Voice MT Service (vLLM)", version="0.1.0")

# Prometheus Metrics
TTFT_HISTOGRAM = Histogram(
    "mt_ttft_seconds",
    "Time to first token in MT generation",
    buckets=[0.02, 0.05, 0.08, 0.12, 0.2, 0.35, 0.6, 1.0, 2.0]
)
DECODE_HISTOGRAM = Histogram(
    "mt_decode_seconds",
    "Time spent decoding remaining tokens in MT generation",
    buckets=[0.05, 0.1, 0.15, 0.25, 0.4, 0.7, 1.2, 2.0]
)
TRANSLATIONS_TOTAL = Counter(
    "mt_translations_total",
    "Total translations performed",
    ["status"]
)

engine = MTEngine(
    model_name=os.getenv("MT_MODEL", "Qwen/Qwen2.5-7B-Instruct"),
    dtype=os.getenv("MT_DTYPE", "float16"),
    gpu_memory_utilization=float(os.getenv("MT_GPU_MEMORY_UTILIZATION", "0.85")),
    max_num_seqs=int(os.getenv("MT_MAX_NUM_SEQS", "64"))
)

class TranslateRequest(BaseModel):
    uttId: int
    text: str
    srcLang: str = "ja"
    tgtLang: str = "en"
    context: list[str] = []

class TranslateResponse(BaseModel):
    translation: str
    ttft_ms: float
    decode_ms: float
    tokensOut: int

@app.get("/metrics")
async def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engine_active": engine.vllm_engine is not None,
        "model": engine.model_name
    }

@app.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    if not req.text.strip():
        return TranslateResponse(translation="", ttft_ms=0.0, decode_ms=0.0, tokensOut=0)

    try:
        res = await engine.translate(
            text=req.text,
            src_lang=req.srcLang,
            tgt_lang=req.tgtLang,
            context=req.context
        )

        TTFT_HISTOGRAM.observe(res["ttft_ms"] / 1000.0)
        DECODE_HISTOGRAM.observe(res["decode_ms"] / 1000.0)
        TRANSLATIONS_TOTAL.labels(status="success").inc()

        # Emit structured log for eval replay
        print(json.dumps({
            "stage": "mt_translated",
            "uttId": req.uttId,
            "ttftMs": res["ttft_ms"],
            "decodeMs": res["decode_ms"],
            "tokensOut": res["tokensOut"],
            "translation": res["translation"]
        }))

        return TranslateResponse(
            translation=res["translation"],
            ttft_ms=res["ttft_ms"],
            decode_ms=res["decode_ms"],
            tokensOut=res["tokensOut"]
        )
    except Exception as e:
        TRANSLATIONS_TOTAL.labels(status="error").inc()
        print(f"[MT] Translation error for uttId {req.uttId}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
