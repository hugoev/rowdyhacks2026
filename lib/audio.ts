/** Browser audio for the teller: 16 kHz PCM16 mic in, 24 kHz PCM16 voice out. */
export function int16ToBase64(samples: Int16Array) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function base64ToInt16(base64: string) {
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.length >> 1);
}

// Runs on the audio thread: converts float frames to PCM16 in ~100 ms chunks.
const WORKLET = `
class Pcm16 extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Int16Array(1600); this.length = 0; }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const v = Math.max(-1, Math.min(1, input[i]));
      this.buffer[this.length++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.length === this.buffer.length) { this.port.postMessage(this.buffer.slice(0)); this.length = 0; }
    }
    return true;
  }
}
registerProcessor('pcm16', Pcm16);`;

export type Microphone = { stop: () => void; level: () => number };
/** Captures the mic as 16 kHz PCM16 chunks via an AudioWorklet. */
export async function startMicrophone(onChunk: (base64: string) => void): Promise<Microphone> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const context = new AudioContext({ sampleRate: 16000 });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'pcm16');
  const analyser = context.createAnalyser(); analyser.fftSize = 512;
  node.port.onmessage = event => onChunk(int16ToBase64(event.data as Int16Array));
  source.connect(node); source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  return {
    stop: () => { node.disconnect(); source.disconnect(); stream.getTracks().forEach(t => t.stop()); void context.close(); },
    level: () => rms(analyser, data),
  };
}

/** Gapless playback queue for the teller's voice, with instant stop for barge-in. */
export class VoicePlayer {
  private context: AudioContext;
  private gain: GainNode;
  private analyser: AnalyserNode;
  private data: Uint8Array<ArrayBuffer>;
  private playhead = 0;
  private sources = new Set<AudioBufferSourceNode>();
  constructor(private rate = 24000) {
    this.context = new AudioContext({ sampleRate: rate });
    this.gain = this.context.createGain(); this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 512;
    this.gain.connect(this.analyser); this.analyser.connect(this.context.destination);
    this.data = new Uint8Array(this.analyser.fftSize);
  }
  /** Must run inside a user gesture (the Send tap) so the browser allows audio. */
  resume() { return this.context.resume(); }
  play(base64: string) {
    const pcm = base64ToInt16(base64); if (!pcm.length) return;
    const buffer = this.context.createBuffer(1, pcm.length, this.rate); const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.gain);
    const at = Math.max(this.context.currentTime + 0.02, this.playhead);
    source.start(at); this.playhead = at + buffer.duration;
    this.sources.add(source); source.onended = () => this.sources.delete(source);
  }
  /** Rosa started talking: stop the teller mid-sentence. */
  interrupt() { for (const s of this.sources) { try { s.stop(); } catch { /* already ended */ } } this.sources.clear(); this.playhead = 0; }
  get speaking() { return this.sources.size > 0; }
  level() { return rms(this.analyser, this.data); }
  close() { this.interrupt(); void this.context.close(); }
}

function rms(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(data);
  let sum = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / data.length) * 4);
}
