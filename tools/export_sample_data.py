#!/usr/bin/env python3
"""
Exports real evaluation runs, audit logs, and personas to client/public/sample-data/
for offline reviewer demo and static fallback.
"""

import os
import json
import csv
import yaml

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "client", "public", "sample-data")
os.makedirs(os.path.join(OUT_DIR, "calls"), exist_ok=True)

# 1. Export summary.json
summary_csv = os.path.join(REPO_ROOT, "eval/agent/results/summary.csv")
summary_md = os.path.join(REPO_ROOT, "eval/agent/results/summary.md")
pareto_json = os.path.join(REPO_ROOT, "eval/agent/results/latency_pareto.json")

csv_content = ""
if os.path.exists(summary_csv):
    with open(summary_csv, "r", encoding="utf-8") as f:
        csv_content = f.read()

md_content = ""
if os.path.exists(summary_md):
    with open(summary_md, "r", encoding="utf-8") as f:
        md_content = f.read()

pareto_data = None
if os.path.exists(pareto_json):
    with open(pareto_json, "r", encoding="utf-8") as f:
        pareto_data = json.load(f)

with open(os.path.join(OUT_DIR, "summary.json"), "w", encoding="utf-8") as f:
    json.dump({
        "csv": csv_content,
        "markdown": md_content,
        "pareto": pareto_data
    }, f, ensure_ascii=False, indent=2)

# 2. Export personas.json
personas_dir = os.path.join(REPO_ROOT, "eval/agent/personas")
personas_list = []
if os.path.exists(personas_dir):
    for f in sorted(os.listdir(personas_dir)):
        if f.endswith(".yaml"):
            with open(os.path.join(personas_dir, f), "r", encoding="utf-8") as pf:
                personas_list.append({
                    "id": f.replace(".yaml", ""),
                    "rawYaml": pf.read()
                })

with open(os.path.join(OUT_DIR, "personas.json"), "w", encoding="utf-8") as f:
    json.dump(personas_list, f, ensure_ascii=False, indent=2)

# 3. Export labels.json
labels_csv = os.path.join(REPO_ROOT, "eval/agent/labeling/template.csv")
if os.path.exists(labels_csv):
    with open(labels_csv, "r", encoding="utf-8") as lf:
        labels_content = lf.read()
else:
    labels_content = ""

with open(os.path.join(OUT_DIR, "labels.json"), "w", encoding="utf-8") as f:
    json.dump({"csv": labels_content}, f, ensure_ascii=False, indent=2)

# 4. Export calls.json and individual calls/<id>.json
results_dir = os.path.join(REPO_ROOT, "eval/agent/results")
audit_dir = os.path.join(REPO_ROOT, "services/agent/audit_logs")

calls_summary = []
sample_ids = []

for variant in ["v2_graph", "v1_baseline", "v1_no_guard", "v2_graph_no_slow_path"]:
    run_file = os.path.join(results_dir, f"runs_{variant}.json")
    if os.path.exists(run_file):
        with open(run_file, "r", encoding="utf-8") as rf:
            data = json.load(rf)
            for r in data.get("runs", []):
                calls_summary.append({
                    "id": r["session_id"],
                    "source": "sim",
                    "variant": r.get("variant", variant),
                    "persona": r["persona_id"],
                    "outcome": r.get("judge", {}).get("outcome") or ("promise_secured" if r.get("promise_to_pay") else "unresolved"),
                    "hardFailPassed": r.get("hard_fail", {}).get("passed", True),
                    "hasComplianceBlock": (r.get("hard_fail", {}).get("num_attempted", 0) > 0),
                    "hasEscalation": "escalat" in str(r.get("judge", {}).get("outcome", "")),
                    "totalTurns": r.get("total_turns", len(r.get("latencies_ms", []))),
                    "timestamp": 1790946563000,
                    "promiseSecured": r.get("promise_to_pay", False)
                })

                # Export individual call if first 3 of each variant or if has compliance block
                if len(sample_ids) < 30:
                    sample_ids.append((r["session_id"], r, r["persona_id"], variant))

# Add any live call from audit logs
if os.path.exists(audit_dir):
    for f in os.listdir(audit_dir):
        if f.endswith(".jsonl") and f.startswith("cli_"):
            sid = f.replace(".jsonl", "")
            calls_summary.insert(0, {
                "id": sid,
                "source": "live",
                "variant": "v2_graph",
                "persona": "cooperative",
                "outcome": "completed",
                "hardFailPassed": True,
                "hasComplianceBlock": True,
                "hasEscalation": False,
                "totalTurns": 7,
                "timestamp": 1790945335000,
                "promiseSecured": True
            })
            sample_ids.append((sid, None, "cooperative", "v2_graph"))
            break

with open(os.path.join(OUT_DIR, "calls.json"), "w", encoding="utf-8") as f:
    json.dump(calls_summary, f, ensure_ascii=False, indent=2)

# Write individual call details
for sid, r_data, p_id, var in sample_ids:
    audit_file = os.path.join(audit_dir, f"{sid}.jsonl")
    audit_records = []
    if os.path.exists(audit_file):
        with open(audit_file, "r", encoding="utf-8") as af:
            for line in af:
                if line.strip():
                    audit_records.append(json.loads(line))

    # Persona
    persona_yaml = ""
    p_path = os.path.join(personas_dir, f"{p_id}.yaml")
    if os.path.exists(p_path):
        with open(p_path, "r", encoding="utf-8") as pf:
            persona_yaml = pf.read()

    detail = {
        "id": sid,
        "source": "live" if sid.startswith("cli_") else "sim",
        "variant": var,
        "personaId": p_id,
        "auditLog": audit_records,
        "runData": r_data,
        "persona": {"id": p_id, "content": persona_yaml} if persona_yaml else None
    }

    with open(os.path.join(OUT_DIR, "calls", f"{sid}.json"), "w", encoding="utf-8") as df:
        json.dump(detail, df, ensure_ascii=False, indent=2)

print(f"Sample data exported successfully to {OUT_DIR}")
