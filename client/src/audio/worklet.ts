/**
 * AudioWorkletProcessor running on the audio thread.
 * Pre-allocates buffers to eliminate runtime GC pauses.
 */

export const WORKLET_CODE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 512; // ~32ms at 16kHz
    this.pcm16Buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    const len = channelData.length;

    for (let i = 0; i < len; i++) {
      // Float32 to Int16 conversion with clipping
      let s = Math.max(-1, Math.min(1, channelData[i]));
      this.pcm16Buffer[this.bufferIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

      if (this.bufferIndex >= this.bufferSize) {
        // Send a copy via transferable buffer to main thread
        const out = new Int16Array(this.pcm16Buffer);
        this.port.postMessage({
          pcm16: out.buffer,
          tCapture: Date.now()
        }, [out.buffer]);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
`;
