/** Browser audio helpers: PCM16 framing for the Live API. */
export function int16ToBase64(samples: Int16Array) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function floatToInt16(input: Float32Array) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) { const v = Math.max(-1, Math.min(1, input[i])); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  return out;
}
/** "pcm_16000" -> 16000. Non-PCM formats return null. */
export function pcmRate(format: unknown) { const match = String(format || '').match(/^pcm_(\d+)$/); return match ? Number(match[1]) : null; }

/** Captures a microphone as 16 kHz PCM16 chunks (the operator's fallback caller channel). */
export async function captureMicrophone(onChunk: (base64: string, rate: number) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const context = new AudioContext({ sampleRate: 16000 });
  const source = context.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally available and fine at 16 kHz mono.
  const processor = context.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = event => onChunk(int16ToBase64(floatToInt16(event.inputBuffer.getChannelData(0))), context.sampleRate);
  source.connect(processor); processor.connect(context.destination);
  return () => { processor.disconnect(); source.disconnect(); stream.getTracks().forEach(t => t.stop()); void context.close(); };
}
