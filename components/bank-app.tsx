'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Landmark, Mic, Send, ShieldCheck } from 'lucide-react';
import { billPayment, contacts, railLabels, rosa, scamPayment } from '@/lib/demo-data';
import { openingCue } from '@/lib/teller-config';
import { TellerSession, type Grant, type TellerStatus } from '@/lib/teller-session';
import type { DemoState, Language, Rail, RiskCheck } from '@/lib/types';
import { api, money, useDemo } from './use-demo';

const copy = {
  en: {
    balance: 'Available balance', send: 'Send money', to: 'To', amount: 'Amount', how: 'How', recent: 'Pay again',
    sendNow: (a: string) => `Send ${a}`, back: 'Back', teller: 'Tripwire · your bank’s safety teller',
    connecting: 'Connecting you to your bank’s safety teller…', listening: 'I’m listening', calling: (n: string) => `Calling ${n}…`,
    answered: (n: string) => `${n} answered`, unavailable: 'Your money is staying put while we check with your family.', hold: 'Hold to talk',
    safe: (a: string) => `Your ${a} is safe.`, sent: 'Sent.', home: 'Done', nextTime: 'Next time',
  },
  es: {
    balance: 'Saldo disponible', send: 'Enviar dinero', to: 'Para', amount: 'Monto', how: 'Cómo', recent: 'Pagar de nuevo',
    sendNow: (a: string) => `Enviar ${a}`, back: 'Atrás', teller: 'Tripwire · la cajera de seguridad de tu banco',
    connecting: 'Conectándote con la cajera de seguridad de tu banco…', listening: 'Te escucho', calling: (n: string) => `Llamando a ${n}…`,
    answered: (n: string) => `${n} contestó`, unavailable: 'Tu dinero se queda aquí mientras hablamos con tu familia.', hold: 'Mantén presionado para hablar',
    safe: (a: string) => `Tus ${a} están a salvo.`, sent: 'Enviado.', home: 'Listo', nextTime: 'La próxima vez',
  },
};

type Prefetch = { key: string; at: number; check: RiskCheck; grant?: Grant; error?: string };

