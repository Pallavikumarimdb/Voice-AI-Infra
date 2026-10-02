"""
Voice Agent Service - FastAPI Entrypoint
Endpoints:
- POST /turn: Process caller utterance through conversation brain
- POST /session/start: Initialize debtor session & state
- POST /session/end: Finalize session, write audit, produce handoff
- GET /metrics: Prometheus metrics
- GET /healthz: Service health check
"""

import time
from typing import Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from prometheus_client import Histogram, Counter, generate_latest, CONTENT_TYPE_LATEST

from .protocol import BrainRequest, BrainResponse, BrainEvent, BrainMetrics

app = FastAPI(title="Voice Collections Agent Service", version="0.1.0")

# Prometheus Metrics
AGENT_TURN_LATENCY = Histogram(
    "agent_turn_latency_seconds",
    "Time spent processing a turn in the agent",
    ["stage"],
    buckets=[0.05, 0.1, 0.2, 0.5, 1.0, 1.5, 2.0, 3.0]
)
AGENT_CALLS_TOTAL = Counter(
    "agent_calls_total",
    "Total agent calls by outcome",
    ["outcome"]
)
AGENT_COMPLIANCE_BLOCKS_TOTAL = Counter(
    "agent_compliance_blocks_total",
    "Total compliance blocks triggered",
    ["rule"]
)
AGENT_ESCALATIONS_TOTAL = Counter(
    "agent_escalations_total",
    "Total agent escalations triggered",
    ["reason"]
)
AGENT_LLM_TOKENS_TOTAL = Counter(
    "agent_llm_tokens_total",
    "Total LLM tokens consumed",
    ["direction"]
)

# Active session states (in-memory registry or checkpoint store)
sessions: Dict[str, Dict[str, Any]] = {}

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "agent", "sessions_active": len(sessions)}

@app.get("/metrics")
async def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/session/start")
async def session_start(payload: Dict[str, Any]):
    session_id = payload.get("sessionId", f"s_{int(time.time()*1000)}")
    debtor_id = payload.get("debtorId", "deb_001")
    variant = payload.get("variant", "v2_graph")

    sessions[session_id] = {
        "sessionId": session_id,
        "debtorId": debtor_id,
        "variant": variant,
        "createdAt": int(time.time() * 1000),
        "turnCount": 0
    }
    return {"status": "started", "sessionId": session_id, "variant": variant}

@app.post("/session/end")
async def session_end(payload: Dict[str, Any]):
    session_id = payload.get("sessionId")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = sessions.pop(session_id)
    return {"status": "ended", "session": session}

@app.post("/turn", response_model=BrainResponse)
async def turn(req: BrainRequest) -> BrainResponse:
    t_start = time.perf_counter()

    # Track or get session
    session = sessions.setdefault(req.sessionId, {
        "sessionId": req.sessionId,
        "turnCount": 0,
        "createdAt": int(time.time() * 1000)
    })
    session["turnCount"] = session.get("turnCount", 0) + 1

    # Echo stub implementation for M1 (replaced by Graph/Baseline in M2)
    # Checks if handler is injected or returns structured echo response
    with AGENT_TURN_LATENCY.labels(stage="turn_total").time():
        t_now_ms = int(time.time() * 1000)
        
        # Default polite echo response for M1 stub
        reply_text = f"お電話ありがとうございます。お伺いいたしました：{req.text}"
        events = [
            BrainEvent(
                type="state_change",
                payload={"phase": "greet", "turnCount": session["turnCount"]},
                ts=t_now_ms
            )
        ]

        llm_ms = (time.perf_counter() - t_start) * 1000

        metrics = BrainMetrics(
            llmMs=round(llm_ms, 2),
            ttftMs=round(llm_ms / 2, 2),
            tokensIn=len(req.text),
            tokensOut=len(reply_text),
            model="agent_stub_v0"
        )

        AGENT_LLM_TOKENS_TOTAL.labels(direction="in").inc(len(req.text))
        AGENT_LLM_TOKENS_TOTAL.labels(direction="out").inc(len(reply_text))

        return BrainResponse(
            text=reply_text,
            events=events,
            metrics=metrics
        )
