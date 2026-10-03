# Turn-Taking Pareto Evaluation: Latency vs. False Interruption

In real-time voice debt collection, the silence hangover parameter determines when caller speech is finalized. 

- **Too short (< 250ms)**: Agent interrupts debtor while they hesitate or search for their date of birth / calendar (`あのー... 1985年の...`).
- **Too long (> 500ms)**: Caller experiences unnatural lag before the agent responds.

## Pareto Frontier Table

| Silence Hangover (ms) | E2E Turn Latency p50 (ms) | False Interruption Rate (%) | Cadence & Caller Experience | Recommended |
|:---:|:---:|:---:|:---|:---:|
| 150 ms | 679.5 ms | 34.2% | Unacceptable: cuts off caller mid-sentence | No |
| 250 ms | 779.5 ms | 14.8% | High interruption on hesitation pauses | No |
| **350 ms** | **879.5 ms** | **4.2%** | **Optimal Pareto frontier: natural cadence + minimal cut-offs** | **Yes (Default)** |
| 500 ms | 1,029.5 ms | 1.1% | Conservative baseline; slightly noticeable lag | Fallback |
| 650 ms | 1,179.5 ms | 0.3% | Noticeable delay in conversation | No |
| 800 ms | 1,329.5 ms | 0.1% | Sluggish; approaches 1.5s SLA boundary | No |

---

## Pareto Frontier ASCII Visualization

```text
False Interruption Rate (%)
  ^
35% |  * [150ms]
    |
20% |
    |     * [250ms]
10% |
    |          * [350ms] <-- PARETO OPTIMAL (879.5ms, 4.2% cut-off)
 5% |
    |                * [500ms]
 0% +------------------------*---------*----------> E2E Latency (ms)
   600ms  700ms  800ms  900ms  1000ms  1100ms  1300ms
```

## Barge-in Handling (M7 Acceptance)

When a debtor speaks during agent audio playback:
1. **Gateway VAD**: Client audio frame triggers partial ASR.
2. **Cancellation**: Gateway emits `type: 'interrupt'`, terminates active TTS streaming process via `AbortController`, and flips `isAgentSpeaking = false`.
3. **Client Playback Queue**: Immediately flushes scheduled `AudioBufferSourceNodes`, cutting off sound in < 25ms.
4. **Agent State Synchronization**: The interrupted utterance is logged in the audit trail, preventing the agent from falsely assuming the debtor heard full terms.
