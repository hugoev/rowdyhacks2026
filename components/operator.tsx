'use client';
import { useEffect, useState } from 'react';
import { api, money, useDemo } from './use-demo';

/** Hidden control page. The operator never touches Rosa's screen. */
export function Operator() {
  const { state, online } = useDemo();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { try { setKey(localStorage.getItem('tripwire-operator-key') || new URLSearchParams(location.search).get('key') || ''); } catch { /* storage blocked */ } }, []);
  const run = (path: string, body: unknown = {}) => { setError(''); void api(path, body, key).catch(e => setError(e.message)); };
  if (!state) return <main className="operator"><p>{online ? 'Loading…' : 'Connecting…'}</p></main>;
  const c = state.config;
  return <main className="operator">
    <header><h1>Operator</h1><span className={online ? 'ok' : 'bad'}>{online ? 'live' : 'offline'}</span></header>
    <p className="providers">
      <span className={c.gemini ? 'ok' : 'bad'}>Gemini Live</span>
      <span className={c.gemini ? 'ok' : 'bad'}>Scammer: Gemini Live</span>
      <span className={c.verifier ? 'ok' : 'bad'}>Verifier agent</span>
      <span className={c.tiger ? 'ok' : 'warn'}>{c.tiger ? 'Tiger Data' : 'Tiger: local data'}</span>
    </p>
    <section className="controls">
      <button className="go" onClick={() => run('/operator/scam')}>RING ROSA (AI scam call)</button>
      <button onClick={() => run('/operator/call-diego')}>CALL DIEGO (manual)</button>
      <button className="warn" onClick={() => run('/operator/force', { status: 'not_me' })}>FORCE RESULT · not me</button>
      <button onClick={() => run('/operator/force', { status: 'confirmed' })}>FORCE RESULT · it’s me</button>
      <button onClick={() => run('/operator/force', { status: 'no_answer' })}>FORCE RESULT · no answer</button>
      <button className="reset" onClick={() => run('/operator/reset')}>RESET</button>
    </section>
    <section className="toggles">
      <label>Language <select value={state.language} onChange={e => run('/operator/language', { language: e.target.value })}><option value="en">English</option><option value="es">Español</option></select></label>
      <label><input type="checkbox" checked={state.coach} onChange={e => run('/operator/coach', { coach: e.target.checked })}/> Coach mode reminder (teammate tells Rosa “say it’s a car repair”)</label>
      <label><input type="checkbox" checked={state.pushToTalk} onChange={e => run('/operator/push-to-talk', { on: e.target.checked })}/> Push-to-talk (loud room)</label>
      <label>Operator key <input type="password" value={key} onChange={e => { setKey(e.target.value); try { localStorage.setItem('tripwire-operator-key', e.target.value); } catch { /* storage blocked */ } }} placeholder="only if OPERATOR_KEY is set"/></label>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="now">
      <p><b>Phase</b> {state.phase}{state.check && <> · {money(state.check.amount)} → {state.check.payee} · {state.check.multiple}x typical · {state.check.source}</>}</p>
      <p><b>Phone</b> {state.ring ? `${state.ring.who} · ${state.ring.agent} · ${state.ring.status}` : 'idle'}</p>
      <p><b>Result</b> {state.result ? `${state.result.status} (${state.result.source})` : '—'} · <b>Decision</b> {state.decision ? `${state.decision.decision} (${state.decision.source})` : '—'}</p>
      {state.caseFile && <p><b>Case</b> <a href={`/case/${state.caseFile.id}`} target="_blank" rel="noreferrer">FILE {String(state.caseFile.number).padStart(3, '0')}</a> · stored in {state.caseFile.stored}</p>}
      <p><a href="/case/latest" target="_blank" rel="noreferrer">Open the case-file monitor</a> · <a href="/call?who=rosa" target="_blank" rel="noreferrer">Rosa’s phone</a> · <a href="/call?who=diego" target="_blank" rel="noreferrer">Diego’s phone</a></p>
    </section>
    <ol className="log">{[...state.log].reverse().map(entry => <li key={entry.at + entry.text}><time>{new Date(entry.at).toLocaleTimeString()}</time> {entry.text}</li>)}</ol>
  </main>;
}
