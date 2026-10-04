'use client';
import { useEffect, useRef, useState } from 'react';
import { CreditCard, KeyRound, Landmark, LockKeyhole, Phone, PhoneIncoming, PhoneOff, ShieldCheck } from 'lucide-react';
import { scenarios } from '@/lib/scenarios';
import type { Payment, Rail } from '@/lib/types';
import { useCallEngine, type CallerSource } from './call-engine';
import { HeistFoiled } from './heist';
import { Presenter } from './presenter';
import { useTripwire } from './context';
import { Countdown, money } from './ui';

const t = {
  en: { hello: 'Hello, Rosa.', calm: 'Tripwire is on. Nothing needs your attention.', bank: 'Open my bank app', incoming: 'Incoming call', unknown: 'Unknown caller', answer: 'Answer', decline: 'Decline', listening: 'Tripwire is listening to the caller with your permission.', asked: 'I asked', hang: 'Hang up', back: 'Back to the call', send: 'Send money', paused: 'Paused.', asking: 'We’ve asked Diego.', waiting: 'Waiting for Diego…', foiled: 'Your money hasn’t moved.', sent: 'Sent.', noFlags: 'No red flags found.' },
  es: { hello: 'Hola, Rosa.', calm: 'Tripwire está activo. Nada necesita tu atención.', bank: 'Abrir mi banco', incoming: 'Llamada entrante', unknown: 'Número desconocido', answer: 'Contestar', decline: 'Rechazar', listening: 'Tripwire escucha a quien llama, con tu permiso.', asked: 'Ya le pregunté', hang: 'Colgar', back: 'Volver a la llamada', send: 'Enviar dinero', paused: 'En pausa.', asking: 'Le preguntamos a Diego.', waiting: 'Esperando a Diego…', foiled: 'Tu dinero no se ha movido.', sent: 'Enviado.', noFlags: 'No encontramos señales de alerta.' },
};
const railNames: Record<Rail, string> = { bill: 'Pay a bill', bank: 'Bank transfer', 'gift-card': 'Gift cards', wire: 'Wire transfer', crypto: 'Cryptocurrency' };

