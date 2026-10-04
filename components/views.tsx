'use client';
import { useState } from 'react';
import { Check, FileSearch, KeyRound, LockKeyhole, Shield, ShieldAlert, X } from 'lucide-react';
import { useTripwire } from './context';
import { HeistFoiled } from './heist';
import { Badge, Confirm, Countdown, money, ViewLink } from './ui';

/** Diego's phone: one push-style card, two buttons. */
export function Relative() {
  const { state, request, setError } = useTripwire(); const [busy, setBusy] = useState(false);
  if (!state) return <div className="diego-phone"><p className="diego-status">Connecting…</p></div>;
  const alert = state.call.alert;
  async function answer(value: 'release' | 'block') { setBusy(true); try { await request('/guardian/reply', { id: alert!.id, answer: value }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="diego-phone">
    <HeistFoiled at={state.call.foiledAt}/>
    <p className="diego-status">Diego’s phone</p>
    {alert && !alert.reply ? <section className="push-card" role="alertdialog" aria-labelledby="push-title">
      <div className="push-app"><ShieldAlert size={20}/>TRIPWIRE · now</div>
      <h1 id="push-title">{alert.summary}</h1>
      <p>Grandma is on the call now. Your answer reaches her screen in seconds.</p>
      <button className="push-button block" disabled={busy} onClick={() => void answer('block')}><X size={24}/>Not me, block</button>
      <button className="push-button release" disabled={busy} onClick={() => void answer('release')}><Check size={22}/>It’s me, release</button>
      <small>{alert.source === 'gemini' ? 'Summary by Gemini Live' : 'Summary by Tripwire rules'}</small>
    </section> : alert?.reply ? <section className="push-card done">
      <div className="push-app"><Shield size={20}/>TRIPWIRE</div>
      <h1>{alert.reply === 'block' ? 'Blocked. Grandma’s money hasn’t moved.' : 'Released. Grandma knows it’s you.'}</h1>
      <p>{alert.reply === 'block' ? 'Give her a call on her saved number when you can.' : 'Call her back on her saved number to check in.'}</p>
      <Badge tone="green">REPLY DELIVERED IN {alert.repliedAt ? ((alert.repliedAt - alert.at) / 1000).toFixed(1) : '—'} S</Badge>
    </section> : <section className="push-card idle"><div className="push-app"><Shield size={20}/>TRIPWIRE</div><h1>You’re Grandma’s trusted contact.</h1><p>If someone uses your name to ask her for money, you’ll get one question here.</p><ViewLink href="/protected">Open Rosa’s phone</ViewLink></section>}
  </div>;
}

export function Preferences() {
  const { state, request, setError } = useTripwire(); const s = state!; const [word, setWord] = useState(''); const [limit, setLimit] = useState(String(s.settings.coSignLimit)); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  async function action(fn: () => Promise<void>) { setBusy(true); setNotice(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <><div className="page-heading"><div><p className="eyebrow">YOUR FAMILY. YOUR CHOICES.</p><h1>Set your safety net<span>.</span></h1><p>Rosa controls her preferences. Changes to payment limits take 24 hours.</p></div></div><div className="settings-grid">
    <section className="panel settings-card" data-board-node="safe-word"><KeyRound size={25}/><h2>The family word</h2><p>Choose a word together, away from any caller. It is stored as a salted hash and never sent to the AI model; Gemini only learns match or no match.</p>{s.settings.safeWordConfigured ? <><Badge tone="green">FAMILY WORD CONFIGURED</Badge><p>Only the guardian can replace an existing word.</p><GuardianWord/></> : <form onSubmit={e => { e.preventDefault(); void action(async () => { await request('/safe-word/set', { word }); setWord(''); setNotice('Family word saved as a salted bcrypt hash.'); }); }}><label>Your family word<input type="password" value={word} onChange={e => setWord(e.target.value)} minLength={4} maxLength={100} required autoComplete="new-password"/></label><button className="button primary" disabled={busy}>Set family word</button></form>}</section>
    <section className="panel settings-card" data-board-node="language"><Shield size={25}/><h2>Rosa’s language</h2><p>Whispers and Tripwire’s voice use this language.</p><select value={s.settings.language} onChange={e => void action(async () => { await request('/settings', { language: e.target.value }); })}><option value="en">English</option><option value="es">Español</option></select></section>
    <section className="panel settings-card" data-board-node="payment-limit"><LockKeyhole size={25}/><h2>The co-sign limit</h2><p>Payments above {money(s.settings.coSignLimit)} pause for family. Critical payments pause at any amount.</p><form onSubmit={e => { e.preventDefault(); void action(async () => { await request('/settings', { coSignLimit: Number(limit) }); setNotice('Your new limit is scheduled. The current limit stays in place for 24 hours.'); }); }}><label>New co-sign limit ($)<input type="number" min="0" max="100000" step="1" value={limit} onChange={e => setLimit(e.target.value)} required/></label><button className="button secondary" disabled={busy}>Schedule limit change</button></form>{s.settings.pendingLimit && <div className="pending-setting">{money(s.settings.pendingLimit.value)} takes effect in <Countdown until={s.settings.pendingLimit.effectiveAt}/></div>}</section>
    <section className="panel settings-card" data-board-node="consent"><Shield size={25}/><h2>Consent comes first</h2><p>Tripwire listens only after Rosa answers with it on, and only to the caller. Audio is never stored. Only flagged case files are kept.</p><label className="check-row"><input type="checkbox" checked={s.settings.retainFlaggedTranscripts} disabled={busy} onChange={e => { const checked = e.target.checked; void action(async () => { await request('/settings', { retainFlaggedTranscripts: checked }); }); }}/><span>Keep the latest flagged transcript on this server</span></label></section>
    <section className="panel settings-card" data-board-node="integrations"><FileSearch size={25}/><h2>Connected services</h2>
      <div className="integration-row"><span>Gemini Live (call brain)</span><Badge tone={s.config.gemini ? 'green' : 'neutral'}>{s.config.gemini ? 'LIVE' : 'SIMULATED · RULES ONLY'}</Badge></div>
      <div className="integration-row"><span>ElevenLabs scammer agent</span><Badge tone={s.config.agent ? 'green' : 'neutral'}>{s.config.agent ? 'LIVE' : 'NOT CONFIGURED'}</Badge></div>
      <div className="integration-row"><span>ElevenLabs Tripwire voice</span><Badge tone={s.config.elevenlabs ? 'green' : 'neutral'}>{s.config.elevenlabs ? 'LIVE' : 'BROWSER VOICE'}</Badge></div>
      <div className="integration-row"><span>Tiger Data events + evals</span><Badge tone={s.config.analytics?.state === 'working' ? 'green' : s.config.analytics?.state === 'degraded' ? 'amber' : 'neutral'}>{(s.config.analytics?.state || 'unconfigured').toUpperCase()}</Badge></div>
      <div className="integration-row"><span>Solana devnet escrow (optional)</span><Badge tone={s.config.solana?.state === 'working' ? 'green' : 'neutral'}>{(s.config.solana?.state || 'unconfigured').toUpperCase()}</Badge></div>
      {Object.entries(s.config.providers || {}).map(([name, status]) => <div key={name} className="integration-row"><span>{name.replace(/([A-Z])/g, ' $1')}<small className="small-note">{status.model}</small></span><Badge tone={status.state === 'working' ? 'green' : status.state === 'degraded' ? 'amber' : 'neutral'}>{status.state.toUpperCase()}{status.error ? ' · ' + status.error : ''}</Badge></div>)}
      <p className="small-note">Payments are simulated; no financial accounts are linked.</p></section>
  </div>{notice && <p role="status" className="notice-banner"><Check size={17}/>{notice}</p>}</>;
}
function GuardianWord() {
  const [show, setShow] = useState(false); const [word, setWord] = useState(''); const [code, setCode] = useState(''); const [notice, setNotice] = useState(''); const { state, setError, refresh } = useTripwire();
  async function update() {
    const { headers } = await import('./context');
    const login = await fetch('/api/session', { method: 'POST', headers: headers('guardian'), body: JSON.stringify({ role: 'guardian', accessCode: code }) });
    if (!login.ok) throw new Error((await login.json()).error);
    const response = await fetch('/api/safe-word/set', { method: 'POST', headers: headers('guardian'), body: JSON.stringify({ word }) });
    if (!response.ok) throw new Error((await response.json()).error);
    setWord(''); setCode(''); setShow(false); setNotice('The family word was updated.'); await refresh();
  }
  return <><button className="button secondary" onClick={() => setShow(true)}>Guardian: replace family word</button><Confirm open={show} title="Replace the family word" label="Save new word" onClose={() => setShow(false)} action={async () => { if (word.trim().length < 4) { setError('Choose a word with at least four characters.'); throw new Error('Word too short'); } try { await update(); } catch (e) { setError((e as Error).message); throw e; } }}><label>New family word<input type="password" value={word} onChange={e => setWord(e.target.value)} autoComplete="new-password"/></label>{!state!.config.demo && <label>Guardian access code<input type="password" value={code} onChange={e => setCode(e.target.value)} autoComplete="current-password"/></label>}<p>Agree on the new word with Rosa before changing it.</p></Confirm>{notice && <p role="status">{notice}</p>}</>;
}
