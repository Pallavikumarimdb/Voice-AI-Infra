# Evaluation Harness (`eval/`)

An offline, reproducible evaluation framework implementing **pure-function metric contracts**, automated ablation parameter sweeps, and Pareto frontier reporting for speech-to-text and machine translation.

---

## 1. What This Component Does

- **Pure-Function Metric Evaluation**: Evaluates pipeline logs without side effects, file mutations, or network calls.
- **Ablation Sweeps**: Runs combinatorial sweeps across chunk sizes (`250ms`, `500ms`, `1000ms`, `2000ms`), stabilizer agreement thresholds (`N=1, 2, 3`), and model sizes (`small`, `large-v3-turbo`).
- **Streaming Quality Metrics**: Measures **flicker rate** (character reversals / total length), **time-to-first-partial**, and **finalization latency**.
- **Accuracy Benchmarks**: Calculates **Character Error Rate (CER)** for Japanese and **Word Error Rate (WER)** for English, as well as **chrF** and **BLEU** for translation.
- **Pareto Chart Generation**: Plots latency vs stability trade-offs to determine optimal production configurations.

---

## 2. Directory Layout & Architecture

```
eval/
├── configs/
│   └── streaming_ablation.yaml   # Parameter sweep configuration
├── datasets/
│   └── covost2_ja_en_sample.jsonl# Evaluation dataset with references
├── metrics/
│   ├── asr.py                    # CER & WER calculation with text normalizers
│   ├── streaming.py              # Flicker rate, first partial, and finalize latency
│   ├── mt.py                     # chrF, BLEU, TTFT, and decode duration
│   ├── serving.py                # Throughput (tokens/sec) and serving latency
│   └── diar.py                   # Diarization Error Rate (DER)
├── runner.py                     # CLI parameter sweep runner
├── report.py                     # Pareto frontier chart generator
└── results/                      # Committed CSV and PNG benchmark artifacts
```

### 2.1 The Pure-Function Contract
Every metric function follows an identical, stateless contract:
```python
def compute(log: list[dict], reference: Any = None) -> dict[str, float]:
    ...
```
- No metric touches the filesystem, disk, or network.
- Input: Array of structured event dictionaries (identical to what the Gateway, STT, and MT services emit).
- Output: Dictionary of float metrics (e.g. `{"streaming.flicker_rate": 0.041, "asr.cer": 0.072}`).

### 2.2 Flicker Rate Metric Formula
Flicker measures how much text was retroactively erased/backtracked between consecutive partial hypotheses:
$$\text{Flicker Rate} = \frac{\sum \text{Erased Characters}}{\sum \text{Hypothesis Length}}$$
A high flicker rate forces the human eye to re-read sentences as they morph, causing cognitive strain.

---

## 3. How It Connects to Other Components

```
      [ Live Pipeline Services ]
      Gateway, STT, and MT Services
                   │
                   │ Emits structured JSONL logs:
                   │ {"sessionId":"s_1", "stage":"asr_partial", "tCapture":..., "text":"..."}
                   │ {"sessionId":"s_1", "stage":"asr_final", "tCapture":..., "text":"..."}
                   │ {"sessionId":"s_1", "stage":"mt_translated", "ttftMs":84, ...}
                   ▼
      ┌────────────────────────────────────────────────────────┐
      │                   EVAL HARNESS                         │
      │                                                        │
      │   1. Replays event logs or synthetic sweep runs        │
      │   2. Feeds events into pure-function metrics/          │
      │   3. Outputs results/streaming_ablation.csv            │
      │   4. report.py generates results/pareto_chart.png      │
      └────────────────────────────────────────────────────────┘
```

The eval harness can run:
1. **Offline on recorded JSONL logs**: Directly assessing real production sessions recorded during live calls.
2. **As an ablation sweep runner (`runner.py`)**: Testing simulated combinations of chunk sizes and agreement thresholds against test datasets before deploying models to production.

---

## 4. Usage Commands

```bash
# 1. Install evaluation dependencies
pip install -r requirements.txt

# 2. Run the ablation sweep
python runner.py --sweep configs/streaming_ablation.yaml

# 3. Generate the Pareto Frontier chart
python report.py --input results/streaming_ablation.csv --output results/pareto_chart.png
```
