# Local LLM brain (Qwen) + paid option

Live calls let the operator pick the conversation brain per call
(**Agent settings → Conversation brain**): `Template`, `Local Qwen`, or `OpenAI`.

## How it works

- **Template** (default): deterministic scripts in `services/agent/app/generalized.py`.
  Always available. Replies are rule-based; verification / promise / escalation
  events fire only on detected caller intent.
- **Local Qwen** (free): the model *restyles* the template reply within
  guardrails — it can never change the decision (events) or add new claims
  (no invented verification, promises, emails, or amounts; violations fall
  back to the template text). Needs Ollama running (see below).
- **OpenAI** (paid): same phrasing path via the API. Needs `OPENAI_API_KEY`
  on the agent service; otherwise falls back to templates.

The HUD `Brain:` badge always shows the model actually in effect
(`Template`, `local:qwen3:1.7b`, `openai:gpt-4o-mini`, …), and turn metrics
carry real latency + token counts — never placeholders.

## Run Qwen locally (CPU)

```powershell
winget install Ollama.Ollama
ollama run qwen3:1.7b
```

- `qwen3:1.7b` (~1.2 GB RAM): fastest, fine for testing.
- `qwen3:4b` (~2.5 GB RAM): noticeably better conversation if RAM allows.
- Point elsewhere with `OLLAMA_BASE_URL`, change default with `AGENT_LOCAL_MODEL`.

Then start the stack, open a live call, and pick **Local Qwen** in Agent
settings. The dot turns green when the UI can reach Ollama. If the model
is slow or down mid-call, that turn silently falls back to the template
reply — the call never breaks.

## Finetune later

1. Collect data: `services/agent/audit_logs/` + human labels from the
   Labeling screen are your SFT/preference dataset.
2. Train: LLaMA-Factory or Unsloth QLoRA on a Colab/Kaggle GPU.
3. Export: `llama.cpp` GGUF conversion → `ollama create voicebench-collections -f Modelfile`.
4. Serve: `ollama run voicebench-collections`, type the name into the UI's
   model field, and validate with the champion/challenger eval harness
   before promoting it.
