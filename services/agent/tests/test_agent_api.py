import os
import sys
import pytest
from fastapi.testclient import TestClient

agent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

from app.main import app

client = TestClient(app)

def test_healthz():
    resp = client.get("/healthz")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "agent"

def test_turn_echo():
    req_payload = {
        "sessionId": "s_test_123",
        "uttId": 1,
        "text": "田中です",
        "tCaptureMs": 1700000000000,
        "context": []
    }
    resp = client.post("/turn", json=req_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "text" in data
    assert "田中です" in data["text"]
    assert "events" in data
    assert len(data["events"]) > 0
    assert data["events"][0]["type"] == "state_change"
    assert "metrics" in data
    assert data["metrics"]["tokensIn"] > 0
    assert data["metrics"]["model"] == "agent_stub_v0"

def test_session_lifecycle():
    # Start session
    start_resp = client.post("/session/start", json={"sessionId": "s_lifecycle", "debtorId": "deb_002"})
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "started"

    # End session
    end_resp = client.post("/session/end", json={"sessionId": "s_lifecycle"})
    assert end_resp.status_code == 200
    assert end_resp.json()["status"] == "ended"
