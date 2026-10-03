# Agent Evaluation Harness (`eval/agent/`)

Offline, reproducible evaluation of the voice agent: persona-driven call simulation, hard-fail compliance checks, LLM-as-judge rubric scoring, and human-label agreement — with results consumed directly by the Voicebench Results viewer and Call Inspector.

---

## 1. What This Component Does

- **Persona Simulation**: 10 caller personas (`personas/*.yaml`: cooperative, hostile, evasive, hardship, already_paid, third_party, stop_contact, off_script, interrupting, fails_verification) drive scripted multi-turn calls against agent variants.
- **Champion / Challenger Runs**: `run_suite.py --variant {v1_baseline,v1_no_guard,v2_graph,v2_graph_no_slow_path} --n 5` (calls per persona) and writes `results/runs_<variant>.json` (per-call hard-fail records, judge scores, promise outcomes, latencies).
- **Hard-Fail Checks**: `checks/hard_fail.py` flags compliance violations (e.g. pre-verification disclosure) on attempted and final agent text.
- **LLM-as-Judge**: `judge/judge.py` scores each call against `judge/rubric.yaml` (6 criteria, 1–5) with justifications.
- **Summary Tables**: `compare.py` aggregates `results/summary.csv` (variant, sample size, hard-fail %, violations, promise %, judge mean, p50/p95) plus `summary.md`.
- **Latency & Turn-Taking Analysis**: `measure_latency_and_pareto.py` produces `latency_breakdown.md`, `latency_pareto.json`, and `pareto_turn_taking.md` (silence-hangover tradeoff; 350 ms is the evaluated optimum).
- **Human Validation**: `labeling/template.csv` feeds the UI Labeling screen; `labeling/agreement.py` measures judge-vs-human agreement.

---

## 2. Directory Layout & Architecture

```
eval/agent/
├── run_suite.py              # Batch simulation runner (--variant, --n, --persona)
├── simulator.py              # Persona-driven turn loop against the agent
├── compare.py                # Aggregates runs into results/summary.csv + summary.md
├── measure_latency_and_pareto.py  # Latency breakdown + hangover Pareto analysis
├── noise.py                  # Channel/noise conditions for robustness runs
├── checks/
│   └── hard_fail.py          # Compliance violation detectors (attempted + final)
├── judge/
│   ├── judge.py              # LLM-as-judge scorer
│   └── rubric.yaml           # 6-criterion scoring rubric
├── personas/
│   └── *.yaml                # 10 caller personas (profile + hidden situation + script)
├── labeling/
│   ├── template.csv          # Human-label task list (consumed by the UI)
│   ├── label_cli.py          # Terminal labeling helper
│   └── agreement.py          # Judge-vs-human agreement metrics
└── results/
    ├── summary.csv           # Per-variant aggregates (quoted fields with 95% CIs)
    ├── summary.md            # Human-readable summary
    ├── runs_<variant>.json   # Per-call records (source of truth for the UI)
    ├── latency_pareto.json   # Hangover vs interruption tradeoff data
    ├── latency_breakdown.md  # Stage-by-stage p50/p90/p95
    └── pareto_turn_taking.md # Pareto table with the 350 ms recommendation
```

Every number the Results viewer shows parses straight from these files —
`summary.csv` columns map 1:1 (quoted CI cells included); final-violation
totals aggregate per-run `hard_fail.num_final` records. Nothing is derived
in the browser.

---

## 3. How It Connects to Other Components

```
  [ Agent Service ]            [ Voicebench UI ]
  services/agent/app  ──sim──► │ /results (summary tables, Pareto)
  (graph/baseline/   ──audit─► │ /calls/:id (turn timelines, guard diffs)
   generalized)      ──labels► │ /label (blind rubric ratings → template.csv)
```

- The gateway data API reads `results/`, `personas/`, and `labeling/` directly — the UI never embeds eval numbers.
- Live call audit logs (`services/agent/audit_logs/`) share the same JSONL schema, so real calls inspect exactly like simulated ones.

---

## 4. Usage Commands

```bash
# 1. Agent unit, compliance, and red-team tests
pytest services/agent/tests/

# 2. Execute a simulation batch (5 calls per persona × 10 personas = 50 per variant)
python -m eval.agent.run_suite --variant v2_graph --n 5

# 3. Aggregate comparative metrics
python -m eval.agent.compare

# 4. Latency breakdown + Pareto analysis
python -m eval.agent.measure_latency_and_pareto

# 5. Cryptographically verify an audit trail
python -m app.verify_audit --log-file audit.jsonl
```
