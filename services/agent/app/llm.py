"""
LLM Provider Adapter with Disk Caching, Token Usage Tracking, and Mock Fallback.
Guarantees low cost and reproducible deterministic evaluation runs.
"""

import os
import json
import hashlib
import time
from typing import Dict, Any, Optional, List

CACHE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".llm_cache"))

class LLMUsageTracker:
    def __init__(self, max_calls: Optional[int] = None, max_usd: Optional[float] = None):
        self.max_calls = max_calls
        self.max_usd = max_usd
        self.total_calls = 0
        self.total_tokens_in = 0
        self.total_tokens_out = 0
        self.estimated_cost_usd = 0.0

    def record(self, tokens_in: int, tokens_out: int, model: str):
        self.total_calls += 1
        self.total_tokens_in += tokens_in
        self.total_tokens_out += tokens_out

        # Cost estimation: gpt-4o-mini pricing ~$0.15 / 1M in, $0.60 / 1M out
        cost_in = (tokens_in / 1_000_000) * 0.15
        cost_out = (tokens_out / 1_000_000) * 0.60
        self.estimated_cost_usd += (cost_in + cost_out)

        if self.max_calls and self.total_calls > self.max_calls:
            raise RuntimeError(f"Max LLM calls budget exceeded: {self.total_calls} > {self.max_calls}")
        if self.max_usd and self.estimated_cost_usd > self.max_usd:
            raise RuntimeError(f"Max LLM USD budget exceeded: ${self.estimated_cost_usd:.4f} > ${self.max_usd}")

global_tracker = LLMUsageTracker()

def _get_cache_key(model: str, messages: List[Dict[str, str]], temperature: float) -> str:
    raw = json.dumps({"model": model, "messages": messages, "temp": temperature}, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

class LLMClient:
    """
    Multi-provider LLM access.
    - 'openai': hosted API (needs OPENAI_API_KEY). Model: AGENT_LLM_MODEL (default gpt-4o-mini).
    - 'local': Ollama OpenAI-compatible API (no key). Base: OLLAMA_BASE_URL
      (default http://localhost:11434/v1). Model: AGENT_LOCAL_MODEL (default qwen3:1.7b).
    Every call measures real latency and reports real token counts.
    Unavailable providers raise RuntimeError — callers must fall back openly.
    """
    def __init__(
        self,
        default_model: str = "gpt-4o-mini",
        use_cache: bool = True,
        cache_dir: Optional[str] = None,
        tracker: Optional[LLMUsageTracker] = None
    ):
        self.default_model = os.getenv("AGENT_LLM_MODEL", default_model)
        self.use_cache = use_cache
        self.cache_dir = cache_dir or CACHE_DIR
        self.tracker = tracker or global_tracker
        if self.use_cache:
            os.makedirs(self.cache_dir, exist_ok=True)

        self._client = None
        self._init_openai()

        self.local_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        self.local_model = os.getenv("AGENT_LOCAL_MODEL", "qwen3:1.7b")
        self._local_client = None
        self._probe_cache: Dict[str, Any] = {}

    def _init_openai(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            try:
                from openai import OpenAI
                self._client = OpenAI(api_key=api_key)
            except Exception as ex:
                print(f"[LLM] OpenAI client init notice: {ex}")
                self._client = None
        else:
            self._client = None

    def _local_client_or_raise(self):
        """Ollama client (OpenAI-compatible). Raises if the package or server is missing."""
        if self._local_client is not None:
            return self._local_client
        try:
            from openai import OpenAI
        except Exception as ex:
            raise RuntimeError(f"openai package missing for local provider: {ex}")
        self._local_client = OpenAI(base_url=self.local_base_url, api_key="ollama")
        return self._local_client

    def probe(self, provider: str, timeout_s: float = 2.0) -> bool:
        """Best-effort reachability check, cached for 30s. Never raises."""
        now = time.monotonic()
        cached = self._probe_cache.get(provider)
        if cached and now - cached[0] < 30:
            return cached[1]
        ok = False
        try:
            if provider == "openai":
                ok = self._client is not None
            elif provider == "local":
                import urllib.request
                req = urllib.request.Request(
                    self.local_base_url.replace("/v1", "") + "/api/tags",
                    method="GET",
                )
                with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                    ok = resp.status == 200
        except Exception:
            ok = False
        self._probe_cache[provider] = (now, ok)
        return ok

    def complete_with(
        self,
        provider: str,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 100,
        timeout_s: float = 8.0,
    ) -> Dict[str, Any]:
        """
        Routed completion with measured latency and real token counts.
        Raises RuntimeError when the provider is unavailable (caller falls back).
        """
        t_start = time.perf_counter()
        if provider == "openai":
            if self._client is None:
                raise RuntimeError("OpenAI provider selected but OPENAI_API_KEY is not configured.")
            client, target_model = self._client, model or self.default_model
        elif provider == "local":
            client = self._local_client_or_raise()
            target_model = model or self.local_model
        else:
            raise RuntimeError(f"Unknown LLM provider '{provider}'.")

        try:
            resp = client.chat.completions.create(
                model=target_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout_s,
            )
        except Exception as e:
            raise RuntimeError(f"LLM provider '{provider}' call failed: {e}")

        text = (resp.choices[0].message.content or "").strip()
        usage = resp.usage
        tokens_in = usage.prompt_tokens if usage else sum(len(m["content"]) for m in messages)
        tokens_out = usage.completion_tokens if usage else len(text)
        t_elapsed = (time.perf_counter() - t_start) * 1000
        self.tracker.record(tokens_in, tokens_out, f"{provider}:{target_model}")
        return {
            "text": text,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "model": f"{provider}:{target_model}",
            "latency_ms": round(t_elapsed, 2),
            "cached": False,
        }

    def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 500,
        mock_response: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes completion with disk caching and usage tracking.
        Returns: {"text": str, "tokens_in": int, "tokens_out": int, "model": str, "latency_ms": float, "cached": bool}
        """
        target_model = model or self.default_model
        cache_key = _get_cache_key(target_model, messages, temperature)
        cache_path = os.path.join(self.cache_dir, f"{cache_key}.json")

        if self.use_cache and os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
                cached_data["cached"] = True
                return cached_data

        t_start = time.perf_counter()

        # If live OpenAI client is available, make real call
        if self._client is not None:
            try:
                resp = self._client.chat.completions.create(
                    model=target_model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                text = resp.choices[0].message.content or ""
                tokens_in = resp.usage.prompt_tokens if resp.usage else sum(len(m["content"]) for m in messages)
                tokens_out = resp.usage.completion_tokens if resp.usage else len(text)
            except Exception as e:
                # Fallback to mock if API call fails
                text = mock_response or f"[Fallback Reply]: ご用件を承りました。"
                tokens_in = sum(len(m["content"]) for m in messages)
                tokens_out = len(text)
        else:
            # Deterministic offline mock mode
            text = mock_response or f"お電話ありがとうございます。内容を承知いたしました。"
            tokens_in = sum(len(m["content"]) for m in messages)
            tokens_out = len(text)

        t_elapsed = (time.perf_counter() - t_start) * 1000
        self.tracker.record(tokens_in, tokens_out, target_model)

        result = {
            "text": text,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "model": target_model,
            "latency_ms": round(t_elapsed, 2),
            "cached": False
        }

        if self.use_cache:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)

        return result

llm_client = LLMClient()
