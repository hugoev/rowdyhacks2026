'use client';
import { useEffect, useState } from 'react';
import { Check, Play, RotateCcw } from 'lucide-react';
import { BankApp } from './bank-app';
import { PhoneCall } from './phone-call';
import { api, money, useDemo } from './use-demo';

/**
 * The whole demo on one screen, one laptop, one mic: Rosa's phone (the scam
 * call, then her bank app), Diego's phone, and the story so far. One button
 * starts it; everything after that is Rosa and Diego talking.
 */
export function DemoStage() {
  const { state } = useDemo();
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const [key, setKey] = useState('');
  useEffect(() => {
    const supplied = new URLSearchParams(location.search).get('key');
    if (supplied) { setKey(supplied); return; }
    try { setKey(localStorage.getItem('tripwire-operator-key') || ''); }
    catch { setError('Browser storage is unavailable. Enter a demo access key if the server requires one.'); }
  }, []);
  const run = (path: string, body: unknown = {}) => { setError(''); void api(path, body, key).catch(e => setError(e.message)); };
  async function start() {
    // This tap unlocks sound and the mic for every panel on the page.
    try { const c = new AudioContext(); await c.resume(); void c.close(); } catch { /* audio unavailable */ }
    try {
      setError('');
      await api('/operator/reset', {}, key);
      await api('/operator/scam', {}, key);
      setStarted(true);
    } catch (e) { setError((e as Error).message); }
  }
  const ring = state?.ring;
  const scamOnRosa = ring?.who === 'rosa' && ring.status !== 'ended';
  const steps = [
    { done: !!ring && (ring.who === 'diego' || ring.status !== 'ringing'), now: ring?.who === 'rosa' && ring.status === 'ringing', text: 'Rosa answers “Diego”' },
    { done: !!state?.check, now: ring?.who === 'rosa' && ring.status === 'answered', text: 'The scammer asks for $2,500 bail · hang up' },
    { done: !!state?.check, now: !scamOnRosa && !state?.check && !!ring, text: 'Rosa opens her bank app and sends $2,500' },
    { done: ring?.who === 'diego', now: state?.phase === 'tripwire' && ring?.who !== 'diego', text: 'Tell the teller the story · say yes to calling Diego' },
    { done: !!state?.result, now: ring?.who === 'diego' && !state?.result, text: 'Diego answers: “No, I’m fine!”' },
    { done: !!state?.caseFile, now: !!state?.result && !state?.caseFile, text: 'The teller tells Rosa her money is safe' },
  ];
  const file = state?.caseFile;
  return <main className="demo-stage">
    <header className="demo-bar">
      <a className="demo-home" href="/"><strong>Tripwire</strong></a><span>AI made this scam possible. Now AI calls your grandson.</span>
      <div className="demo-actions">
        <button className="demo-start" onClick={() => void start()}><Play size={18}/>{started ? 'Ring Rosa again' : 'Start the demo'}</button>
        <button onClick={() => { run('/operator/reset'); }}><RotateCcw size={16}/>Reset</button>
        {state?.phase === 'tripwire' && <button className="demo-backup" onClick={() => run('/operator/force', { status: 'not_me' })}>Backup: Diego says “not me”</button>}
      </div>
    </header>
    {error && <p className="error demo-error" role="alert">{error}</p>}
    <details className="demo-settings"><summary>Demo controls</summary>
      <label>Demo access key <input type="password" value={key} onChange={e => {
        setKey(e.target.value);
        try { localStorage.setItem('tripwire-operator-key', e.target.value); }
        catch { setError('The access key works for this page, but the browser could not save it.'); }
      }} placeholder="Only if required by the server"/></label>
      <button onClick={() => run('/operator/language', { language: state?.language === 'es' ? 'en' : 'es' })}>Language: {state?.language === 'es' ? 'Spanish' : 'English'}</button>
      <button onClick={() => run('/operator/push-to-talk', { on: !state?.pushToTalk })}>Push-to-talk: {state?.pushToTalk ? 'on' : 'off'}</button>
    </details>
    <div className="demo-grid">
      <section className="demo-col"><h2>Rosa’s phone</h2>
        {scamOnRosa ? <div className="phone-frame"><PhoneCall who="rosa" embedded/></div> : <BankApp/>}
      </section>
      <section className="demo-col"><h2>Diego’s phone</h2>
        <div className="phone-frame"><PhoneCall who="diego" embedded/></div>
      </section>
      <section className="demo-col story"><h2>What’s happening</h2>
        <ol className="demo-steps">{steps.map(s => <li key={s.text} className={s.done ? 'done' : s.now ? 'now' : ''}>{s.done ? <Check size={18}/> : <span/>}{s.text}</li>)}</ol>
        {state?.check && <p className="demo-fact"><b>{state.check.multiple}×</b> her usual · {money(state.check.amount)} → {state.check.payee}{state.check.isNewPayee ? ' · new payee' : ''}</p>}
        {file && <a className="demo-file" href="/calls" target="_blank" rel="noreferrer"><small>SAVED CALL {String(file.number).padStart(3, '0')}</small><strong>{file.jobName}</strong><span className={file.outcome}>{file.outcome === 'foiled' ? 'FOILED' : 'VERIFIED'}</span></a>}
        <p className="demo-links"><a href="/">Dashboard</a> · <a href="/calls">Saved calls</a></p>
      </section>
    </div>
  </main>;
}
