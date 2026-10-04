import { randomUUID } from 'node:crypto';
import { contacts, railLabels, rosa, scamPayment } from '../lib/demo-data';
import type { AgentKind, CaseFile, ContactId, Decision, DemoState, Language, RiskCheck, Ring, VerifyStatus, Who } from '../lib/types';

const money = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
export type FinishInput = { job_name: string; impersonated: string; pressure_quotes: string[]; cover_quote: string; getaway: string; foiled_by: string; tip: string };

/**
 * One demo session in memory. Every page (bank app, both phones, operator,
 * case file) reads it over SSE; every change bumps the snapshot.
 */
export class Demo {
  state: DemoState;
  private caseNumber = 0;
  private cases = new Map<string, CaseFile>();
  onChange: () => void = () => {};
  constructor(config: DemoState['config'], private now: () => number = Date.now) {
    this.state = this.fresh(config, 'en', false, false);
  }
  private fresh(config: DemoState['config'], language: Language, coach: boolean, pushToTalk: boolean): DemoState {
    return { phase: 'home', language, coach, pushToTalk, check: null, sentAt: null, ring: null, result: null, decision: null, caseFile: null, log: [], config };
  }
  private log(text: string) {
    this.state.log = [...this.state.log, { at: this.now(), text }].slice(-60);
  }
  private changed(text?: string) { if (text) this.log(text); this.onChange(); }
  snapshot(): DemoState { return structuredClone(this.state); }
  getCase(id: string) { return id === 'latest' ? this.state.caseFile ?? [...this.cases.values()].at(-1) ?? null : this.cases.get(id) ?? null; }
  setCaseNumberBase(n: number) { this.caseNumber = Math.max(this.caseNumber, n); }

  reset() {
    const { config, language, coach, pushToTalk } = this.state;
    this.state = this.fresh(config, language, coach, pushToTalk);
    this.changed('RESET · ready for the next Grandma');
  }
  setLanguage(language: Language) { this.state.language = language; this.changed(`Language → ${language.toUpperCase()}`); }
  setCoach(coach: boolean) { this.state.coach = coach; this.changed(`Scammer coach mode ${coach ? 'ON' : 'OFF'}`); }
  setPushToTalk(on: boolean) { this.state.pushToTalk = on; this.changed(`Push-to-talk ${on ? 'ON' : 'OFF'}`); }
  setPhase(phase: 'home' | 'send') { if (this.state.phase === 'tripwire') return; this.state.phase = phase; this.changed(); }

  // ---- Phones ----
  ring(who: Who, agent: AgentKind, variables: Record<string, string>) {
    const callerName = who === 'rosa' ? 'Diego' : 'Tripwire · Rosa’s bank';
    this.state.ring = { id: randomUUID(), who, agent, callerName, variables, status: 'ringing', at: this.now() };
    this.changed(`RING ${who}'s phone · ${agent}`);
    return this.state.ring;
  }
  scamCall() {
    // The scammer agent takes no variables; coach mode is a per-session prompt override.
    return this.ring('rosa', 'scammer', this.state.coach ? { coach: 'on' } : {});
  }
  callContact(contact: ContactId, claimSummary: string) {
    if (contact !== 'diego') { this.log(`call_trusted_contact(${contact}) · only Diego's phone is set up for the demo; ringing Diego`); }
    const amount = this.state.check ? money(this.state.check.amount) : money(scamPayment.amount);
    return this.ring('diego', 'verifier', { grandma_name: rosa.name, contact_name: contacts.diego.name, amount, claim_summary: claimSummary.slice(0, 200) || 'you were in trouble and needed money' });
  }
  ringStatus(id: string, status: Ring['status']) {
    const ring = this.state.ring;
    if (!ring || ring.id !== id || ring.status === 'ended') return ring;
    ring.status = status; this.changed(`${ring.who}'s phone · ${status}`);
    return ring;
  }

