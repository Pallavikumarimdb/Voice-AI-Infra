import { metrics } from '../metrics';

export interface SynthesizeOptions {
  voice?: string;
  sampleRate?: number;
  abortSignal?: AbortSignal;
}

export class TTSClient {
  private serviceUrl: string;

  constructor(serviceUrl: string = process.env.TTS_SERVICE_URL || 'http://localhost:8004/synthesize') {
    this.serviceUrl = serviceUrl;
  }

  async streamSynthesize(
    text: string,
    onChunk: (seq: number, chunk: Buffer) => void,
    options: SynthesizeOptions = {}
  ): Promise<{ ttftMs: number; totalBytes: number }> {
    const tStart = Date.now();
    let ttftMs = 0;
    let totalBytes = 0;
    let seq = 0;

    const response = await fetch(this.serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: options.voice || 'ja-JP-NanamiNeural',
        sample_rate: options.sampleRate || 16000
      }),
      signal: options.abortSignal
    });

    if (!response.ok || !response.body) {
      throw new Error(`TTS synthesis request failed: ${response.status}`);
    }

    // Read web stream
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        if (ttftMs === 0) {
          ttftMs = Date.now() - tStart;
        }
        totalBytes += value.length;
        seq += 1;
        const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        onChunk(seq, buf);
      }
    }

    return { ttftMs, totalBytes };
  }
}
