/**
 * Simple linear interpolation resampler for browser environments where
 * AudioContext cannot be natively forced to 16000Hz.
 */
export function resample(input: Float32Array, inSampleRate: number, outSampleRate: number): Float32Array {
  if (inSampleRate === outSampleRate) return input;
  const ratio = inSampleRate / outSampleRate;
  const outLength = Math.round(input.length / ratio);
  const result = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const origPos = i * ratio;
    const index = Math.floor(origPos);
    const fraction = origPos - index;

    if (index + 1 < input.length) {
      result[i] = input[index] * (1 - fraction) + input[index + 1] * fraction;
    } else {
      result[i] = input[index] || 0;
    }
  }

  return result;
}
