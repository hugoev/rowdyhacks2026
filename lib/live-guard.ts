import { FunctionResponseScheduling, GoogleGenAI, type LiveServerMessage, type Session } from '@google/genai';
import { int16ToBase64 } from './audio';
import { liveConfig } from './live-config';
import type { Language } from './types';

export type GuardStatus = 'connecting' | 'live' | 'reconnecting' | 'closed' | 'failed';
export type GuardHooks = {
  token: (handle?: string) => Promise<{ token: string; model: string }>;
  tool: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** A finished caller utterance from Gemini's input transcription. */
  transcript: (text: string) => void;
  partial?: (text: string) => void;
  status: (status: GuardStatus, detail?: string) => void;
};
const CHECKPOINT_MS = 8000;
const FRAME_MS = 100;

/**
 * One Gemini Live session per call. It hears only caller audio, never speaks
 * (its audio is discarded), and acts only through tools.
 */
export class LiveGuard {
  private session: Session | null = null;
  private handle: string | undefined;
  private stopped = false;
  private retries = 0;
  private buffer = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private checkpoint: ReturnType<typeof setInterval> | null = null;
  private lastAudioAt = 0;
  private lastCheckpointAt = 0;
  private lastToolAt = 0;
  /** Wall-clock time until which real caller audio has already been sent. */
  private audioUntil = 0;
  private rate = 16000;
  private pump: ReturnType<typeof setInterval> | null = null;
  constructor(private hooks: GuardHooks, private language: Language = 'en') {}

  async start() {
    this.stopped = false; this.hooks.status('connecting');
    await this.open();
    this.checkpoint = setInterval(() => {
      // Fallback: if the caller keeps talking for 8 s with no tool activity, a quiet
      // text checkpoint asks the model to report what it has heard so far.
      const now = Date.now();
      if (this.session && now - this.lastAudioAt < 2000 && now - this.lastToolAt >= CHECKPOINT_MS && now - this.lastCheckpointAt >= CHECKPOINT_MS) {
        this.lastCheckpointAt = now; this.event('CHECKPOINT');
      }
    }, 1000);
    // The voice agent only sends audio while it speaks. Gemini's turn detection
    // needs to hear silence to end the caller's turn, so gaps are filled with
    // real-time silence. Measured: tools then fire ~0.3-1.2 s after each turn.
    this.pump = setInterval(() => {
      if (!this.session || !this.audioUntil || Date.now() < this.audioUntil + FRAME_MS) return;
      const silence = new Int16Array(Math.round(this.rate * FRAME_MS / 1000));
      this.push(int16ToBase64(silence), this.rate, FRAME_MS);
    }, FRAME_MS);
  }
  private async open() {
    const { token, model } = await this.hooks.token(this.handle);
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
    this.session = await ai.live.connect({
      model, config: liveConfig(this.language, this.handle),
      callbacks: {
        onopen: () => { this.retries = 0; this.hooks.status('live'); },
        onmessage: message => void this.receive(message),
        onerror: event => console.warn('Gemini Live error', event),
        onclose: event => void this.closed(event.reason),
      },
    });
  }
  private async closed(reason?: string) {
    this.session = null;
    if (this.stopped) { this.hooks.status('closed'); return; }
    if (this.retries++ < 3) {
      this.hooks.status('reconnecting', reason);
      try { await this.open(); return; } catch (error) { console.warn('Gemini Live resume failed', error); }
    }
    this.hooks.status('failed', reason || 'Live session closed');
  }
  private async receive(message: LiveServerMessage) {
    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) this.handle = update.newHandle;
    if (message.goAway) void this.reconnect();
    const transcription = message.serverContent?.inputTranscription;
    if (transcription?.text) this.hear(transcription.text, !!transcription.finished);
    const calls = message.toolCall?.functionCalls || [];
    if (!calls.length) return;
    this.lastToolAt = Date.now();
    // Calls run concurrently so a slow hash compare never delays a signal.
    const responses = await Promise.all(calls.map(async call => {
      let response: Record<string, unknown>;
      try { response = await this.hooks.tool(call.name || '', (call.args || {}) as Record<string, unknown>); }
      catch (error) { response = { error: error instanceof Error ? error.message : 'Tool failed' }; }
      return { id: call.id, name: call.name, response, scheduling: FunctionResponseScheduling.SILENT };
    }));
    try { this.session?.sendToolResponse({ functionResponses: responses }); } catch (error) { console.warn('Tool response failed', error); }
  }
  private hear(text: string, finished: boolean) {
    this.buffer += text; this.hooks.partial?.(this.buffer.trim());
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (finished || /[.!?¿¡]\s*$/.test(this.buffer.trim())) this.flush();
    else this.flushTimer = setTimeout(() => this.flush(), 1200);
  }
  private flush() {
    const line = this.buffer.trim(); this.buffer = ''; this.hooks.partial?.('');
    if (line) this.hooks.transcript(line);
  }
  private async reconnect() {
    const old = this.session; this.session = null; this.retries = 0;
    try { old?.close(); } catch { /* already closed */ }
  }
  /** 16 kHz (or any PCM rate) little-endian PCM16, base64. */
  sendAudio(base64: string, rate: number) {
    if (!this.session) return;
    this.lastAudioAt = Date.now(); this.rate = rate;
    // base64 length -> PCM16 sample count -> playback duration.
    const ms = (base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)) / 2 / rate * 1000;
    this.push(base64, rate, ms);
  }
  private push(base64: string, rate: number, ms: number) {
    this.audioUntil = Math.max(this.audioUntil, Date.now()) + ms;
    try { this.session?.sendRealtimeInput({ audio: { data: base64, mimeType: `audio/pcm;rate=${rate}` } }); } catch { /* socket closing */ }
  }
  /** App events (ROSA_ASKED_FAMILY_WORD, PAYMENT_ATTEMPT, GUARDIAN_REPLY, CALLER_SAID) as client content. */
  event(text: string) {
    if (!this.session) return false;
    try { this.session.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true }); return true; }
    catch { return false; }
  }
  get live() { return !!this.session; }
  stop() {
    this.stopped = true; this.flush();
    if (this.checkpoint) clearInterval(this.checkpoint);
    if (this.pump) clearInterval(this.pump);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    try { this.session?.close(); } catch { /* already closed */ }
    this.session = null;
  }
}
