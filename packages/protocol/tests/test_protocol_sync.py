"""
Test to verify that Python Pydantic models in protocol.py stay in sync with packages/protocol/src/index.ts
"""

import os
import re
import pytest
from pydantic import BaseModel

protocol_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import sys
sys.path.insert(0, protocol_dir)

from protocol import BrainRequest, BrainResponse, BrainEvent, BrainMetrics, BrainEventType

def test_brain_event_types_sync():
    ts_file = os.path.join(protocol_dir, "src", "index.ts")
    with open(ts_file, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract TS BrainEventType
    match = re.search(r"export type BrainEventType\s*=\s*([^;]+);", content)
    assert match, "Could not find BrainEventType in index.ts"
    raw_types = match.group(1)
    ts_types = set(re.findall(r"'([^']+)'", raw_types))

    # Python BrainEventType literal values
    py_types = set(BrainEventType.__args__)
    assert ts_types == py_types, f"BrainEventType mismatch: TS={ts_types} vs PY={py_types}"

def test_pydantic_schema_validation():
    req = BrainRequest(
        sessionId="s_test",
        uttId=1,
        text="こんにちは",
        tCaptureMs=1000,
        config={"key": "val"},
        context=["prev utterance"]
    )
    assert req.sessionId == "s_test"
    assert req.uttId == 1
    assert req.text == "こんにちは"

    resp = BrainResponse(
        text="ご用件をお伺いします。",
        events=[
            BrainEvent(
                type="state_change",
                payload={"phase": "verify_identity"},
                ts=1050
            )
        ],
        metrics=BrainMetrics(
            llmMs=45.2,
            ttftMs=12.0,
            tokensIn=15,
            tokensOut=10,
            model="gpt-4o-mini"
        )
    )
    assert resp.text == "ご用件をお伺いします。"
    assert len(resp.events) == 1
    assert resp.events[0].type == "state_change"
    assert resp.metrics.tokensIn == 15
