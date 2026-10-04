import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import bcrypt from 'bcryptjs';
import { explainCase } from '../lib/case-education';
import { leverLabels, leverScore, levers, spotLevers } from '../lib/levers';
import { assessPayment, assessTranscript, levelFor } from '../lib/risk';
import type { AnalyticsEvent, CallState, CaseLever, Language, Lever, Payment, PublicState, Rail, Role, Signal, SignalSource, State, ToolLog } from '../lib/types';

export const DAY = 24 * 60 * 60 * 1000;
export const emptyCall = (): CallState => ({ id: null, active: false, startedAt: null, transcript: [], assessment: assessTranscript(''), safeWord: 'unchecked', signals: [], tools: [], whispers: [], alert: null, speech: null, foiledAt: null, live: 'rules' });
export const emptyState = (): State => ({
  call: emptyCall(), payments: [], events: [], cases: [],
  settings: { coSignLimit: 1000, pendingLimit: null, retainFlaggedTranscripts: false, safeWordConfigured: false, language: 'en' },
});
const railWords: Record<Rail, [string, string]> = { 'gift-card': ['gift cards', 'tarjetas de regalo'], wire: ['a wire transfer', 'una transferencia'], crypto: ['cryptocurrency', 'criptomonedas'], bank: ['a bank transfer', 'una transferencia'], bill: ['a bill payment', 'un pago'] };
const money = (amount: number) => '$' + amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const resolutionSpeech: Record<Language, Record<'block' | 'release', string>> = {
  en: { block: 'Rosa, Diego just confirmed he’s safe and it wasn’t him. Your money hasn’t moved. It’s okay to hang up.', release: 'Rosa, Diego confirmed it’s really him. Your payment can go ahead. Call him back on his saved number whenever you’re ready.' },
  es: { block: 'Rosa, Diego acaba de confirmar que está bien y que no era él. Tu dinero no se ha movido. Puedes colgar con tranquilidad.', release: 'Rosa, Diego confirmó que sí es él. Tu pago puede continuar. Llámalo a su número guardado cuando quieras.' },
};

