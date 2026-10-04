import { FunctionResponseScheduling, GoogleGenAI, type LiveServerMessage, type Session } from '@google/genai';
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
  constructor(private hooks: GuardHooks, private language: Language = 'en') {}

  async start() {
    this.stopped = false; this.hooks.status('connecting');
    await this.open();
    this.checkpoint = setInterval(() => {
      // Some Live models wait for a turn end before calling tools. A quiet text
      // checkpoint keeps detection flowing while the caller keeps talking.
      if (this.session && Date.now() - this.lastAudioAt < CHECKPOINT_MS && Date.now() - this.lastCheckpointAt >= CHECKPOINT_MS) {
        this.lastCheckpointAt = Date.now(); this.event('CHECKPOINT');
      }
    }, 1000);
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
    this.lastAudioAt = Date.now();
    try { this.session.sendRealtimeInput({ audio: { data: base64, mimeType: `audio/pcm;rate=${rate}` } }); } catch { /* socket closing */ }
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
    if (this.flushTimer) clearTimeout(this.flushTimer);
    try { this.session?.close(); } catch { /* already closed */ }
    this.session = null;
  }
}
