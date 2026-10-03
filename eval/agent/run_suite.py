#!/usr/bin/env python3
"""
Evaluation Suite Runner for Japanese Debt Collections Voice Agent.
Runs N simulated calls per persona per variant, executes hard-fail checks and LLM judge,
and outputs structured results.
Usage:
  python -m eval.agent.run_suite --variant v2_graph --n 10
  python -m eval.agent.run_suite --variant v1_baseline --n 10
"""

import os
import sys
import json
import argparse
import time
from typing import Dict, Any, List

# Ensure repo root and agent are on path
repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from eval.agent.simulator import ConversationSimulator
from eval.agent.checks.hard_fail import hard_fail_evaluator
from eval.agent.judge.judge import call_judge
from services.agent.app.llm import global_tracker

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
ALL_PERSONAS = [
    "cooperative",
    "hostile",
    "evasive",
    "hardship",
    "already_paid",
    "third_party",
    "stop_contact",
    "off_script",
    "interrupting",
    "fails_verification"
]

def run_suite():
    parser = argparse.ArgumentParser(description="Collections Voice Agent Evaluation Suite")
    parser.add_argument("--variant", choices=["v1_baseline", "v2_graph", "v2_graph_no_slow_path", "v1_no_guard"], default="v2_graph")
    parser.add_argument("--n", type=int, default=5, help="Number of simulation runs per persona")
    parser.add_argument("--personas", nargs="+", default=ALL_PERSONAS, help="Personas to include")
    parser.add_argument("--noise", action="store_true", help="Apply ASR noise to debtor speech")
    parser.add_argument("--max-calls", type=int, default=1000, help="Max LLM calls budget")
    parser.add_argument("--max-usd", type=float, default=5.0, help="Max LLM USD budget")
    args = parser.parse_args()

    os.makedirs(RESULTS_DIR, exist_ok=True)
    global_tracker.max_calls = args.max_calls
    global_tracker.max_usd = args.max_usd

    simulator = ConversationSimulator()

    print(f"============================================================")
    print(f"Running Eval Suite for Variant: '{args.variant}'")
    print(f"Personas: {len(args.personas)} | Runs per persona: {args.n} | Total calls: {len(args.personas) * args.n}")
    print(f"ASR Noise: {args.noise} | Max Budget: ${args.max_usd:.2f} USD")
    print(f"============================================================\n")

    runs_data = []
    total_calls = 0
    passed_hard_fail_calls = 0
    attempted_violations_count = 0
    final_violations_count = 0
    ptp_secured_count = 0
    judge_mean_scores = []
    all_latencies = []

    for p_id in args.personas:
        print(f"--> Evaluating Persona: [{p_id}]")
        for seed_idx in range(args.n):
            seed = 1000 + seed_idx
            # 1. Run simulation
            sim_out = simulator.run_simulation(
                variant=args.variant,
                persona_id=p_id,
                seed=seed,
                apply_asr_noise=args.noise
            )

            # 2. Run deterministic hard-fail checks
            hf_res = hard_fail_evaluator.evaluate(
                transcript=sim_out["transcript"],
                audit_log=sim_out["audit_log"],
                crm_record=sim_out["crm_record"]
            )

            # 3. Run LLM judge
            judge_res = call_judge.judge_call(
                transcript=sim_out["transcript"],
                persona_name=p_id,
                expected_outcomes=sim_out["persona"].get("expected_good_outcomes", []),
                final_state=sim_out["final_state"]
            )

            total_calls += 1
            if hf_res["passed"]:
                passed_hard_fail_calls += 1
            attempted_violations_count += hf_res["num_attempted"]
            final_violations_count += hf_res["num_final"]

            has_ptp = bool(sim_out["final_state"].get("promise_to_pay"))
            if has_ptp:
                ptp_secured_count += 1

            judge_mean_scores.append(judge_res.get("mean_score", 4.0))
            all_latencies.extend(sim_out.get("turn_latencies", []))

            run_entry = {
                "session_id": sim_out["session_id"],
                "variant": args.variant,
                "persona_id": p_id,
                "seed": seed,
                "hard_fail": hf_res,
                "judge": judge_res,
                "promise_to_pay": has_ptp,
                "total_turns": sim_out["total_turns"],
                "latencies_ms": sim_out.get("turn_latencies", [])
            }
            runs_data.append(run_entry)

    # Calculate statistics
    hard_fail_rate_final = (1.0 - (passed_hard_fail_calls / total_calls)) if total_calls else 0.0
    ptp_rate = (ptp_secured_count / total_calls) if total_calls else 0.0
    avg_judge_score = (sum(judge_mean_scores) / len(judge_mean_scores)) if judge_mean_scores else 0.0

    all_latencies.sort()
    p50_lat = all_latencies[len(all_latencies) // 2] if all_latencies else 0.0
    p95_idx = int(len(all_latencies) * 0.95)
    p95_lat = all_latencies[p95_idx] if all_latencies else 0.0

    summary = {
        "variant": args.variant,
        "total_calls": total_calls,
        "hard_fail_passed_calls": passed_hard_fail_calls,
        "hard_fail_rate_final": round(hard_fail_rate_final * 100, 2),
        "total_attempted_violations": attempted_violations_count,
        "total_final_violations": final_violations_count,
        "promise_to_pay_rate": round(ptp_rate * 100, 2),
        "average_judge_score": round(avg_judge_score, 2),
        "latency_p50_ms": round(p50_lat, 2),
        "latency_p95_ms": round(p95_lat, 2),
        "estimated_cost_usd": round(global_tracker.estimated_cost_usd, 4),
        "total_llm_calls": global_tracker.total_calls
    }

    # Save runs
    out_file = os.path.join(RESULTS_DIR, f"runs_{args.variant}.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "runs": runs_data}, f, ensure_ascii=False, indent=2)

    print(f"\n============================================================")
    print(f"Results Summary for '{args.variant}':")
    print(f"  Total Calls:          {summary['total_calls']}")
    print(f"  Hard-Fail Rate:       {summary['hard_fail_rate_final']}% ({summary['total_final_violations']} final violations)")
    print(f"  Attempted Violations: {summary['total_attempted_violations']} (stopped by guard)")
    print(f"  Promise-to-Pay Rate:  {summary['promise_to_pay_rate']}%")
    print(f"  Average Judge Score:  {summary['average_judge_score']} / 5.0")
    print(f"  Turn Latency p50/p95: {summary['latency_p50_ms']} ms / {summary['latency_p95_ms']} ms")
    print(f"  Saved raw details to: {out_file}")
    print(f"============================================================\n")

    return summary

if __name__ == "__main__":
    run_suite()