export class Store {
  db: DatabaseSync;
  state: State;
  private segments = new Map<string, string>();
  private analyticsEnabled = false;
  onChange: () => void = () => {};
  constructor(path: string, private now: () => number = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.db.exec('CREATE TABLE IF NOT EXISTS risk_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
    const saved = this.get('state');
    this.state = saved ? JSON.parse(saved) : emptyState();
    this.state.settings = { ...emptyState().settings, ...this.state.settings };
    for (const payment of this.state.payments) payment.summarySource ??= 'rules';
    for (const file of this.state.cases) {
      const payment = this.state.payments.find(p => p.id === file.paymentId);
      if (file.outcome === 'foiled' && payment?.status === 'denied' && !file.education) file.education = explainCase(file, payment);
    }
    // A server restart ends the live session; the call context lived in memory only.
    this.state.call = emptyCall();
    this.state.settings.safeWordConfigured = !!this.get('safeWordHash');
    if (!this.get('sessionSecret')) this.set('sessionSecret', randomBytes(48).toString('hex'));
    this.tick();
  }
  get(key: string): string | undefined { return (this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined)?.value; }
  set(key: string, value: string) { this.db.prepare('INSERT INTO kv(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  save() {
    const persisted: State = structuredClone(this.state);
    if (!persisted.settings.retainFlaggedTranscripts || persisted.call.assessment.score < 30) {
      persisted.call.transcript = []; persisted.call.whispers = [];
      persisted.call.signals = persisted.call.signals.map(s => ({ ...s, quote: leverLabels[s.lever] }));
    }
    // Matching snippets can contain personal information too. Only labels are persisted without consent.
    if (!persisted.settings.retainFlaggedTranscripts) persisted.call.assessment.tells = persisted.call.assessment.tells.map(t => ({ ...t, phrase: t.label }));
    this.set('state', JSON.stringify(persisted));
    this.onChange();
  }
  event(label: string, score: number, kind: State['events'][number]['kind']) {
    const event = { id: randomUUID(), at: this.now(), score, label, kind };
    this.state.events.push(event);
    if (this.analyticsEnabled) this.queueRiskEvent(event);
    this.state.events = this.state.events.slice(-250);
  }
  analyticsStream() {
    let stream = this.get('analyticsStream');
    if (!stream) { stream = randomUUID(); this.set('analyticsStream', stream); }
    return stream;
  }
  enableAnalytics() {
    this.analyticsEnabled = true;
    // Backfill the retained local event window once on startup. Remote inserts
    // are idempotent; no transcript, payee, secret, or payment amount is sent.
    for (const event of this.state.events) this.queueRiskEvent(event, true);
  }
  private queueRiskEvent(event: State['events'][number], backfill = false) {
    const known = ['The Grandson Job', 'The IRS Job', 'The Safe Account Job', 'The Tech Support Job', 'The Romance Job', 'The Fake Check Job'];
    const scamType = !backfill && known.includes(this.state.call.assessment.scamType) ? this.state.call.assessment.scamType : 'Unverified request';
    const payload: AnalyticsEvent = { id: event.id, streamId: this.analyticsStream(), at: event.at, score: event.score, kind: event.kind, scamType, callId: backfill ? null : this.state.call.id };
    this.db.prepare('INSERT INTO risk_outbox(id,payload) VALUES (?,?) ON CONFLICT(id) DO NOTHING').run(event.id, JSON.stringify(payload));
  }
  pendingRiskEvents(limit = 100): AnalyticsEvent[] {
    return (this.db.prepare('SELECT payload FROM risk_outbox ORDER BY rowid LIMIT ?').all(limit) as { payload: string }[]).map(row => JSON.parse(row.payload));
  }
  pendingRiskCount(): number { return Number((this.db.prepare('SELECT count(*) AS total FROM risk_outbox').get() as { total: number }).total); }
  acknowledgeRiskEvents(ids: string[]) {
    const remove = this.db.prepare('DELETE FROM risk_outbox WHERE id=?');
    this.db.exec('BEGIN');
    try { for (const id of ids) remove.run(id); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  snapshot(role: Role, config: PublicState['config']): PublicState {
    const state = structuredClone(this.state);
    if (role === 'relative') {
      // Diego sees only the question addressed to him and the outcome.
      state.payments = []; state.events = []; state.cases = [];
      state.call = { ...emptyCall(), id: state.call.id, active: state.call.active, alert: state.call.alert, foiledAt: state.call.foiledAt };
      state.settings = { ...emptyState().settings, language: state.settings.language };
    }
    return { ...state, config };
  }

  // ---- Call lifecycle ----
  private requireCall(callId?: string) {
    if (!this.state.call.active) throw new Error('Answer the call first.');
    if (callId && callId !== this.state.call.id) throw new Error('This belongs to an ended or different call.');
  }
  startCall(live: 'gemini' | 'rules' = 'rules') {
    if (this.state.call.active) throw new Error('A call is already being guarded. End it before starting another.');
    this.segments.clear();
    this.state.call = { ...emptyCall(), id: randomUUID(), active: true, startedAt: this.now(), live };
    this.logTool('session_start', live === 'gemini' ? 'Gemini Live listening · caller audio only' : 'Rule spotter listening', null, 'system');
    this.event('Call answered · Tripwire listening with consent', 0, 'call'); this.save();
  }
  setLive(live: 'gemini' | 'rules', detail: string) {
    if (!this.state.call.active || this.state.call.live === live) return;
    this.state.call.live = live; this.logTool(live === 'gemini' ? 'session_live' : 'session_fallback', detail, null, 'system'); this.save();
  }
  endCall() {
    this.state.call.active = false;
    if (!this.state.settings.retainFlaggedTranscripts || this.state.call.assessment.score < 30) this.state.call.transcript = [];
    this.event('Call ended', this.state.call.assessment.score, 'call'); this.save();
  }
  logTool(name: string, detail: string, latencyMs: number | null, source: ToolLog['source']) {
    this.state.call.tools.push({ id: randomUUID(), at: this.now(), name, detail, latencyMs, source });
    this.state.call.tools = this.state.call.tools.slice(-200);
  }
  addLine(text: string, source: string, callId?: string, segmentId?: string) {
    this.requireCall(callId);
    if (segmentId && this.segments.has(segmentId)) {
      if (this.segments.get(segmentId) !== text) throw new Error('This transcript segment has already been submitted with different text.');
      return null;
    }
    if (segmentId) {
      if (this.segments.size >= 10000) throw new Error('This call has reached its transcript limit.');
      this.segments.set(segmentId, text);
    }
    const line = { id: randomUUID(), text, source, at: this.now() };
    this.state.call.transcript.push(line);
    this.state.call.transcript = this.state.call.transcript.slice(-200);
    // Belt and suspenders: the rule spotter lights only levers the model has not lit yet.
    const lit = new Set(this.state.call.signals.map(s => s.lever));
    for (const hit of spotLevers(text)) if (!lit.has(hit.lever)) this.pushSignal(hit.lever, hit.quote, 0.6, 'rule', null);
    // Without Gemini, a family-emergency story plus money pressure still prompts the family word.
    const now = new Set(this.state.call.signals.map(s => s.lever));
    if (this.state.call.live === 'rules' && now.has('payment') && (now.has('emotion') || now.has('trust')) && this.state.call.safeWord === 'unchecked') {
      this.whisper(this.state.settings.language === 'es' ? 'Pídele tu palabra de familia.' : 'Ask him for your family word.', 'rule');
    }
    this.recompute();
    this.event('Caller line · ' + this.state.call.assessment.scamType, this.state.call.assessment.score, 'call'); this.save();
    return this.state.call.id;
  }
  private pushSignal(lever: Lever, quote: string, confidence: number, source: SignalSource, latencyMs: number | null) {
    const signal: Signal = { id: randomUUID(), lever, quote, confidence, source, at: this.now(), latencyMs };
    this.state.call.signals.push(signal);
    this.logTool('report_signal', `${lever.toUpperCase()} “${quote}”`, latencyMs, source);
    return signal;
  }
  /** Time from the caller saying the quote (its transcription) to the signal. */
  quoteLatency(quote: string) {
    const needle = quote.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
    const line = [...this.state.call.transcript].reverse().find(l => needle && l.text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').includes(needle.slice(0, 40)));
    return line ? Math.max(0, this.now() - line.at) : null;
  }
  reportSignal(lever: Lever, quote: string, confidence: number) {
    this.requireCall();
    const duplicate = this.state.call.signals.find(s => s.source === 'gemini' && s.lever === lever && s.quote.toLowerCase() === quote.toLowerCase());
    if (duplicate) return duplicate;
    const signal = this.pushSignal(lever, quote, Math.max(0, Math.min(1, confidence)), 'gemini', this.quoteLatency(quote));
    this.state.call.assessment.source = 'gemini';
    this.recompute(); this.event(`Con lever · ${leverLabels[lever]}`, this.state.call.assessment.score, 'call'); this.save();
    return signal;
  }
  updateRisk(score: number, scamType: string, reason: string) {
    this.requireCall();
    const a = this.state.call.assessment;
    // Evidence is sticky: the model can raise risk, never quietly erase it.
    const next = Math.max(a.score, Math.round(Math.max(0, Math.min(100, score))));
    this.state.call.assessment = { ...a, score: next, level: levelFor(next), source: 'gemini', ...(score >= a.score && scamType && !/^none$/i.test(scamType) ? { scamType: titleCase(scamType) } : {}), ...(score >= a.score && reason ? { advice: reason } : {}) };
    this.logTool('update_risk', `${next}/100 · ${this.state.call.assessment.scamType}`, null, 'gemini');
    this.event('Risk updated by Gemini', next, 'call'); this.save();
  }
  private recompute() {
    const c = this.state.call;
    const rules = assessTranscript(c.transcript.map(l => l.text).join(' '), c.safeWord === 'failed', c.alert?.reply === 'block');
    const lit = new Set(c.signals.map(s => s.lever));
    const score = Math.max(c.assessment.score, rules.score, leverScore(lit, c.safeWord === 'failed', c.alert?.reply === 'block'));
    c.assessment = { ...rules, ...(c.assessment.source === 'gemini' ? { scamType: c.assessment.scamType === 'Unverified request' ? rules.scamType : c.assessment.scamType, advice: c.assessment.advice, source: 'gemini' as const } : {}), score, level: levelFor(score), tells: rules.tells };
  }
  whisper(text: string, source: SignalSource | 'system') {
    this.requireCall();
    const kind = /family word|palabra (?:de )?familia|palabra secreta|safe word/i.test(text) ? 'family-word' : 'info';
    if (kind === 'family-word' && this.state.call.whispers.some(w => w.kind === 'family-word')) return;
    this.state.call.whispers.push({ id: randomUUID(), at: this.now(), text: text.slice(0, 160), kind, source });
    this.logTool('whisper', `“${text.slice(0, 80)}”`, null, source === 'system' ? 'system' : source);
    this.save();
  }
  familyWordAsked() {
    this.requireCall();
    if (this.state.call.safeWord === 'unchecked') this.state.call.safeWord = 'asked';
    this.logTool('rosa_event', 'ROSA_ASKED_FAMILY_WORD', null, 'system'); this.save();
  }
  async setSafeWord(word: string) {
    const hash = await bcrypt.hash(word.trim().toLocaleLowerCase('en-US'), 12);
    this.set('safeWordHash', hash); this.state.settings.safeWordConfigured = true; this.save();
  }
  /**
   * Compares the caller's answer with the salted hash. An empty answer is a dodge
   * and counts as a failure. The phrase is never logged, stored, or returned.
   */
  async verifyWord(word: string, source: 'gemini' | 'rosa' = 'rosa') {
    const hash = this.get('safeWordHash'); if (!hash) throw new Error('Set your family word first.');
    this.requireCall();
    const callId = this.state.call.id;
    const answer = word.trim();
    const started = this.now();
    const matched = answer.length > 0 && await bcrypt.compare(answer.toLocaleLowerCase('en-US'), hash);
    if (callId !== this.state.call.id || !this.state.call.active) throw new Error('This call has ended.');
    // A later guess must not erase a previously failed verification.
    if (!matched) this.state.call.safeWord = 'failed';
    else if (this.state.call.safeWord !== 'failed') this.state.call.safeWord = 'matched';
    this.logTool('check_family_word', matched ? 'match' : answer ? 'no match' : 'no answer (dodged)', this.now() - started, source === 'gemini' ? 'gemini' : 'system');
    if (!matched && !this.state.call.signals.some(s => s.lever === 'trust' && s.quote.startsWith('['))) {
      this.pushSignal('trust', answer ? '[gave the wrong family word]' : '[dodged the family word]', 1, source === 'gemini' ? 'gemini' : 'rule', null);
    }
    this.recompute();
    if (!matched) this.state.call.assessment = { ...this.state.call.assessment, level: 'Critical', score: Math.max(this.state.call.assessment.score, 90) };
    this.captureCaseChecks();
    this.event(matched ? 'Family word matched · still verify the request' : 'Family word failed · identity unverified', this.state.call.assessment.score, 'verification'); this.save();
    return matched;
  }

  // ---- Trusted contact loop ----
  raiseAlert(summary: string, recommendedAction: string, source: 'gemini' | 'rules') {
    this.requireCall();
    const current = this.state.call.alert;
    if (current && !current.reply) {
      // The model's wording replaces the rules template while Diego has not answered.
      if (source === 'gemini') { current.summary = summary; current.recommendedAction = recommendedAction; current.source = 'gemini'; }
      this.logTool('alert_guardian', `updated · “${summary.slice(0, 80)}”`, null, source === 'gemini' ? 'gemini' : 'system'); this.save();
      return current;
    }
    if (current?.reply) return current;
    this.state.call.alert = { id: randomUUID(), at: this.now(), summary, recommendedAction, source, reply: null, repliedAt: null };
    this.logTool('alert_guardian', `Diego’s phone · “${summary.slice(0, 80)}”`, null, source === 'gemini' ? 'gemini' : 'system');
    this.event('Diego asked to confirm', this.state.call.assessment.score, 'verification'); this.save();
    return this.state.call.alert;
  }
  guardianReply(alertId: string, answer: 'release' | 'block') {
    const alert = this.state.call.alert;
    if (!alert || alert.id !== alertId || alert.reply) throw new Error('This request is no longer waiting for your answer.');
    alert.reply = answer; alert.repliedAt = this.now();
    const callId = this.state.call.id;
    const affected = this.state.payments.filter(p => p.callId === callId && (p.status === 'held' || p.status === 'review') && !p.escrow);
    for (const payment of affected) {
      payment.status = answer === 'block' ? 'denied' : 'released'; payment.resolvedAt = this.now();
      this.closeCase(payment.id, answer === 'block' ? 'foiled' : 'reviewed');
    }
    if (answer === 'block') this.state.call.foiledAt = this.now();
    this.recompute();
    this.captureCaseChecks();
    for (const payment of affected) {
      const file = this.state.cases.find(c => c.paymentId === payment.id);
      if (!file) continue;
      file.levers = this.caseLevers(); file.closedBy ??= 'rules';
      file.lesson ??= answer === 'block' ? 'When a call asks for secrecy and money, pause and ask the person it claims to be.' : 'Checking with family took seconds and settled it.';
      if (answer === 'block') file.education = explainCase(file, payment);
    }
    const language = this.state.settings.language;
    this.setSpeech(resolutionSpeech[language][answer], language, 'system');
    this.logTool('guardian_reply', answer === 'block' ? 'NOT ME · block' : 'IT’S ME · release', alert.repliedAt - alert.at, 'system');
    this.event(answer === 'block' ? 'HEIST FOILED · Diego: “Not me”' : 'Diego confirmed it’s him · payment released', this.state.call.assessment.score, 'verification'); this.save();
    return alert;
  }
  setSpeech(text: string, language: Language, source: 'gemini' | 'system') {
    // One voice moment per call. The deterministic resolution speaks first so the
    // voice starts within a second of Diego's tap; the model cannot talk over the caller.
    if (this.state.call.speech) return null;
    this.state.call.speech = { id: randomUUID(), at: this.now(), text: text.slice(0, 600), language, source };
    this.logTool('speak_to_user', `${language.toUpperCase()} · “${text.slice(0, 70)}”`, null, source);
    return this.state.call.speech;
  }
  speakFromModel(text: string, language: Language) {
    if (!this.state.call.alert?.reply) throw new Error('speak_to_user is only available after the family replies.');
    const speech = this.setSpeech(text, language, 'gemini'); this.save(); return speech;
  }
  caseLevers(): CaseLever[] {
    const signals = this.state.call.signals;
    return levers.flatMap(lever => {
      const pick = signals.find(s => s.lever === lever && s.source === 'gemini') || signals.find(s => s.lever === lever);
      return pick ? [{ lever, quote: pick.quote, at: this.state.call.startedAt ? pick.at - this.state.call.startedAt : null }] : [];
    });
  }
  closeCaseFile(summary: string, items: { lever: Lever; quote: string }[], lesson: string) {
    const callId = this.state.call.id;
    const file = this.state.cases.find(c => c.evidence?.callId === callId && c.outcome !== 'open') || this.state.cases.find(c => c.evidence?.callId === callId);
    if (!file) throw new Error('No case is open for this call yet.');
    // Only quotes actually heard on this call are kept; nothing invented.
    const heard = (this.state.call.transcript.map(l => l.text).join(' ') + ' ' + this.state.call.signals.map(s => s.quote).join(' ')).toLowerCase();
    const verified = items.filter(item => item.quote && heard.includes(item.quote.toLowerCase().slice(0, 40)));
    const known = this.caseLevers();
    file.levers = levers.flatMap(lever => { const v = verified.find(i => i.lever === lever); const k = known.find(i => i.lever === lever); return v ? [{ lever, quote: v.quote, at: k?.at ?? null }] : k ? [k] : []; });
    file.summary = summary.slice(0, 600); file.lesson = lesson.slice(0, 200); file.closedBy = 'gemini';
    this.logTool('close_case', `${file.levers.length} levers · “${lesson.slice(0, 60)}”`, null, 'gemini'); this.save();
    return file;
  }
  private captureCaseChecks() {
    for (const file of this.state.cases) {
      if (file.outcome === 'reviewed' || !file.evidence?.callId || file.evidence.callId !== this.state.call.id) continue;
      file.evidence.safeWordFailed ||= this.state.call.safeWord === 'failed';
      file.evidence.callbackDenied ||= this.state.call.alert?.reply === 'block';
      file.tells = [...new Set([...file.tells, ...this.state.call.assessment.tells.map(t => t.label)])];
    }
  }

  // ---- The Teller ----
  createPayment(input: { amount: number; payee: string; rail: Rail; newPayee: boolean; pasted?: boolean }) {
    this.tick();
    const call = this.state.call;
    const assessment = assessPayment({ ...input, activeCall: call.active, callScore: call.assessment.score, secret: call.signals.some(s => s.lever === 'isolation') });
    const held = assessment.score >= 85 || input.amount > this.state.settings.coSignLimit;
    const status = held ? 'held' : assessment.score >= 30 ? 'review' : 'released';
    const reasons = [...assessment.reasons];
    if (input.amount > this.state.settings.coSignLimit) reasons.push('Above your family co-sign limit');
    const evidence = call.active ? this.caseLevers().filter(l => !l.quote.startsWith('[')).map(({ lever, quote }) => ({ lever, quote })) : [];
    const payment: Payment = {
      id: randomUUID(), ...input, status, score: assessment.score, reasons, createdAt: this.now(), callId: call.active ? call.id : null, evidence,
      releaseAt: held ? this.now() + DAY : null, resolvedAt: status === 'released' ? this.now() : null,
      summarySource: 'rules', summary: `${input.payee} · ${money(input.amount)} by ${input.rail}. ${reasons.join('. ')}. ${held ? 'Paused for a family check.' : status === 'review' ? 'A specific warning must be reviewed before continuing.' : 'No red flags found.'}`,
    };
    this.state.payments.unshift(payment);
    if (assessment.score >= 30 || held) this.state.cases.unshift({ id: randomUUID(), title: call.assessment.scamType === 'Unverified request' ? 'The Payment Check' : call.assessment.scamType, openedAt: this.now(), score: payment.score, tells: [...new Set([...call.assessment.tells.map(t => t.label), ...reasons])], paymentId: payment.id, outcome: 'open', evidence: { callId: call.active ? call.id : null, safeWordFailed: call.safeWord === 'failed', callbackDenied: call.alert?.reply === 'block', held } });
    if (call.active) this.logTool('payment_attempt', `${money(input.amount)} · ${input.rail} · ${input.newPayee ? 'new payee' : 'known payee'} → ${status.toUpperCase()}`, null, 'system');
    // Deterministic floor: a held payment during a call always reaches Diego, even if the model is slow.
    if (held && call.active && !call.alert) {
      const [en, es] = railWords[input.rail];
      const story = call.assessment.scamType === 'The Grandson Job' || call.signals.some(s => /bail|jail|fianza|cárcel/i.test(s.quote)) ? (this.state.settings.language === 'es' ? ' para una fianza' : ' in bail money') : '';
      this.raiseAlert(this.state.settings.language === 'es' ? `Alguien usando tu nombre le está pidiendo a la abuela ${money(input.amount)} en ${es}${story} ahora mismo. ¿Eres tú?` : `Someone using your name is asking Grandma for ${money(input.amount)} in ${en}${story} right now. Is this you?`, 'block', 'rules');
    }
    this.event(held ? 'Teller · payment paused' : status === 'review' ? 'Teller · review requested' : 'Routine payment completed', payment.score, 'payment'); this.save(); return payment;
  }
  holdPayment(id: string, reason: string) {
    const payment = this.payment(id);
    if (payment.status === 'held' || payment.status === 'denied') { this.logTool('hold_payment', `already ${payment.status}`, null, 'gemini'); this.save(); return payment; }
    if (payment.status === 'released') throw new Error('This payment already completed.');
    payment.status = 'held'; payment.releaseAt = this.now() + DAY;
    payment.reasons = [...new Set([...payment.reasons, reason.slice(0, 160)])];
    const file = this.state.cases.find(c => c.paymentId === id); if (file?.evidence) file.evidence.held = true;
    this.logTool('hold_payment', `${money(payment.amount)} · “${reason.slice(0, 70)}”`, null, 'gemini');
    this.event('Gemini paused the payment', payment.score, 'payment'); this.save(); return payment;
  }
  reviewPayment(id: string, secret: boolean) {
    const payment = this.payment(id);
    if (payment.status !== 'review') throw new Error('This payment is not awaiting your review.');
    // Re-evaluate at the actual release boundary: the caller may have raised risk
    // while the protected user was reading the first warning.
    this.tick();
    const current = assessPayment({ ...payment, activeCall: this.state.call.active, callScore: this.state.call.assessment.score, secret });
    payment.score = Math.max(payment.score, current.score);
    payment.reasons = [...new Set([...payment.reasons, ...current.reasons])];
    const mustHold = payment.score >= 85 || payment.amount > this.state.settings.coSignLimit;
    if (mustHold) {
      payment.status = 'held'; payment.releaseAt = this.now() + DAY;
    } else { payment.status = 'released'; payment.resolvedAt = this.now(); this.closeCase(id, 'reviewed'); }
    const file = this.state.cases.find(c => c.paymentId === id);
    if (file) { file.score = payment.score; file.tells = [...new Set([...file.tells, ...payment.reasons])]; if (mustHold && file.evidence) file.evidence.held = true; }
    payment.summarySource = 'rules';
    payment.summary = `${payment.payee} · ${money(payment.amount)}. ${payment.reasons.join('. ')}. ${mustHold ? 'Updated risk check; payment paused.' : 'User reviewed the warning.'}`;
    this.event(mustHold ? 'Updated risk check · payment paused' : 'Warning reviewed · payment completed', payment.score, 'payment'); this.save(); return payment;
  }
  payment(id: string) { const payment = this.state.payments.find(p => p.id === id); if (!payment) throw new Error('Payment not found.'); return payment; }
  decidePayment(id: string, decision: 'approve' | 'deny') {
    this.tick(); const payment = this.payment(id);
    if (payment.escrow) throw new Error('This devnet escrow needs a confirmed on-chain decision.');
    if (payment.status !== 'held' && payment.status !== 'review') throw new Error('This payment has already been resolved.');
    payment.status = decision === 'approve' ? 'released' : 'denied'; payment.resolvedAt = this.now();
    this.closeCase(id, decision === 'deny' ? 'foiled' : 'reviewed');
    const file = this.state.cases.find(c => c.paymentId === id);
    if (file && decision === 'deny') {
      // Only verification from the original call belongs in this case.
      if (file.evidence?.callId && file.evidence.callId === this.state.call.id) {
        file.evidence.safeWordFailed ||= this.state.call.safeWord === 'failed';
        file.evidence.callbackDenied ||= this.state.call.alert?.reply === 'block';
        file.tells = [...new Set([...file.tells, ...this.state.call.assessment.tells.map(t => t.label)])];
        file.levers ??= this.caseLevers();
      }
      file.education = explainCase(file, payment);
    }
    this.event(decision === 'deny' ? 'HEIST FOILED · payment denied' : 'Payment approved', payment.score, 'payment'); this.save(); return payment;
  }
  closeCase(paymentId: string, outcome: 'foiled' | 'reviewed') { const file = this.state.cases.find(c => c.paymentId === paymentId); if (file) file.outcome = outcome; }
  updateSettings(input: { retainFlaggedTranscripts?: boolean; coSignLimit?: number; language?: Language }) {
    if (input.retainFlaggedTranscripts !== undefined) {
      this.state.settings.retainFlaggedTranscripts = input.retainFlaggedTranscripts;
      if (!input.retainFlaggedTranscripts && !this.state.call.active) this.state.call.transcript = [];
    }
    if (input.language) this.state.settings.language = input.language;
    if (input.coSignLimit !== undefined && input.coSignLimit !== this.state.settings.coSignLimit) this.state.settings.pendingLimit = { value: input.coSignLimit, effectiveAt: this.now() + DAY };
    this.save();
  }
  tick() {
    let changed = false;
    for (const payment of this.state.payments) if (payment.status === 'held' && !payment.escrow && payment.releaseAt !== null && this.now() >= payment.releaseAt) {
      payment.status = 'released'; payment.resolvedAt = this.now(); this.closeCase(payment.id, 'reviewed');
      this.event('Cooling-off period complete · payment released', payment.score, 'payment'); changed = true;
    }
    const pending = this.state.settings.pendingLimit;
    if (pending && this.now() >= pending.effectiveAt) { this.state.settings.coSignLimit = pending.value; this.state.settings.pendingLimit = null; changed = true; }
    if (changed) this.save();
  }
  reset() {
    if (this.state.payments.some(p => p.escrow && !['released', 'refunded'].includes(p.escrow.state))) throw new Error('Resolve active devnet escrows before resetting the demo.');
    const language = this.state.settings.language;
    this.segments.clear(); this.set('analyticsStream', randomUUID()); this.state = emptyState(); this.state.settings.language = language; this.state.settings.safeWordConfigured = !!this.get('safeWordHash'); this.save();
  }
}
function titleCase(text: string) { return text.trim().slice(0, 60).replace(/\b\w/g, c => c.toUpperCase()); }
