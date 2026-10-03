#!/usr/bin/env python3
"""
Audio Replay and Latency Measurement Tool.
Streams 16kHz mono PCM audio into the Gateway at real-time speed over WebSockets,
listens for STT partials/finals, agent responses, and audio chunks, and logs exact per-stage timestamps.
Usage:
  python tools/replay.py --audio eval/datasets/sample_ja_16k.wav --mode agent
"""

import os
import sys
import time
import struct
import json
import asyncio
import argparse
from typing import Optional
import soundfile as sf
import numpy as np

try:
    import websockets
except ImportError:
    websockets = None

async def replay_audio(
    gateway_url: str,
    audio_path: str,
    mode: str = "agent",
    chunk_ms: int = 50,
    simulate_barge_in_at_ms: Optional[int] = None
):
    if websockets is None:
        raise RuntimeError("websockets package required for replay tool")

    data, sr = sf.read(audio_path)
    if sr != 16000:
        raise ValueError(f"Audio must be 16kHz, found {sr}")
    if data.ndim > 1:
        data = data.mean(axis=1)

    # Convert to int16 PCM
    pcm_int16 = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16)
    samples_per_chunk = int(16000 * (chunk_ms / 1000.0))

    print(f"Connecting to Gateway at {gateway_url} (mode: {mode})...")
    async with websockets.connect(gateway_url) as ws:
        # 1. Send start control message
        start_msg = {
            "type": "start",
            "mode": mode,
            "srcLang": "ja",
            "tgtLang": "ja",
            "sampleRate": 16000
        }
        await ws.send(json.dumps(start_msg))

        resp = await ws.recv()
        print(f"[Gateway Started]: {resp}")

        stage_timestamps = []
        t_call_start = time.time() * 1000

        # Background listener for gateway messages
        async def listen_loop():
            try:
                while True:
                    msg_text = await ws.recv()
                    t_now = time.time() * 1000
                    try:
                        msg = json.loads(msg_text)
                        msg_type = msg.get("type")
                        t_capture = msg.get("tCapture", t_call_start)

                        event = {
                            "type": msg_type,
                            "uttId": msg.get("uttId"),
                            "text": msg.get("text") or msg.get("translation"),
                            "tReceived": round(t_now, 2),
                            "latencyFromCaptureMs": round(t_now - t_capture, 2) if t_capture else None
                        }
                        stage_timestamps.append(event)
                        print(f"  [<-- Gateway Event]: type={msg_type} (latency: {event['latencyFromCaptureMs']}ms)")

                        if msg_type in ["agent_speech_end", "stopped"]:
                            pass
                    except Exception:
                        pass
            except Exception:
                pass

        listen_task = asyncio.create_task(listen_loop())

        # 2. Stream audio chunks in real-time
        seq = 0
        total_samples = len(pcm_int16)
        print(f"Streaming {total_samples} samples ({total_samples/16000:.2f}s) in {chunk_ms}ms chunks...")

        for idx in range(0, total_samples, samples_per_chunk):
            chunk = pcm_int16[idx:idx + samples_per_chunk]
            t_capture = time.time() * 1000
            seq += 1

            # Offset 0: 0x01, Offset 1..4: uint32LE seq, Offset 5..12: float64LE t_capture, Offset 13..: int16LE[]
            header = struct.pack("<BId", 0x01, seq, t_capture)
            frame = header + chunk.tobytes()

            await ws.send(frame)
            await asyncio.sleep(chunk_ms / 1000.0)

        print("Audio streaming complete. Waiting for agent processing...")
        await asyncio.sleep(3.0)

        # 3. Stop session
        await ws.send(json.dumps({"type": "stop"}))
        await asyncio.sleep(0.5)
        listen_task.cancel()

        print("\n=== Replay Stage Latency Summary ===")
        for ev in stage_timestamps:
            print(f"  Stage: {ev['type']:20s} | Latency from capture: {ev['latencyFromCaptureMs']} ms | Text: {ev.get('text')}")

        return stage_timestamps

def main():
    parser = argparse.ArgumentParser(description="Voice Gateway Audio Replay Tool")
    parser.add_argument("--audio", default="eval/datasets/sample_ja_16k.wav", help="Path to 16kHz WAV file")
    parser.add_argument("--gateway", default="ws://localhost:8443/session", help="Gateway WebSocket URL")
    parser.add_argument("--mode", default="agent", choices=["agent", "translate"], help="Gateway session mode")
    parser.add_argument("--chunk-ms", type=int, default=50, help="Audio frame duration in ms")
    args = parser.parse_args()

    asyncio.run(replay_audio(
        gateway_url=args.gateway,
        audio_path=args.audio,
        mode=args.mode,
        chunk_ms=args.chunk_ms
    ))

if __name__ == "__main__":
    main()
