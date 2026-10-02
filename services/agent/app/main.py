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
from .graph import CollectionsGraphAgent
from .baseline import BaselineCollectionsAgent
from .audit import AuditLogger
from .handoff import generate_handoff_summary
from .state import CallState
from .compliance.guard import ComplianceGuard

app = FastAPI(title="Voice Collections Agent Service", version="0.1.0")

# Pre-instantiate agents
guard = ComplianceGuard()
graph_agent = CollectionsGraphAgent(guard=guard, enable_slow_path=True)
graph_agent_fast_only = CollectionsGraphAgent(guard=guard, enable_slow_path=False)
baseline_agent = BaselineCollectionsAgent(guard=guard)

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

    audit_logger = AuditLogger(session_id)
    initial_state: CallState = {
        "session_id": session_id,
        "debtor_id": debtor_id,
        "messages": [],
        "phase": "greet",
        "identity_verified": False,
        "verification_attempts": 0,
        "disclosure_done": False,
        "balance": None,
        "approved_terms": {},
        "offers_made": [],
        "promise_to_pay": None,
        "stop_contact": False,
        "third_party_detected": False,
        "escalation_reason": None,
        "turn_count": 0,
        "flags": {}
    }

    sessions[session_id] = {
        "sessionId": session_id,
        "debtorId": debtor_id,
        "variant": variant,
        "state": initial_state,
        "audit_logger": audit_logger,
        "createdAt": int(time.time() * 1000)
    }
    return {"status": "started", "sessionId": session_id, "variant": variant}

@app.post("/session/end")
async def session_end(payload: Dict[str, Any]):
    session_id = payload.get("sessionId")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session_data = sessions.pop(session_id)
    audit_logger = session_data["audit_logger"]
    handoff = generate_handoff_summary(session_data["state"], audit_logger.log_path)
    return {"status": "ended", "sessionId": session_id, "handoff": handoff.model_dump()}

@app.post("/turn", response_model=BrainResponse)
async def turn(req: BrainRequest) -> BrainResponse:
    t_start = time.perf_counter()

    # Track or get session
    if req.sessionId not in sessions:
        # Initialize ad-hoc session
        audit_logger = AuditLogger(req.sessionId)
        initial_state: CallState = {
            "session_id": req.sessionId,
            "debtor_id": "deb_001",
            "messages": [],
            "phase": "greet",
            "identity_verified": False,
            "verification_attempts": 0,
            "disclosure_done": False,
            "balance": None,
            "approved_terms": {},
            "offers_made": [],
            "promise_to_pay": None,
            "stop_contact": False,
            "third_party_detected": False,
            "escalation_reason": None,
            "turn_count": 0,
            "flags": {}
        }
        sessions[req.sessionId] = {
            "sessionId": req.sessionId,
            "debtorId": "deb_001",
            "variant": "v2_graph",
            "state": initial_state,
            "audit_logger": audit_logger,
            "createdAt": int(time.time() * 1000)
        }

    session_data = sessions[req.sessionId]
    variant = session_data.get("variant", "v2_graph")
    state = session_data["state"]
    audit_logger = session_data["audit_logger"]

    # Select engine
    if variant == "v1_baseline":
        agent = baseline_agent
    elif variant == "v2_graph_no_slow_path":
        agent = graph_agent_fast_only
    else:
        agent = graph_agent

    with AGENT_TURN_LATENCY.labels(stage="turn_total").time():
        turn_result = agent.process_turn(req.sessionId, req.text, state, audit_logger)
        
        reply_text = turn_result["text"]
        raw_events = turn_result.get("events", [])
        raw_metrics = turn_result.get("metrics", {})

        brain_events = []
        for ev in raw_events:
            brain_events.append(BrainEvent(
                type=ev.get("type", "state_change"),
                payload=ev.get("payload", {}),
                ts=ev.get("ts", int(time.time() * 1000))
            ))

        brain_metrics = BrainMetrics(
            llmMs=raw_metrics.get("llmMs", 20.0),
            ttftMs=raw_metrics.get("ttftMs", 8.0),
            tokensIn=raw_metrics.get("tokensIn", len(req.text)),
            tokensOut=raw_metrics.get("tokensOut", len(reply_text)),
            model=raw_metrics.get("model", variant)
        )

        return BrainResponse(
            text=reply_text,
            events=brain_events,
            metrics=brain_metrics
        )
