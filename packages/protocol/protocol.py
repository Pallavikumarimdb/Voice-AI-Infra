"""
Shared Python Pydantic models for the Brain contract and streaming messages.
Kept in sync with packages/protocol/src/index.ts.
"""

from typing import Literal, Optional, Any, Dict, List
from pydantic import BaseModel, Field

BrainEventType = Literal[
    "state_change",
    "tool_call",
    "compliance_block",
    "escalate",
    "identity_verified",
    "promise_to_pay",
    "stop_contact",
    "end_call",
    "candidate_qualified",
    "kyc_verified",
    "rubric_scored"
]

class BrainEvent(BaseModel):
    type: BrainEventType
    payload: Dict[str, Any] = Field(default_factory=dict)
    ts: int

class BrainMetrics(BaseModel):
    llmMs: float
    ttftMs: Optional[float] = None
    tokensIn: int = 0
    tokensOut: int = 0
    model: str = "default"

class BrainRequest(BaseModel):
    sessionId: str
    uttId: int
    text: str
    tCaptureMs: Optional[int] = None
    config: Optional[Dict[str, Any]] = None
    context: Optional[List[str]] = None

class BrainResponse(BaseModel):
    text: str
    events: List[BrainEvent] = Field(default_factory=list)
    metrics: BrainMetrics
