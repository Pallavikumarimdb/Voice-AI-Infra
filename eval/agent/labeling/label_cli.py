#!/usr/bin/env python3
"""
Human Transcripts Labeling CLI Tool.
For use by the project owner to label transcripts against rubric criteria.
Usage:
  python -m eval.agent.labeling.label_cli --csv eval/agent/labeling/human_labels.csv
"""

import os
import sys
import csv
import argparse

CRITERIA = [
    ("human_listening_score", "傾聴と受け止め (1-5)"),
    ("human_pacing_score", "威圧感のないペース・丁寧な口調 (1-5)"),
    ("human_recovery_score", "雑談・脱線からの復帰 (1-5)"),
    ("human_negotiation_score", "承認条件内の現実的な提案 (1-5)"),
    ("human_confirmation_score", "復唱による明確な確認 (1-5)"),
    ("human_escalation_score", "適切な出口処理・エスカレーション (1-5)"),
]

def main():
    parser = argparse.ArgumentParser(description="Transcript Human Labeling Tool")
    parser.add_argument("--csv", default="eval/agent/labeling/human_labels.csv", help="Target labels CSV")
    parser.add_argument("--template", default="eval/agent/labeling/template.csv", help="Input template CSV")
    args = parser.parse_args()

    input_file = args.csv if os.path.exists(args.csv) else args.template
    with open(input_file, "r", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))

    print(f"Loaded {len(reader)} transcripts to label. Press Ctrl+C anytime to save and exit.\n")
    updated_rows = []

    try:
        for idx, row in enumerate(reader, start=1):
            t_id = row.get("transcript_id")
            p_id = row.get("persona_id")
            print(f"[{idx}/{len(reader)}] Transcript: {t_id} (Persona: {p_id})")

            # Check if already labeled
            if row.get("human_outcome_pass_fail"):
                print(f"  Already labeled as: {row.get('human_outcome_pass_fail')} (mean: {row.get('human_listening_score')}). Skipping.")
                updated_rows.append(row)
                continue

            for field, label_desc in CRITERIA:
                val = input(f"  {label_desc}: ").strip()
                row[field] = val or "4"

            outcome = input("  Overall outcome (PASS / FAIL): ").strip().upper() or "PASS"
            row["human_outcome_pass_fail"] = outcome

            notes = input("  Notes (optional): ").strip()
            row["notes"] = notes
            print("  --> Recorded.\n")
            updated_rows.append(row)

    except KeyboardInterrupt:
        print("\nSession interrupted. Saving progress...")

    with open(args.csv, "w", encoding="utf-8", newline="") as f:
        fieldnames = list(reader[0].keys())
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated_rows)

    print(f"Successfully saved {len(updated_rows)} records to {args.csv}.")

if __name__ == "__main__":
    main()