export function Protected() {
  const { state, request, setError } = useTripwire(); const s = state!;
  const copy = t[s.settings.language];
  const engine = useCallEngine(state, request, setError);
  const [screen, setScreen] = useState<'home' | 'ringing' | 'call' | 'teller'>('home');
  const [ringSource, setRingSource] = useState<CallerSource>(s.config.agent ? 'agent' : 'script');
  const [busy, setBusy] = useState(false);
  const [payee, setPayee] = useState('Grandson bail · gift cards'); const [amount, setAmount] = useState('2500'); const [rail, setRail] = useState<Rail>('gift-card'); const [newPayee, setNewPayee] = useState(true);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const call = s.call; const active = call.active;
  const payment = s.payments.find(p => p.id === paymentId);
  const whisper = call.whispers.at(-1);
  async function run(action: () => Promise<void>) { setBusy(true); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }

  // Return home only when a live call ends, not while a new one is still connecting.
  const wasActive = useRef(active);
  useEffect(() => { if (wasActive.current && !active) setScreen(current => current === 'call' ? 'home' : current); wasActive.current = active; }, [active]);
  useResolutionVoice(s.call.speech, s.config.elevenlabs);

  async function answer() { setScreen('call'); await engine.start(ringSource); }
  async function sendPayment() {
    const created = await request<Payment>('/payments', { payee, amount: Number(amount), rail, newPayee });
    setPaymentId(created.id); if (active) engine.paymentAttempt(created);
  }
  function preset(normal: boolean) { setPayee(normal ? 'CPS Energy bill' : 'Grandson bail · gift cards'); setAmount(normal ? '40' : '2500'); setRail(normal ? 'bill' : 'gift-card'); setNewPayee(!normal); setPaymentId(null); setScreen('teller'); }

  return <div className={'rosa-phone' + (call.foiledAt ? ' is-foiled' : '')} data-screen={screen}>
    <HeistFoiled at={call.foiledAt}/>
    {active && screen === 'teller' && <button className="call-pill" onClick={() => setScreen('call')}><Phone size={22}/>{copy.back}</button>}

    {screen === 'home' && <section className="rosa-screen rosa-home">
      <h1>{copy.hello}</h1><p className="rosa-calm"><ShieldCheck size={30}/>{copy.calm}</p>
      <button className="rosa-big secondary" onClick={() => setScreen('teller')}><Landmark size={34}/>{copy.bank}</button>
    </section>}

    {screen === 'ringing' && <section className="rosa-screen rosa-ringing" aria-live="assertive">
      <PhoneIncoming size={64} className="ring-icon"/><p className="rosa-label">{copy.incoming}</p><h1>{copy.unknown}</h1><p className="rosa-sub">(210) 555-0147</p>
      <div className="ring-actions"><button className="rosa-round decline" aria-label={copy.decline} onClick={() => setScreen('home')}><PhoneOff size={34}/></button><button className="rosa-round accept" disabled={busy} onClick={() => void run(answer)}><Phone size={34}/><span>{copy.answer}</span></button></div>
      <p className="rosa-consent">{copy.listening}</p>
    </section>}

    {screen === 'call' && <section className="rosa-screen rosa-call">
      <p className="rosa-label">{active ? <CallTimer since={call.startedAt}/> : 'Connecting…'}</p><h1>{copy.unknown}</h1>
      <p className="rosa-listening"><span className="live-dot"/>{engine.guardStatus === 'live' ? 'Gemini Live' : engine.guardStatus === 'connecting' || engine.guardStatus === 'reconnecting' ? 'Connecting…' : 'Tripwire rules'} · {copy.listening}</p>
      {whisper && <div key={whisper.id} className={'whisper' + (whisper.kind === 'family-word' ? ' family' : '')} role="status">
        {whisper.kind === 'family-word' && <KeyRound size={28}/>}<p>{whisper.text}</p>
        {whisper.kind === 'family-word' && call.safeWord === 'unchecked' && <button className="rosa-big" disabled={busy} onClick={() => void run(engine.askedFamilyWord)}>{copy.asked}</button>}
        {whisper.kind === 'family-word' && call.safeWord === 'asked' && <p className="whisper-sub">Listening for the answer…</p>}
        {call.safeWord === 'failed' && <p className="whisper-sub red">That wasn’t your family word. Please don’t send money.</p>}
        {call.safeWord === 'matched' && <p className="whisper-sub">The word matched. Still check any money request.</p>}
      </div>}
      {whisper?.kind === 'family-word' && call.safeWord === 'asked' && !s.config.gemini && <form className="typed-word" onSubmit={e => { e.preventDefault(); void run(async () => { await request('/safe-word/verify', { word: typed }); setTyped(''); }); }}><label>What did they say?<input type="password" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off"/></label><button className="rosa-big secondary" disabled={busy}>Check</button></form>}
      <div className="rosa-call-actions"><button className="rosa-big secondary" onClick={() => setScreen('teller')}><Landmark size={30}/>{copy.bank}</button><button className="rosa-big hangup" disabled={busy} onClick={() => void run(async () => { await engine.hangUp(); setScreen('home'); })}><PhoneOff size={30}/>{copy.hang}</button></div>
    </section>}

    {screen === 'teller' && <section className="rosa-screen teller">
      <header className="teller-head"><Landmark size={28}/><strong>My Bank</strong><span>Checking ···4417</span></header>
      {!payment ? <form onSubmit={e => { e.preventDefault(); void run(sendPayment); }}>
        <h1>{copy.send}</h1>
        <label>To<input value={payee} onChange={e => setPayee(e.target.value)} required maxLength={100}/></label>
        <label>Amount ($)<input inputMode="decimal" type="number" min="0.01" max="100000" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required/></label>
        <label>How<select value={rail} onChange={e => setRail(e.target.value as Rail)}>{Object.entries(railNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="teller-check"><input type="checkbox" checked={newPayee} onChange={e => setNewPayee(e.target.checked)}/>First time paying them</label>
        <button className="rosa-big" disabled={busy}><CreditCard size={28}/>{busy ? '…' : `${copy.send} ${amount ? money(Number(amount)) : ''}`}</button>
      </form> : <PaymentResult payment={payment} copy={copy} onNew={() => setPaymentId(null)}/>}
    </section>}

    {call.speech && <p className="subtitle" lang={call.speech.language}>{call.speech.text}</p>}

    <Presenter>
      <label className="field-label">Caller channel<select value={ringSource} onChange={e => setRingSource(e.target.value as CallerSource)}>
        <option value="agent" disabled={!s.config.agent}>ElevenLabs scammer agent (full arc){!s.config.agent ? ' · not configured' : ''}</option>
        <option value="agent-short" disabled={!s.config.agent}>ElevenLabs scammer agent (short arc)</option>
        <option value="mic">Operator microphone (live fallback)</option>
        <option value="script">Typed lines (no audio)</option>
      </select></label>
      <button className="button primary large" disabled={active} onClick={() => setScreen('ringing')}><PhoneIncoming size={20}/>Ring Rosa’s phone</button>
      {engine.source === 'script' && <><label className="field-label">Script<select value={engine.scriptKey} onChange={e => engine.setScriptKey(e.target.value as keyof typeof scenarios)}>{Object.entries(scenarios).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}</select></label>
        <button className="button secondary" disabled={engine.scriptIndex >= scenarios[engine.scriptKey].lines.length} onClick={engine.nextScripted}>Next caller line ({engine.scriptIndex}/{scenarios[engine.scriptKey].lines.length})</button></>}
      {engine.source?.startsWith('agent') && <p className="small-note">Scammer agent {engine.agentSpeaking ? 'speaking' : 'listening'} · consented clone, demo only.</p>}
      <div className="preset-row"><button onClick={() => preset(true)}>$40 bill</button><button onClick={() => preset(false)}>$2,500 gift cards</button></div>
      <label className="field-label">Rosa’s language<select value={s.settings.language} onChange={e => void request('/settings', { language: e.target.value })}><option value="en">English</option><option value="es">Español</option></select></label>
    </Presenter>
  </div>;
}

function PaymentResult({ payment, copy, onNew }: { payment: Payment; copy: typeof t.en; onNew: () => void }) {
  const { state, request, setError } = useTripwire(); const call = state!.call;
  const isolation = payment.evidence?.find(e => e.lever === 'isolation');
  const failedWord = call.id === payment.callId && call.safeWord === 'failed';
  const why = [isolation && 'The caller asked you to keep this secret from your family', failedWord && 'refused your family word'].filter(Boolean).join(' and ');
  if (payment.status === 'denied') return <div className="teller-result foiled"><LockKeyhole size={48}/><h1>{copy.foiled}</h1><p>Diego confirmed it wasn’t him. Nothing was sent.</p><p className="no-shame">You did nothing wrong. These callers are professionals.</p><button className="rosa-big secondary" onClick={onNew}>Done</button></div>;
  if (payment.status === 'released') return <div className="teller-result sent"><ShieldCheck size={48}/><h1>{copy.sent}</h1><p>{money(payment.amount)} to {payment.payee}.</p><p>{call.alert?.reply === 'release' && call.id === payment.callId ? 'Diego confirmed it’s him.' : copy.noFlags}</p><p className="small-note">Demo payment. No money moves.</p><button className="rosa-big secondary" onClick={onNew}>Done</button></div>;
  if (payment.status === 'review') return <div className="teller-result review"><h1>One quick check.</h1><ul>{payment.reasons.map(r => <li key={r}>{r}</li>)}</ul><h2>Did the caller ask you to keep this a secret?</h2><div className="rosa-call-actions"><button className="rosa-big" onClick={() => void request('/payments/review', { id: payment.id, secret: true }).catch(e => setError(e.message))}>Yes, they did</button><button className="rosa-big secondary" onClick={() => void request('/payments/review', { id: payment.id, secret: false }).catch(e => setError(e.message))}>No</button></div></div>;
  return <div className="teller-result held" aria-live="polite">
    <LockKeyhole size={48}/><h1>{copy.paused}</h1>
    <p className="held-why">{why ? `${why}.` : 'This payment matches warning signs from your call.'} {call.alert ? copy.asking : ''}</p>
    {payment.evidence?.length ? <ul className="held-quotes">{payment.evidence.slice(0, 3).map(e => <li key={e.lever}><q>{e.quote}</q></li>)}</ul> : <ul>{payment.reasons.slice(0, 3).map(r => <li key={r}>{r}</li>)}</ul>}
    {call.alert && !call.alert.reply && <p className="waiting"><span className="live-dot"/>{copy.waiting}</p>}
    {!call.alert && payment.releaseAt && <p className="small-note">Released automatically in <Countdown until={payment.releaseAt}/> unless your family stops it.</p>}
    <p className="no-shame">You did nothing wrong. These callers are professionals.</p>
  </div>;
}

function CallTimer({ since }: { since: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const s = Math.max(0, Math.floor((now - (since ?? now)) / 1000));
  return <>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</>;
}

/** Plays Tripwire's single resolution message: ElevenLabs stream, browser voice as fallback. */
function useResolutionVoice(speech: { id: string; text: string; language: 'en' | 'es' } | null, elevenlabs: boolean) {
  const played = useRef<string | null>(null);
  useEffect(() => {
    if (!speech || played.current === speech.id) return;
    played.current = speech.id;
    const browser = () => { if (!('speechSynthesis' in window)) return; const u = new SpeechSynthesisUtterance(speech.text); u.lang = speech.language === 'es' ? 'es-US' : 'en-US'; u.rate = .92; speechSynthesis.speak(u); };
    if (!elevenlabs) { browser(); return; }
    const audio = new Audio(`/api/speak/stream?role=protected&id=${encodeURIComponent(speech.id)}`);
    audio.onerror = browser; void audio.play().catch(browser);
    return () => audio.pause();
  }, [speech, elevenlabs]);
}
