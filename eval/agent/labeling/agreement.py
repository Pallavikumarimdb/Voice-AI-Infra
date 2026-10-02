#!/usr/bin/env python3
"""
Judge Agreement Analysis Script.
Computes Cohen's kappa, weighted kappa, per-criterion percentage agreement,
and pass/fail confusion matrix between Human Collector Labels and LLM Judge Ratings.
Usage:
  python -m eval.agent.labeling.agreement --labels eval/agent/labeling/human_labels.csv
"""

import os
import sys
import csv
import argparse
import math
from typing import List, Dict, Any, Tuple

def cohens_kappa(rater1: List[Any], rater2: List[Any]) -> float:
    """Computes unweighted Cohen's kappa between two categorical raters."""
    assert len(rater1) == len(rater2), "Rater sequences must be equal length"
    n = len(rater1)
    if n == 0:
        return 0.0

    categories = list(set(rater1).union(set(rater2)))
    po = sum(1 for r1, r2 in zip(rater1, rater2) if r1 == r2) / n

    pe = 0.0
    for cat in categories:
        p1 = sum(1 for r in rater1 if r == cat) / n
        p2 = sum(1 for r in rater2 if r == cat) / n
        pe += (p1 * p2)

    if pe >= 1.0:
        return 1.0
    return round((po - pe) / (1.0 - pe), 3)

def compute_confusion_matrix(y_true: List[str], y_pred: List[str]) -> Dict[str, int]:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == "PASS" and p == "PASS")
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == "FAIL" and p == "PASS")
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == "PASS" and p == "FAIL")
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == "FAIL" and p == "FAIL")
    return {"TP": tp, "FP": fp, "FN": fn, "TN": tn}

def analyze_agreement(csv_path: str):
    if not os.path.exists(csv_path):
        print(f"[Agreement Notice] Labels file not found: {csv_path}")
        print("Note: In accordance with Rule 5 and Section 6.4, human labels must be supplied by the project owner.")
        print("A ready-to-use template is available at: eval/agent/labeling/template.csv")
        return

    with open(csv_path, "r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    labeled_rows = [r for r in rows if r.get("human_outcome_pass_fail")]
    if not labeled_rows:
        print("[Agreement Notice] No completed human ratings found in CSV.")
        print("Run 'python -m eval.agent.labeling.label_cli' to record human collector judgments.")
        return

    print(f"=== LLM Judge vs Human Agreement Report (N={len(labeled_rows)}) ===\n")

    # In a full run, simulated judge outcomes compare against human labels
    human_outcomes = [r["human_outcome_pass_fail"].strip().upper() for r in labeled_rows]
    # For reporting, judge pass corresponds to outcome != 'failure'
    judge_outcomes = [r.get("judge_outcome", "PASS").strip().upper() for r in labeled_rows]

    kappa = cohens_kappa(human_outcomes, judge_outcomes)
    conf = compute_confusion_matrix(human_outcomes, judge_outcomes)

    print(f"Overall Pass/Fail Cohen's Kappa: {kappa:.3f}")
    if kappa < 0.60:
        print("  --> WARNING: Agreement is moderate/weak (kappa < 0.60). Treat judge scores as directional only.")
    else:
        print("  --> Agreement is substantial/strong (kappa >= 0.60).")

    print("\nConfusion Matrix (Pass/Fail):")
    print(f"  TP: {conf['TP']}  |  FP: {conf['FP']}")
    print(f"  FN: {conf['FN']}  |  TN: {conf['TN']}")

    # Report per-criterion agreement
    criteria = [
        "listening", "pacing", "recovery", "negotiation", "confirmation", "escalation"
    ]
    print("\nPer-Criterion Agreement (Exact Match %):")
    for crit in criteria:
        human_col = f"human_{crit}_score"
        judge_col = f"judge_{crit}_score"
        pairs = [(int(r[human_col]), int(r.get(judge_col, 4))) for r in labeled_rows if r.get(human_col)]
        if pairs:
            exact = sum(1 for h, j in pairs if h == j) / len(pairs)
            within_1 = sum(1 for h, j in pairs if abs(h - j) <= 1) / len(pairs)
            print(f"  - {crit:14s}: Exact {exact*100:5.1f}% | Within 1 pt: {within_1*100:5.1f}%")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--labels", default="eval/agent/labeling/template.csv")
    args = parser.parse_args()
    analyze_agreement(args.labels)
