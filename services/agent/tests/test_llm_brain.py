"""LLM brain selection: fallback honesty + event integrity (no model can self-declare outcomes)."""
import os
import sys

agent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

from app.generalized import GeneralizedVoiceAgent
from app.compliance.guard import ComplianceGuard


def make_agent():
    return GeneralizedVoiceAgent(guard=ComplianceGuard())


def base_config(extra=None):
    cfg = {"domain": "collections", "language": "en", "greeting": "Hi.", "context": {}}
    if extra:
        cfg.update(extra)
    return cfg


def test_template_default_needs_no_llm():
    agent = make_agent()
    state = {}
    res = agent.process_turn("s1", "Hello?", state, config=base_config(), audit_logger=None)
    assert res["text"]
    assert res["metrics"]["model"] == "template_collections_en"
    assert res["metrics"]["tokensIn"] == 0


def test_unreachable_local_falls_back_to_template():
    agent = make_agent()
    state = {}
    cfg = base_config({"llm": {"provider": "local", "model": "qwen3:1.7b"}})
    # No Ollama running in CI: must not raise, must serve the template reply.
    res = agent.process_turn("s1", "Hello?", state, config=cfg, audit_logger=None)
    assert res["text"]
    assert res["metrics"]["model"] == "template_collections_en"


def test_unknown_provider_falls_back_safely():
    agent = make_agent()
    state = {}
    cfg = base_config({"llm": {"provider": "not-a-provider", "model": "x"}})
    res = agent.process_turn("s1", "Hello?", state, config=cfg, audit_logger=None)
    assert res["text"]
    assert res["metrics"]["model"].startswith("template_")


def test_no_false_verify_or_promise_events():
    agent = make_agent()
    state = {}
    cfg = base_config()
    r1 = agent.process_turn("s1", "Hello.", state, config=cfg, audit_logger=None)
    types1 = [e["type"] for e in r1["events"]]
    assert "identity_verified" not in types1
    assert "promise_to_pay" not in types1
    r2 = agent.process_turn("s1", "Just browsing, thanks.", state, config=cfg, audit_logger=None)
    types2 = [e["type"] for e in r2["events"]]
    assert "identity_verified" not in types2
    assert "promise_to_pay" not in types2


def test_evidence_gated_verify_and_promise():
    agent = make_agent()
    state = {}
    cfg = base_config()
    agent.process_turn("s1", "Hi.", state, config=cfg, audit_logger=None)
    r2 = agent.process_turn("s1", "Alex, born April 15 1988.", state, config=cfg, audit_logger=None)
    assert "identity_verified" in [e["type"] for e in r2["events"]]
    assert "promise_to_pay" not in [e["type"] for e in r2["events"]]
    r3 = agent.process_turn("s1", "Yes, I can pay on Friday.", state, config=cfg, audit_logger=None)
    assert "promise_to_pay" in [e["type"] for e in r3["events"]]