export function BankApp() {
  const { state, online } = useDemo();
  const [payee, setPayee] = useState(scamPayment.payee);
  const [amount, setAmount] = useState(String(scamPayment.amount));
  const [rail, setRail] = useState<Rail>(scamPayment.rail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const teller = useTeller(state);
  const prefetch = useRef<Prefetch | null>(null);
  const language: Language = state?.language || 'en';
  const t = copy[language];
  const phase = state?.phase || 'home';
  const key = `${payee.trim().toLowerCase()}|${amount}|${rail}|${state?.pushToTalk}|${language}`;

  // Preconnect: while the Send screen is showing, run the risk check and mint
  // the teller's token so the session opens the moment Rosa taps Send.
  useEffect(() => {
    if (phase !== 'send' || !(Number(amount) > 0) || !payee.trim()) return;
    const timer = setTimeout(() => {
      void api<{ check: RiskCheck; error?: string } & Partial<Grant>>('/token', { payee, amount: Number(amount), rail, pushToTalk: !!state?.pushToTalk })
        .then(r => { prefetch.current = { key, at: Date.now(), check: r.check, error: r.error, grant: r.token ? { token: r.token, model: r.model!, config: r.config! } : undefined }; })
        .catch(() => { prefetch.current = null; });
    }, 350);
    return () => clearTimeout(timer);
  }, [phase, key, payee, amount, rail, state?.pushToTalk]);

  // RESET from the operator returns here; drop any live session.
  const stopTeller = teller.stop;
  useEffect(() => { if (phase === 'home') stopTeller(); }, [phase, stopTeller]);

  async function sendNow() {
    setBusy(true); setError('');
    try {
      const value = Number(amount);
      // Start audio inside the tap so the browser allows the teller's voice.
      const ready = teller.prepare();
      let pre = prefetch.current;
      // Single-use tokens can start a session for 2 minutes; refresh older ones.
      if (!pre || pre.key !== key || Date.now() - pre.at > 90_000) {
        const r = await api<{ check: RiskCheck; error?: string } & Partial<Grant>>('/token', { payee, amount: value, rail, pushToTalk: !!state?.pushToTalk });
        pre = { key, at: Date.now(), check: r.check, error: r.error, grant: r.token ? { token: r.token, model: r.model!, config: r.config! } : undefined };
      }
      prefetch.current = null;
      await api('/send', { payee, amount: value, rail });
      if (pre.check.trigger) await teller.start(ready, pre.grant, pre.error, language, !!state?.pushToTalk);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const go = (next: 'home' | 'send') => void api('/phase', { phase: next }).catch(e => setError(e.message));

  if (!state) return <div className="phone"><div className="screen center"><p className="muted">{online ? '' : 'Connecting…'}</p></div></div>;
  return <div className="phone" data-phase={phase} lang={language}>
    {phase === 'home' && <section className="screen home">
      <header className="bank-head"><Landmark size={28} aria-hidden/><strong>My Bank</strong><span>{rosa.account}</span></header>
      <h1 className="hello">{language === 'es' ? `Hola, ${rosa.name}.` : `Hello, ${rosa.name}.`}</h1>
      <div className="balance"><span>{t.balance}</span><strong>{money(rosa.balance)}</strong></div>
      <button className="big primary" onClick={() => go('send')}><Send size={26} aria-hidden/>{t.send}</button>
    </section>}

    {phase === 'send' && <section className="screen send">
      <header className="bank-head"><button className="icon" aria-label={t.back} onClick={() => go('home')}><ArrowLeft size={26}/></button><strong>{t.send}</strong><span/></header>
      <form onSubmit={e => { e.preventDefault(); void sendNow(); }}>
        <label>{t.to}<input value={payee} onChange={e => setPayee(e.target.value)} maxLength={80} required autoComplete="off"/></label>
        <label>{t.amount}<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" type="number" min="0.01" max="100000" step="0.01" required/></label>
        <label>{t.how}<select value={rail} onChange={e => setRail(e.target.value as Rail)}>{Object.entries(railLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <div className="chips" aria-label={t.recent}><span>{t.recent}</span>
          <button type="button" onClick={() => { setPayee(billPayment.payee); setAmount(String(billPayment.amount)); setRail(billPayment.rail); }}>{billPayment.payee} · {money(billPayment.amount)}</button>
          <button type="button" onClick={() => { setPayee(`${contacts.diego.name} Garcia`); setAmount('50'); setRail('instant'); }}>{contacts.diego.name} · $50</button>
        </div>
        <button className="big primary" disabled={busy}><Send size={26} aria-hidden/>{t.sendNow(money(Number(amount) || 0))}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </section>}

    {phase === 'tripwire' && <TellerScreen state={state} teller={teller} t={t}/>}
    {phase === 'outcome' && <Outcome state={state} t={t} onDone={() => { void teller.endQuietly().then(() => go('home')); }}/>}
  </div>;
}

function TellerScreen({ state, teller, t }: { state: DemoState; teller: ReturnType<typeof useTeller>; t: typeof copy.en }) {
  const orb = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => { orb.current?.style.setProperty('--level', String(teller.level())); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [teller]);
  const ring = state.ring?.agent === 'verifier' ? state.ring : null;
  const status = state.result ? t.answered(contacts.diego.name)
    : ring && ring.status !== 'ended' ? t.calling(contacts.diego.name)
    : teller.status === 'failed' ? t.unavailable
    : teller.status === 'live' ? t.listening : t.connecting;
  return <section className="screen teller" aria-live="polite">
    <p className="teller-label"><ShieldCheck size={20} aria-hidden/>{t.teller}</p>
    <div ref={orb} className={'orb' + (ring && !state.result ? ' waiting' : '')} aria-hidden><span/></div>
    <div className="captions">{teller.lines.slice(-2).map((line, i) => <p key={line.id} className={line.who + (i === 0 && teller.lines.length > 1 ? ' older' : '')}>{line.text}</p>)}</div>
    <p className="status">{status}</p>
    {state.pushToTalk && <button className="big talk" onPointerDown={() => teller.hold(true)} onPointerUp={() => teller.hold(false)} onPointerLeave={() => teller.hold(false)}><Mic size={26} aria-hidden/>{t.hold}</button>}
  </section>;
}

function Outcome({ state, t, onDone }: { state: DemoState; t: typeof copy.en; onDone: () => void }) {
  const check = state.check; const file = state.caseFile; const es = state.language === 'es';
  const held = state.decision?.decision === 'hold';
  if (!check) return null;
  if (!held) return <section className="screen outcome sent">
    <ShieldCheck size={56} aria-hidden/><h1>{t.sent}</h1>
    <p className="big-line">{money(check.amount)} → {check.payee}</p>
    <p className="muted">{state.result?.status === 'confirmed' ? (es ? `${contacts.diego.name} confirmó que era él.` : `${contacts.diego.name} confirmed it was him.`) : (es ? 'No encontramos señales de alerta.' : 'No red flags found.')}</p>
    <button className="big" onClick={onDone}>{t.home}</button>
  </section>;
  const lines = [
    es ? `Se hicieron pasar por ${contacts.diego.name}.` : `They pretended to be ${contacts.diego.name}.`,
    ...(file?.pressure.length || !file ? [es ? 'Dijeron que era urgente.' : 'They said it was urgent.'] : []),
    ...(file?.cover || !file ? [es ? 'Te pidieron que lo guardaras en secreto.' : 'They asked you to keep it secret.'] : []),
  ];
  return <section className="screen outcome safe">
    <div className="safe-mark" aria-hidden><ShieldCheck size={56}/></div>
    <h1>{t.safe(money(check.amount))}</h1>
    <ul className="plain">{lines.map(line => <li key={line}>{line}</li>)}</ul>
    <p className="tip"><strong>{t.nextTime}:</strong> {tipText(file?.tip) || (es ? `cuelga y llama tú a ${contacts.diego.name}.` : `hang up and call ${contacts.diego.name} yourself.`)}</p>
    <p className="muted">{es ? 'No hiciste nada malo. Estas personas son profesionales.' : 'You did nothing wrong. These callers are professionals.'}</p>
    <button className="big" onClick={onDone}>{t.home}</button>
  </section>;
}

/** The label already says "Next time", so drop it from the model's tip. */
function tipText(tip?: string) {
  const text = tip || ''; const stripped = text.replace(/^(next time|la pr[oó]xima vez)[,:]?\s*/i, '');
  return stripped === text ? text : stripped && stripped[0].toLowerCase() + stripped.slice(1);
}

/** Drain speech already playing; a silent teller does not need another reassurance turn. */
async function finishSpeaking(player: { speaking: boolean }, max: number) {
  const start = Date.now();
  while (player.speaking && Date.now() - start < max) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

type Line = { id: number; who: 'rosa' | 'teller'; text: string; done: boolean };
/**
 * Owns the Gemini Live teller session for one payment, runs its three tools,
 * and delivers Diego's verification result back into the same session.
 */
function useTeller(state: DemoState | null) {
  const session = useRef<TellerSession | null>(null);
  const pending = useRef<{ id: string } | null>(null);
  const delivered = useRef<number | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextId = useRef(0);
  const [status, setStatus] = useState<TellerStatus | 'idle'>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const stateRef = useRef(state); stateRef.current = state;

  const stop = useCallback(() => {
    clearTimeout(fallback.current);
    session.current?.stop(); session.current = null; pending.current = null; delivered.current = null;
    setStatus('idle'); setLines([]);
  }, []);
  useEffect(() => stop, [stop]);

  /** Rules fallback: if Gemini can't finish the job, the result still decides it. */
  const decideByRules = useCallback(async () => {
    const s = stateRef.current; if (!s || s.decision || !s.check) return;
    const status = s.result?.status;
    await api('/decision', { decision: status === 'confirmed' ? 'release' : 'hold', reason: status ? `Verification result: ${status}` : 'Teller unavailable', source: 'rules' }).catch(() => {});
    await api('/finish', { source: 'rules', rosa_said: session.current?.rosaSaid() || '' }).catch(() => {});
  }, []);

  const prepare = useCallback(() => {
    stop();
    const teller = new TellerSession({
      grant: async () => {
        const s = stateRef.current!; const c = s.check!;
        const r = await api<Partial<Grant> & { error?: string }>('/token', { payee: c.payee, amount: c.amount, rail: c.rail, pushToTalk: s.pushToTalk });
        if (!r.token) throw new Error(r.error || 'No token');
        return { token: r.token, model: r.model!, config: r.config! };
      },
      tool: async (name, args, id) => {
        if (name === 'call_trusted_contact') {
          // Turn-taking: let the teller finish "Calling him now…" before Diego's phone rings.
          pending.current = { id };
          await finishSpeaking(teller.player, 6000);
          if (session.current !== teller || stateRef.current?.phase !== 'tripwire') return { status: 'no_answer', note: 'The payment session ended.' };
          try { await api('/ring', args); return null; }
          catch (e) { pending.current = null; return { status: 'no_answer', note: (e as Error).message }; }
        }
        if (name === 'decide_payment') { await api('/decision', { ...args, source: 'gemini' }).catch(() => {}); return { ok: true }; }
        if (name === 'finish') {
          await api('/finish', { ...args, source: 'gemini' }).catch(() => {});
          clearTimeout(fallback.current);
          // The teller often speaks the good news right after finish: wait for that line
          // to start and play out completely before hanging up.
          void teller.endGracefully({ waitForSpeech: true, max: 30000 }).then(() => { if (session.current === teller) setStatus('closed'); });
          return { ok: true };
        }
        return { error: `Unknown tool ${name}` };
      },
      caption: (who, text, done) => {
        // Finished lines go to the family dashboard; partial lines stay on Rosa's screen.
        if (done) void api('/caption', { who, text }).catch(() => {});
        setLines(prev => {
        const last = prev.at(-1);
        if (last && last.who === who && !last.done) return [...prev.slice(0, -1), { ...last, text, done }];
        if (done && last?.who === who && last.text === text) return prev;
        return [...prev.slice(-5), { id: nextId.current++, who, text, done }];
        });
      },
      status: (next) => {
        setStatus(next);
        if (next === 'failed' && stateRef.current?.result) void decideByRules();
      },
    });
    session.current = teller;
    // Resume the audio context synchronously inside the tap.
    void teller.player.resume();
    return teller;
  }, [stop, decideByRules]);

  const start = useCallback(async (teller: TellerSession, grant: Grant | undefined, error: string | undefined, language: Language, pushToTalk: boolean) => {
    teller.pushToTalk = pushToTalk;
    if (!grant) { setStatus('failed'); console.warn('Teller unavailable:', error); return; }
    try { await teller.start(grant, openingCue(language)); }
    catch (e) { console.warn('Teller failed to start', e); setStatus('failed'); }
  }, []);

  // Diego's call uses the same laptop mic and speaker in the one-page demo: the teller
  // stops listening while it's on, and only speaks the result once the call hangs up.
  const diegoOnCall = state?.ring?.who === 'diego' && state.ring.status !== 'ended';
  useEffect(() => { if (session.current) session.current.muted = !!diegoOnCall; }, [diegoOnCall]);
  const [, setTick] = useState(0);

  // Diego's answer (or the operator's FORCE RESULT) goes back into the live session.
  const result = state?.result;
  useEffect(() => {
    if (!result || delivered.current === result.at || state?.phase !== 'tripwire') return;
    // The verifier reports mid-call, then says goodbye. Wait for it to hang up (at most 8 s)
    // so the teller's good news never talks over Diego's call.
    const waited = Date.now() - result.at;
    // Only when the verifier actually got through; a forced result (backup) is delivered at once.
    const verifierTalking = state?.ring?.who === 'diego' && state.ring.status === 'answered' && result.source === 'verifier';
    if (verifierTalking && waited < 8000) { const t = setTimeout(() => setTick(n => n + 1), Math.min(100, 8000 - waited)); return () => clearTimeout(t); }
    delivered.current = result.at;
    if (session.current) session.current.muted = false;
    const teller = session.current;
    const payload = { status: result.status, note: result.note };
    let sent = false;
    if (teller?.live && pending.current) { sent = teller.respond(pending.current.id, 'call_trusted_contact', payload); pending.current = null; }
    else if (teller?.live) sent = teller.cue(`[Result from calling ${contacts.diego.name} on his saved number: ${result.status}. ${result.note}]`);
    clearTimeout(fallback.current);
    // If the teller doesn't decide within 12 s (or isn't connected), the result decides.
    fallback.current = setTimeout(() => void decideByRules(), sent ? 12000 : 1500);
  });

  /** Done on the outcome screen: let a sentence in progress finish, then close. */
  const endQuietly = useCallback(async () => { const t = session.current; if (t) await t.endGracefully({ max: 6000 }); stop(); }, [stop]);
  return {
    prepare, start, stop, endQuietly, status, lines,
    level: () => session.current?.level() ?? 0,
    hold: (down: boolean) => session.current?.holdToTalk(down),
  };
}
