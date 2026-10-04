import { FunctionResponseScheduling, GoogleGenAI, type LiveConnectConfig, type LiveServerMessage, type Session } from '@google/genai';
import { startMicrophone, VoicePlayer, type Microphone } from './audio';

const debug = () => { try { return typeof localStorage !== 'undefined' && localStorage.getItem('tripwire-debug') === '1'; } catch { return false; } };

export type TellerStatus = 'connecting' | 'live' | 'reconnecting' | 'closed' | 'failed';
export type Grant = { token: string; model: string; config: LiveConnectConfig };
export type TellerHooks = {
  /** Fresh single-use token for a (re)connect. */
  grant: () => Promise<Grant>;
  /** Return a response now, or null to answer later (call_trusted_contact). */
  tool: (name: string, args: Record<string, unknown>, id: string) => Promise<Record<string, unknown> | null>;
  /** Live caption; done=true when that line is finished. */
  caption: (who: 'rosa' | 'teller', text: string, done: boolean) => void;
  status: (status: TellerStatus, detail?: string) => void;
};

/**
 * The safety teller: one Gemini Live audio session. Rosa's mic streams in,
 * the teller's voice streams out, and tools run in the app. A non-blocking
 * call_trusted_contact keeps the session open while Diego's phone rings;
 * its result is delivered later with the same function-call id.
 */
export class TellerSession {
  private session: Session | null = null;
  private mic: Microphone | null = null;
  readonly player = new VoicePlayer(24000);
  private stopped = false;
  private retries = 0;
  private rosaLine = ''; private tellerLine = '';
  private transcript: string[] = [];
  pushToTalk = false;
  /** Stop sending Rosa's mic (e.g. while Diego's call uses the same laptop mic). */
  muted = false;
  constructor(private hooks: TellerHooks) {}

  /** Call from the Send tap (a user gesture) so audio playback is allowed. */
  async start(first: Grant, opening: string) {
    this.stopped = false; this.hooks.status('connecting');
    await this.player.resume();
    await this.open(first);
    this.cue(opening);
    this.mic = await startMicrophone(chunk => {
      // Push-to-talk: audio only flows while the button is held.
      if (this.muted || (this.pushToTalk && !this.talking)) return;
      try { this.session?.sendRealtimeInput({ audio: { data: chunk, mimeType: 'audio/pcm;rate=16000' } }); } catch { /* reconnecting */ }
    });
  }
  private async open(grant: Grant) {
    const ai = new GoogleGenAI({ apiKey: grant.token, httpOptions: { apiVersion: 'v1alpha' } });
    this.session = await ai.live.connect({
      model: grant.model, config: grant.config,
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
    if (this.retries++ < 2) {
      // Reconnect and re-send the context so the teller picks up where it left off.
      this.hooks.status('reconnecting', reason);
      try {
        await this.open(await this.hooks.grant());
        this.cue(`[The connection dropped and is back. Conversation so far:\n${this.transcript.slice(-12).join('\n')}\nContinue naturally from here; do not greet again.]`);
        return;
      } catch (error) { console.warn('Gemini Live reconnect failed', error); }
    }
    this.hooks.status('failed', reason || 'The teller connection closed.');
  }
  private async receive(message: LiveServerMessage) {
    const content = message.serverContent;
    // Opt-in timing log for rehearsals: localStorage.setItem('tripwire-debug', '1').
    if (debug()) console.info('[teller]', Object.keys(message).filter(k => (message as never)[k] !== undefined).join(','), content ? Object.keys(content).join(',') : '', message.toolCall?.functionCalls?.map(c => c.name).join(',') || '', content?.outputTranscription?.text || '');
    if (content?.interrupted) this.player.interrupt();
    for (const part of content?.modelTurn?.parts || []) if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) this.player.play(part.inlineData.data);
    if (content?.inputTranscription?.text) { this.rosaLine += content.inputTranscription.text; this.hooks.caption('rosa', this.rosaLine.trim(), false); }
    if (content?.outputTranscription?.text) {
      if (this.rosaLine) this.commit('rosa');
      this.tellerLine += content.outputTranscription.text; this.hooks.caption('teller', this.tellerLine.trim(), false);
    }
    if (content?.turnComplete || content?.interrupted) { this.commit('rosa'); this.commit('teller'); }
    if (message.goAway) { try { this.session?.close(); } catch { /* closing */ } }
    const calls = message.toolCall?.functionCalls || [];
    for (const call of calls) {
      const response = await this.hooks.tool(call.name || '', (call.args || {}) as Record<string, unknown>, call.id || '');
      // WHEN_IDLE: the teller finishes its sentence, then continues (e.g. hold -> tell Rosa -> finish).
      if (response) this.respond(call.id || '', call.name || '', response, FunctionResponseScheduling.WHEN_IDLE);
    }
  }
  private commit(who: 'rosa' | 'teller') {
    const line = (who === 'rosa' ? this.rosaLine : this.tellerLine).trim();
    if (line) { this.transcript.push(`${who === 'rosa' ? 'Rosa' : 'Tripwire'}: ${line}`); this.hooks.caption(who, line, true); }
    if (who === 'rosa') this.rosaLine = ''; else this.tellerLine = '';
  }
  /** Deliver a (possibly late) function result. INTERRUPT makes the teller speak it right away. */
  respond(id: string, name: string, response: Record<string, unknown>, scheduling = FunctionResponseScheduling.INTERRUPT) {
    try { this.session?.sendToolResponse({ functionResponses: [{ id, name, response, scheduling }] }); return true; } catch { return false; }
  }
  /** App messages to the teller, in square brackets so it knows they aren't Rosa. */
  cue(text: string) {
    try { this.session?.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true }); return true; } catch { return false; }
  }
  // ---- Push-to-talk (expo noise fallback) ----
  private talking = false;
  holdToTalk(down: boolean) {
    if (!this.pushToTalk || this.talking === down) return;
    this.talking = down;
    if (down) this.player.interrupt();
    try { this.session?.sendRealtimeInput(down ? { activityStart: {} } : { activityEnd: {} }); } catch { /* closing */ }
  }
  /** What Rosa said, for the rules fallback case file. */
  rosaSaid() { return [...this.transcript.filter(l => l.startsWith('Rosa:')).map(l => l.slice(6)), this.rosaLine].join(' '); }
  get live() { return !!this.session; }
  level() { return Math.max(this.player.level(), (this.mic?.level() ?? 0) * 0.35); }
  /**
   * Ends without cutting anyone off: stops listening, optionally waits for a
   * final line to start, lets everything queued finish playing, then closes.
   */
  async endGracefully({ waitForSpeech = false, max = 12000 } = {}) {
    this.muted = true;
    const start = Date.now(); let spoke = this.player.speaking; let quietSince = 0;
    while (Date.now() - start < max && !this.stopped) {
      if (this.player.speaking) { spoke = true; quietSince = 0; }
      else {
        quietSince ||= Date.now();
        // Done once the last line has played out (or nothing was coming).
        if ((spoke || !waitForSpeech) && Date.now() - quietSince > 900) break;
        if (!spoke && waitForSpeech && Date.now() - start > 6000) break;
      }
      await new Promise(r => setTimeout(r, 120));
    }
    this.stop();
  }
  stop() {
    // Keep the last lines (often the good news) for the dashboard before closing.
    this.commit('rosa'); this.commit('teller');
    this.stopped = true;
    this.mic?.stop(); this.mic = null;
    try { this.session?.close(); } catch { /* closed */ }
    this.session = null; this.player.close();
  }
}