  // ---- Rosa's payment ----
  sent(check: RiskCheck) {
    this.state.check = check; this.state.sentAt = this.now(); this.state.result = null; this.state.decision = null; this.state.caseFile = null;
    this.state.phase = check.trigger ? 'tripwire' : 'outcome';
    if (!check.trigger) this.state.decision = { decision: 'release', reason: 'Ordinary payment', at: this.now(), source: 'rules' };
    this.changed(`SEND ${money(check.amount)} → ${check.payee} · ${check.multiple}x typical ($${check.typical}) · ${check.isNewPayee ? 'new payee' : 'known payee'} · ${check.trigger ? 'TRIPWIRE' : 'sent'} [${check.source}]`);
  }
  result(status: VerifyStatus, note: string, source: 'verifier' | 'operator') {
    this.state.result = { status, note: note.slice(0, 300), at: this.now(), source };
    this.changed(`RESULT ${status}${note ? ` · "${note.slice(0, 80)}"` : ''} (${source})`);
    return this.state.result;
  }
  decide(decision: Decision, reason: string, source: 'gemini' | 'rules') {
    if (this.state.decision) return this.state.decision;
    this.state.decision = { decision, reason: reason.slice(0, 300), at: this.now(), source };
    this.changed(`decide_payment ${decision.toUpperCase()} · ${reason.slice(0, 80)} (${source})`);
    return this.state.decision;
  }
  /** The model writes the file; quotes are trimmed, never invented here. */
  finish(input: FinishInput, source: 'gemini' | 'rules') {
    if (this.state.caseFile) return this.state.caseFile;
    const check = this.state.check;
    if (!check) throw new Error('No payment in progress.');
    const decision = this.state.decision ?? this.decide(this.state.result?.status === 'confirmed' ? 'release' : 'hold', 'Recorded at finish', source);
    const file: CaseFile = {
      id: randomUUID().slice(0, 8), number: ++this.caseNumber, at: this.now(), language: this.state.language,
      jobName: clean(input.job_name, 40) || 'The Payment Job', mark: `${rosa.name}, ${rosa.age}`,
      impersonated: clean(input.impersonated, 80) || 'someone she trusts',
      pressure: input.pressure_quotes.map(q => clean(q, 60)).filter(Boolean).slice(0, 4),
      cover: clean(input.cover_quote, 80),
      getaway: clean(input.getaway, 120) || `${money(check.amount)} ${railLabels[check.rail].toLowerCase()} to ${check.payee}`,
      foiledBy: clean(input.foiled_by, 120), tip: clean(input.tip, 140),
      outcome: decision.decision === 'hold' ? 'foiled' : 'released', amount: check.amount, payee: check.payee, multiple: check.multiple,
      secondsToStop: Math.max(1, Math.round((decision.at - (this.state.sentAt ?? decision.at)) / 1000)),
      writtenBy: source, stored: 'memory', resultSource: this.state.result?.source ?? null,
    };
    this.cases.set(file.id, file); this.state.caseFile = file; this.state.phase = 'outcome';
    this.changed(`finish · FILE ${String(file.number).padStart(3, '0')} // ${file.jobName.toUpperCase()} (${source})`);
    return file;
  }
  markStored(id: string) { const file = this.cases.get(id); if (file) { file.stored = 'tiger'; if (this.state.caseFile?.id === id) this.state.caseFile.stored = 'tiger'; this.changed(); } }
}

/** Case-file text is model output shown to the family: strip control characters and cap length. */
function clean(text: string | undefined, max: number) { return (text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

/**
 * Deterministic case file when Gemini can't write one (session dropped, or
 * the operator forced a result). Quotes come only from Rosa's own captions.
 */
export function fallbackFinish(rosaSaid: string, check: RiskCheck, status: VerifyStatus | undefined, language: Language): FinishInput {
  const said = rosaSaid.toLowerCase();
  const pressure = [/arrest\w*/, /jail|c[aá]rcel/, /bail|fianza/, /today|right now|hoy|ahora/, /accident|accidente/, /urgent\w*|hurry|ap[uú]rate/].flatMap(re => { const m = said.match(re); return m ? [m[0]] : []; });
  const cover = said.match(/(?:don'?t|do not|not to) tell [a-z]+|no le (?:digas|cuentes)[a-z ]{0,12}/)?.[0] || '';
  const es = language === 'es';
  return {
    job_name: pressure.some(p => /bail|fianza|jail|c[aá]rcel|arrest/.test(p)) ? (es ? 'El golpe de la fianza' : 'The Bail Job') : (es ? 'El golpe urgente' : 'The Rush Job'),
    impersonated: es ? `alguien haciéndose pasar por su nieto ${contacts.diego.name}` : `someone posing as her grandson ${contacts.diego.name}`,
    pressure_quotes: pressure.slice(0, 3), cover_quote: cover,
    getaway: `${money(check.amount)} ${railLabels[check.rail].toLowerCase()} to ${check.payee}${check.isNewPayee ? ' (new payee' : ' ('}${check.multiple ? `, ${check.multiple}x her usual)` : ')'}`,
    foiled_by: status === 'confirmed' ? (es ? `${contacts.diego.name} confirmó que era él` : `${contacts.diego.name} confirmed it was really him`) : (es ? `Tripwire llamó al verdadero ${contacts.diego.name} a su número guardado` : `Tripwire called the real ${contacts.diego.name} on his saved number`),
    tip: es ? `La próxima vez, cuelga y llama tú a ${contacts.diego.name}.` : `Next time, hang up and call ${contacts.diego.name} yourself.`,
  };
}
