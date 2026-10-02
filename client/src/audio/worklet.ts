/**
 * AudioWorkletProcessor running on the audio thread.
 * Pre-allocates buffers to eliminate runtime GC pauses.
 */

export const WORKLET_CODE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.sourceSampleRate = sampleRate; // Global sampleRate in AudioWorkletGlobalScope (e.g. 48000, 44100, 16000)
    this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;
    this.resampleIndex = 0;
    this.bufferSize = 512; // 32ms at 16kHz
    this.pcm16Buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    const len = channelData.length;
    if (len === 0) return true;

    // Direct 16kHz pass-through if native sample rate matches
    if (Math.abs(this.sourceSampleRate - this.targetSampleRate) < 1) {
      for (let i = 0; i < len; i++) {
        let s = Math.max(-1, Math.min(1, channelData[i]));
        this.pcm16Buffer[this.bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

        if (this.bufferIndex >= this.bufferSize) {
          const out = new Int16Array(this.pcm16Buffer);
          this.port.postMessage({
            pcm16: out.buffer,
            tCapture: Date.now()
          }, [out.buffer]);
          this.bufferIndex = 0;
        }
      }
    } else {
      // Linear interpolation resampling to exact 16,000 Hz
      while (this.resampleIndex < len) {
        const idx = Math.floor(this.resampleIndex);
        const nextIdx = Math.min(idx + 1, len - 1);
        const frac = this.resampleIndex - idx;
        const s = channelData[idx] * (1 - frac) + channelData[nextIdx] * frac;
        const clamped = Math.max(-1, Math.min(1, s));

        this.pcm16Buffer[this.bufferIndex++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;

        if (this.bufferIndex >= this.bufferSize) {
          const out = new Int16Array(this.pcm16Buffer);
          this.port.postMessage({
            pcm16: out.buffer,
            tCapture: Date.now()
          }, [out.buffer]);
          this.bufferIndex = 0;
        }

        this.resampleIndex += this.resampleRatio;
      }
      this.resampleIndex -= len;
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
`;
