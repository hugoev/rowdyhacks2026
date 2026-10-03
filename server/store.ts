import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import bcrypt from 'bcryptjs';
import { explainCase } from '../lib/case-education';
import { assessPayment, assessTranscript, levelFor } from '../lib/risk';
import type { AnalyticsEvent, Assessment, Payment, PublicState, Rail, Role, State } from '../lib/types';

export const DAY = 24 * 60 * 60 * 1000;
export const emptyState = (): State => ({
  call: { id: null, active: false, startedAt: null, transcript: [], assessment: assessTranscript(''), safeWord: 'unchecked', callback: null },
  payments: [], events: [], cases: [],
  settings: { coSignLimit: 1000, pendingLimit: null, retainFlaggedTranscripts: false, safeWordConfigured: false },
});

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
    for (const payment of this.state.payments) payment.summarySource ??= 'rules';
    for (const file of this.state.cases) {
      const payment = this.state.payments.find(p => p.id === file.paymentId);
      if (file.outcome === 'foiled' && payment?.status === 'denied' && !file.education) file.education = explainCase(file, payment);
    }
    // A server restart ends the live session; retained evidence remains available only with consent.
    this.state.call.active = false;
    this.state.settings.safeWordConfigured = !!this.get('safeWordHash');
    if (!this.get('sessionSecret')) this.set('sessionSecret', randomBytes(48).toString('hex'));
    this.tick();
  }
  get(key: string): string | undefined { return (this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined)?.value; }
  set(key: string, value: string) { this.db.prepare('INSERT INTO kv(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  save() {
    const persisted: State = structuredClone(this.state);
    if (!persisted.settings.retainFlaggedTranscripts || persisted.call.assessment.score < 30) persisted.call.transcript = [];
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
      state.payments = []; state.events = []; state.cases = [];
      state.call.transcript = []; state.call.assessment = assessTranscript(''); state.call.safeWord = 'unchecked';
      state.settings = emptyState().settings;
    }
    return { ...state, config };
  }
  startCall() {
    if (this.state.call.active) throw new Error('A call guard session is already running. End it before starting another.');
    this.segments.clear();
    this.state.call = { id: randomUUID(), active: true, startedAt: this.now(), transcript: [], assessment: assessTranscript(''), safeWord: 'unchecked', callback: null };
    this.event('Call guard started with consent', 0, 'call'); this.save();
  }
  addLine(text: string, source: string, callId?: string, segmentId?: string) {
    if (callId && callId !== this.state.call.id) throw new Error('This transcript belongs to an ended or different call.');
    if (!this.state.call.active) throw new Error('Start the call guard first.');
    if (segmentId && this.segments.has(segmentId)) {
      if (this.segments.get(segmentId) !== text) throw new Error('This transcript segment has already been submitted with different text.');
      return null;
    }
    if (segmentId) {
      if (this.segments.size >= 10000) throw new Error('This session has reached its transcript limit. Start a new call guard session.');
      this.segments.set(segmentId, text);
    }
    this.state.call.transcript.push({ id: randomUUID(), text, source, at: this.now() });
    this.state.call.transcript = this.state.call.transcript.slice(-100);
    const next = assessTranscript(this.state.call.transcript.map(l => l.text).join(' '), this.state.call.safeWord === 'failed', this.state.call.callback?.answer === 'no');
    // During a session, evidence is sticky; later benign text cannot erase a warning.
    if (next.score >= this.state.call.assessment.score) this.state.call.assessment = next;
    this.event('Call analyzed · ' + this.state.call.assessment.scamType, this.state.call.assessment.score, 'call'); this.save();
    return this.state.call.id;
  }
  enrichCall(id: string, assessment: Assessment) {
    if (this.state.call.id !== id || !this.state.call.active) return;
    const existing = this.state.call.assessment;
    const score = Math.max(existing.score, assessment.score);
    this.state.call.assessment = {
      ...existing, ...(assessment.score >= existing.score ? assessment : {}),
      score, level: levelFor(score), source: 'gemini',
      tells: [...new Map([...existing.tells, ...assessment.tells].map(t => [t.id, t])).values()],
    };
    this.event('Gemini analyzed the conversation', score, 'call'); this.save();
  }

  endCall() {
    this.state.call.active = false;
    if (!this.state.settings.retainFlaggedTranscripts || this.state.call.assessment.score < 30) this.state.call.transcript = [];
    this.event('Call guard stopped · hang up on your phone', this.state.call.assessment.score, 'call'); this.save();
  }
  async setSafeWord(word: string) {
    const hash = await bcrypt.hash(word.trim().toLocaleLowerCase('en-US'), 12);
    this.set('safeWordHash', hash); this.state.settings.safeWordConfigured = true; this.save();
  }
  async verifyWord(word: string) {
    const hash = this.get('safeWordHash'); if (!hash) throw new Error('Set your family safe word first.');
    if (!this.state.call.active) throw new Error('Start a call guard session first.');
    const callId = this.state.call.id;
    const matched = await bcrypt.compare(word.trim().toLocaleLowerCase('en-US'), hash);
    if (callId !== this.state.call.id || !this.state.call.active) throw new Error('This call has ended.');
    // A later guess must not erase a previously failed verification.
    if (!matched) this.state.call.safeWord = 'failed';
    else if (this.state.call.safeWord !== 'failed') this.state.call.safeWord = 'matched';
    if (!matched) {
      const next = assessTranscript(this.state.call.transcript.map(l => l.text).join(' '), true, this.state.call.callback?.answer === 'no');
      this.state.call.assessment = { ...next, score: Math.max(next.score, this.state.call.assessment.score), level: 'Critical' };
    }
    this.captureCaseChecks();
    this.event(matched ? 'Safe word matched · still verify independently' : 'Safe word failed · identity unverified', this.state.call.assessment.score, 'verification'); this.save();
    return matched;
  }
  requestCallback() {
    if (!this.state.call.active) throw new Error('Start a call guard session first.');
    const callback = this.state.call.callback;
    if (callback && !callback.answeredAt) return callback;
    this.state.call.callback = { id: randomUUID(), requestedAt: this.now(), answeredAt: null, answer: null };
    this.event('Callback sent to Alex’s paired view', this.state.call.assessment.score, 'verification'); this.save();
    return this.state.call.callback;
  }
  answerCallback(id: string, answer: 'yes' | 'no') {
    const callback = this.state.call.callback;
    if (!callback || callback.id !== id || callback.answeredAt) throw new Error('This callback is no longer awaiting a reply.');
    callback.answer = answer; callback.answeredAt = this.now();
    if (answer === 'no') this.state.call.assessment = assessTranscript(this.state.call.transcript.map(l => l.text).join(' '), this.state.call.safeWord === 'failed', true);
    this.captureCaseChecks();
    this.event(answer === 'no' ? 'Alex says: “That is not me calling.”' : 'Alex confirmed the call · verify the payment separately', this.state.call.assessment.score, 'verification'); this.save();
  }
  private captureCaseChecks() {
    for (const file of this.state.cases) {
      if (file.outcome !== 'open' || !file.evidence?.callId || file.evidence.callId !== this.state.call.id) continue;
      file.evidence.safeWordFailed ||= this.state.call.safeWord === 'failed';
      file.evidence.callbackDenied ||= this.state.call.callback?.answer === 'no';
      file.tells = [...new Set([...file.tells, ...this.state.call.assessment.tells.map(t => t.label)])];
    }
  }
  createPayment(input: { amount: number; payee: string; rail: Rail; newPayee: boolean; pasted?: boolean }) {
    this.tick();
    const assessment = assessPayment({ ...input, activeCall: this.state.call.active, callScore: this.state.call.assessment.score });
    const held = assessment.score >= 85 || input.amount > this.state.settings.coSignLimit;
    const status = held ? 'held' : assessment.score >= 30 ? 'review' : 'released';
    const reasons = [...assessment.reasons];
    if (input.amount > this.state.settings.coSignLimit) reasons.push('Above your family co-sign limit');
    const payment: Payment = {
      id: randomUUID(), ...input, status, score: assessment.score, reasons, createdAt: this.now(),
      releaseAt: held ? this.now() + DAY : null, resolvedAt: status === 'released' ? this.now() : null,
      summarySource: 'rules', summary: `${input.payee} · $${input.amount.toFixed(2)} by ${input.rail}. ${reasons.join('. ')}. ${held ? 'Held for a guardian decision or the 24-hour cooling-off period.' : status === 'review' ? 'A specific warning must be reviewed before continuing.' : 'No red flags found by the demo rules.'}`,
    };
    this.state.payments.unshift(payment);
    if (assessment.score >= 30 || held) this.state.cases.unshift({ id: randomUUID(), title: this.state.call.assessment.scamType === 'Unverified request' ? 'The Payment Check' : this.state.call.assessment.scamType, openedAt: this.now(), score: payment.score, tells: [...new Set([...this.state.call.assessment.tells.map(t => t.label), ...reasons])], paymentId: payment.id, outcome: 'open', evidence: { callId: this.state.call.id, safeWordFailed: this.state.call.safeWord === 'failed', callbackDenied: this.state.call.callback?.answer === 'no', held } });
    this.event(held ? 'Two-Key Rule · payment held' : status === 'review' ? 'Teller · review requested' : 'Routine payment completed', payment.score, 'payment'); this.save(); return payment;
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
    payment.summary = `${payment.payee} · $${payment.amount.toFixed(2)}. ${payment.reasons.join('. ')}. ${mustHold ? 'Updated risk check; payment held.' : 'User reviewed the warning.'}`;
    this.event(mustHold ? 'Updated risk check · payment held' : 'Warning reviewed · payment completed', payment.score, 'payment'); this.save(); return payment;
  }
  payment(id: string) { const payment = this.state.payments.find(p => p.id === id); if (!payment) throw new Error('Payment not found.'); return payment; }
  decidePayment(id: string, decision: 'approve' | 'deny') {
    this.tick(); const payment = this.payment(id);
    if (payment.status !== 'held' && payment.status !== 'review') throw new Error('This payment has already been resolved.');
    payment.status = decision === 'approve' ? 'released' : 'denied'; payment.resolvedAt = this.now();
    this.closeCase(id, decision === 'deny' ? 'foiled' : 'reviewed');
    const file = this.state.cases.find(c => c.paymentId === id);
    if (file && decision === 'deny') {
      // Only verification from the original call belongs in this case.
      if (file.evidence?.callId && file.evidence.callId === this.state.call.id) {
        file.evidence.safeWordFailed ||= this.state.call.safeWord === 'failed';
        file.evidence.callbackDenied ||= this.state.call.callback?.answer === 'no';
        file.tells = [...new Set([...file.tells, ...this.state.call.assessment.tells.map(t => t.label)])];
      }
      file.education = explainCase(file, payment);
    }
    this.event(decision === 'deny' ? 'HEIST FOILED · guardian denied payment' : 'Guardian approved payment', payment.score, 'payment'); this.save(); return payment;
  }
  closeCase(paymentId: string, outcome: 'foiled' | 'reviewed') { const file = this.state.cases.find(c => c.paymentId === paymentId); if (file) file.outcome = outcome; }
  updateSettings(input: { retainFlaggedTranscripts?: boolean; coSignLimit?: number }) {
    if (input.retainFlaggedTranscripts !== undefined) {
      this.state.settings.retainFlaggedTranscripts = input.retainFlaggedTranscripts;
      if (!input.retainFlaggedTranscripts && !this.state.call.active) this.state.call.transcript = [];
    }
    if (input.coSignLimit !== undefined && input.coSignLimit !== this.state.settings.coSignLimit) this.state.settings.pendingLimit = { value: input.coSignLimit, effectiveAt: this.now() + DAY };
    this.save();
  }
  tick() {
    let changed = false;
    for (const payment of this.state.payments) if (payment.status === 'held' && payment.releaseAt !== null && this.now() >= payment.releaseAt) {
      payment.status = 'released'; payment.resolvedAt = this.now(); this.closeCase(payment.id, 'reviewed');
      this.event('Cooling-off period complete · payment released', payment.score, 'payment'); changed = true;
    }
    const pending = this.state.settings.pendingLimit;
    if (pending && this.now() >= pending.effectiveAt) { this.state.settings.coSignLimit = pending.value; this.state.settings.pendingLimit = null; changed = true; }
    if (changed) this.save();
  }
  reset() { this.segments.clear(); this.set('analyticsStream', randomUUID()); this.state = emptyState(); this.state.settings.safeWordConfigured = !!this.get('safeWordHash'); this.save(); }
}
