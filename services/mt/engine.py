import os
import time
from uuid import uuid4
from prompt import build_prompt

class MTEngine:
    def __init__(
        self,
        model_name: str = "Qwen/Qwen2.5-7B-Instruct",
        dtype: str = "float16",
        gpu_memory_utilization: float = 0.85,
        max_num_seqs: int = 64
    ):
        self.model_name = model_name
        self.dtype = dtype
        self.gpu_memory_utilization = gpu_memory_utilization
        self.max_num_seqs = max_num_seqs
        self.vllm_engine = None
        self._init_engine()

    def _init_engine(self):
        try:
            from vllm import AsyncLLMEngine, AsyncEngineArgs
            import torch

            if not torch.cuda.is_available():
                print("[MT Engine] CUDA unavailable. vLLM requires CUDA. Using dev mock mode.")
                return

            print(f"[MT Engine] Initializing vLLM AsyncLLMEngine with {self.model_name}...")
            engine_args = AsyncEngineArgs(
                model=self.model_name,
                dtype=self.dtype,
                gpu_memory_utilization=self.gpu_memory_utilization,
                max_num_seqs=self.max_num_seqs
            )
            self.vllm_engine = AsyncLLMEngine.from_engine_args(engine_args)
            print("[MT Engine] vLLM AsyncLLMEngine initialized successfully.")
        except Exception as e:
            print(f"[MT Engine] Notice: vLLM initialization skipped or failed: {e}. Dev mock fallback active.")
            self.vllm_engine = None

    async def translate(self, text: str, src_lang: str, tgt_lang: str, context: list[str]) -> dict:
        """
        Translates text using vLLM continuous batching.
        Measures TTFT and decode duration.
        """
        prompt = build_prompt(text, src_lang, tgt_lang, context)
        request_id = str(uuid4())
        start_time = time.perf_counter()

        if self.vllm_engine is not None:
            from vllm import SamplingParams
            params = SamplingParams(temperature=0.0, max_tokens=128, stop=["\n"])
            result_generator = self.vllm_engine.generate(prompt, params, request_id)

            ttft_ms = None
            final_output = None
            token_count = 0

            async for output in result_generator:
                if ttft_ms is None and len(output.outputs[0].token_ids) > 0:
                    ttft_ms = (time.perf_counter() - start_time) * 1000.0
                final_output = output

            end_time = time.perf_counter()
            total_duration_ms = (end_time - start_time) * 1000.0
            ttft_ms = ttft_ms or total_duration_ms
            decode_ms = max(0.0, total_duration_ms - ttft_ms)
            
            translation_text = final_output.outputs[0].text.strip() if final_output else ""
            token_count = len(final_output.outputs[0].token_ids) if final_output else 0

            return {
                "translation": translation_text,
                "ttft_ms": round(ttft_ms, 2),
                "decode_ms": round(decode_ms, 2),
                "tokensOut": token_count
            }

        # Dev / benchmark mock response when testing without GPU box
        await asyncio_sleep(0.08) # simulate TTFT ~80ms
        ttft_ms = 82.0
        await asyncio_sleep(0.12) # simulate decode ~120ms
        decode_ms = 124.0

        # Simple dictionary mock for dev inspection
        dev_dict = {
            "こんにちは": "Hello.",
            "すみません、駅はどこですか": "Excuse me, where is the station?",
            "はじめまして": "Nice to meet you.",
            "ありがとう": "Thank you."
        }
        translated = dev_dict.get(text.strip(), f"[Translated ({src_lang}->{tgt_lang})]: {text}")

        return {
            "translation": translated,
            "ttft_ms": ttft_ms,
            "decode_ms": decode_ms,
            "tokensOut": len(translated.split())
        }

async def asyncio_sleep(sec: float):
    import asyncio
    await asyncio.sleep(sec)
