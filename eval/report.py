#!/usr/bin/env python3
"""
Streaming Voice Translation Pipeline - Pareto Report Generator
Renders latency vs flicker / CER trade-offs from runner results CSV.
CLI: python report.py --input results/streaming_ablation.csv --output results/pareto_chart.png
"""

import os
import argparse

try:
    import pandas as pd
    import matplotlib.pyplot as plt
except ImportError:
    pd = None
    plt = None

def generate_report(csv_path: str, output_image: str):
    if not os.path.exists(csv_path):
        print(f"[Report] CSV file {csv_path} not found.")
        return

    df = pd.read_csv(csv_path)

    # Group by chunk_ms and agreement_n
    agg = df.groupby(["chunk_ms", "agreement_n", "model"])[
        ["streaming.finalize_ms", "streaming.flicker_rate", "asr.cer"]
    ].mean().reset_index()

    fig, ax = plt.subplots(figsize=(10, 6))

    scatter = ax.scatter(
        agg["streaming.finalize_ms"],
        agg["streaming.flicker_rate"],
        c=agg["chunk_ms"],
        s=agg["agreement_n"] * 100,
        alpha=0.8,
        cmap="viridis"
    )

    cbar = plt.colorbar(scatter)
    cbar.set_label("Chunk Duration (ms)")

    for _, row in agg.iterrows():
        label = f"N={int(row['agreement_n'])},{row['model']}"
        ax.annotate(
            label,
            (row["streaming.finalize_ms"], row["streaming.flicker_rate"]),
            textcoords="offset points",
            xytext=(0, 8),
            ha='center',
            fontsize=8
        )

    ax.set_title("Streaming Latency vs Flicker Rate Pareto Frontier")
    ax.set_xlabel("Finalize Latency (ms) [lower is faster]")
    ax.set_ylabel("Flicker Rate (reversals/char) [lower is more stable]")
    ax.grid(True, linestyle="--", alpha=0.5)

    os.makedirs(os.path.dirname(output_image), exist_ok=True)
    plt.savefig(output_image, dpi=200, bbox_inches="tight")
    print(f"[Report] Chart saved successfully to {output_image}")

def main():
    parser = argparse.ArgumentParser(description="Generate Eval Pareto Report")
    parser.add_argument("--input", type=str, default="results/streaming_ablation.csv")
    parser.add_argument("--output", type=str, default="results/pareto_chart.png")
    args = parser.parse_args()

    generate_report(args.input, args.output)

if __name__ == "__main__":
    main()
