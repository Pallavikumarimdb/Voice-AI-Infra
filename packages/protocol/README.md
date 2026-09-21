# Shared Protocol Package (`@voice/protocol`)

The `@voice/protocol` package defines the single source of truth for all binary framing specifications, JSON message types, and shared data contracts across the entire Voice AI infrastructure.

---

## 1. What This Package Does

- **Binary Wire Specification**: Defines byte offsets and data types for low-latency, uncompressed 16kHz mono audio streaming between the client and gateway.
- **Message Contracts**: Provides TypeScript types for every control signal, streaming partial, committed final transcript, translation payload, and telemetry event.
- **Zero-Allocation Binary Packers**: Implements `packAudioFrame` and `unpackAudioFrame` using JavaScript `DataView` and `TypedArray` buffers for high-throughput packet serialization.

---

## 2. Binary Audio Frame Layout

Audio frames are transmitted as raw binary ArrayBuffers over WebSocket rather than JSON base64 or Opus-encoded blobs to minimize CPU encoding overhead and latency:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|    msgType    |               seq (uint32LE)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       ...     |               tCapture (float64LE)            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|       ...                                                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|    pcm (int16LE sample 0)     |    pcm (int16LE sample 1)     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                              ...                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

| Byte Offset | Type | Field Name | Description |
| :--- | :--- | :--- | :--- |
| `0` | `uint8` | `msgType` | Message discriminator (`0x01` = PCM audio frame) |
| `1..4` | `uint32LE` | `seq` | Monotonically increasing frame sequence number |
| `5..12` | `float64LE` | `tCapture` | Millisecond client epoch timestamp (`Date.now()`) for latency tracking |
| `13..N` | `int16LE[]` | `pcm` | 16kHz, 16-bit mono signed PCM samples (typically 512 samples = ~32ms) |

---

## 3. JSON Control & Data Contracts

### 3.1 Control Signals
- **`StartControlMessage` (`client -> gateway`)**:
  ```typescript
  { type: "start", srcLang: "ja", tgtLang: "en", sampleRate: 16000 }
  ```
- **`StopControlMessage` (`client -> gateway`)**:
  ```typescript
  { type: "stop" }
  ```

### 3.2 Streaming Telemetry & Transcripts
- **`PartialMessage` (`gateway -> client`)**:
  Represents in-progress, speculative transcription. `stableChars` indicates how many characters have been locked by the LocalAgreement stabilizer.
  ```typescript
  {
    type: "partial",
    uttId: 7,
    seq: 31,
    text: "すみません、駅は",
    stableChars: 6,
    tCapture: 1700000000120,
    tEmit: 1700000000450
  }
  ```
- **`FinalMessage` (`gateway -> client`)**:
  Emitted when speech activity ends or a segment cut occurs. Includes word-level timestamps.
  ```typescript
  {
    type: "final",
    uttId: 7,
    text: "すみません、駅はどこですか",
    words: [{ text: "すみません", start: 0.0, end: 0.62 }, ...],
    tCapture: 1700000000120,
    tFinal: 1700000000850
  }
  ```
- **`TranslatedMessage` (`gateway -> client`)**:
  Emitted when the MT service finishes translating a finalized utterance.
  ```typescript
  {
    type: "translated",
    uttId: 7,
    translation: "Excuse me, where is the station?",
    ttftMs: 84.2,
    decodeMs: 195.4,
    tTranslated: 1700000001150
  }
  ```
- **`HUDMessage` (`gateway -> client`)**:
  Emitted every 1000ms to drive the frontend real-time latency HUD.
  ```typescript
  {
    type: "hud",
    queueDepth: 1024,   // Gateway downstream buffer in bytes
    gpuUtil: 68,         // GPU utilization percentage
    rtf: 0.32            // Real-Time Factor (< 1.0 is real-time)
  }
  ```

---

## 4. How It Connects to Other Components

```
                   ┌───────────────────────┐
                   │   @voice/protocol     │
                   │ (Contract Definition) │
                   └──────────┬────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌───────────────┐               ┌───────────────┐
      │    client     │               │    gateway    │
      │ (Web Browser) │               │ (Node.js/TS)  │
      └───────┬───────┘               └───────┬───────┘
              │                               │
              │  Packs binary audio via       │  Unpacks frame & validates
              │  packAudioFrame()             │  seq / tCapture / msgType
              └───────────────────────────────┘
```

1. **Client**: Imports `packAudioFrame` in `SessionManager.ts` to construct binary packets on the audio capture thread. Imports `GatewayMessage` to type incoming server events.
2. **Gateway**: Imports `Utterance`, `WordTs`, and message interfaces in `Session.ts` and `server.ts` to parse frames, maintain session state, and dispatch formatted JSON to clients.
3. **STT Service (Python)**: The Python STT service adheres to the exact same byte layout using `struct.unpack_from("<BId", raw_bytes, 0)`.
