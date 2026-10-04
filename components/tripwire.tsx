'use client';
import Link from 'next/link';
import { Sidebar } from './sidebar';
import { BrandMark } from './brand-mark';
import { useState } from 'react';
import { ChevronRight, LockKeyhole, Menu, Radio, RotateCcw, Shield, ShieldCheck, X } from 'lucide-react';
import { Provider, useTripwire } from './context';
import { Badge, Confirm, Countdown, Empty, money, PaymentStatus, RiskDial, SectionTitle, time } from './ui';
import { ProtectedShell } from './protected-shell';
import { MotionProvider } from './motion';
import { Preferences, Relative } from './views';
import type { Payment } from '@/lib/types';
import { signGuardianDecision } from './solana-wallet';
import { EscrowStatus } from './escrow-status';
import { DetectiveBoard } from './detective-board';
import { CaseFileCard, ConMeter, EvalCard, HeistFoiled, ToolTimeline, stamp } from './heist';

export type View = 'guardian' | 'protected' | 'relative' | 'cases' | 'settings' | 'stage';
const names: Record<View, string> = { guardian: 'Mission Control', protected: 'Rosa’s phone', relative: 'Diego’s phone', cases: 'Case files', settings: 'Family settings', stage: 'Stage' };
export default function Tripwire({ view }: { view: View }) {
  if (view === 'stage') return <Stage/>;
  const role = view === 'protected' || view === 'settings' ? 'protected' : view === 'relative' ? 'relative' : 'guardian';
  if (view === 'protected') return <Provider key={view} role={role}><div className="rosa-surface"><MotionProvider><ProtectedShell/></MotionProvider></div></Provider>;
  if (view === 'relative') return <Provider key={view} role={role}><main id="main" className="diego-surface"><Relative/></main></Provider>;
  return <Provider key={view} role={role}><Shell view={view}/></Provider>;
}
/** Big screen for judges: Rosa's device on the left, Mission Control on the right. */
function Stage() {
  return <main className="stage"><iframe title="Rosa’s phone" src="/protected?embed=1"/><iframe title="Mission Control" src="/guardian?embed=1"/></main>;
}
function Shell({ view }: { view: View }) {
  const { state, error, setError } = useTripwire(); const [menu, setMenu] = useState(false);
  const urgent = state?.payments.filter(p => p.status === 'held').length || 0;
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to main content</a>
    <Sidebar view={view} menu={menu} urgent={urgent} onClose={() => setMenu(false)}/>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(!menu)}><Menu size={22}/></button><span>GARCIA FAMILY</span><ChevronRight size={13}/><strong>{names[view]}</strong></div></header>
      <HeistFoiled at={state?.call.foiledAt}/>
      <main id="main" className="main-content">
        {error && <div role="alert" className="error-banner"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={18}/></button></div>}
        {!state ? <div className="loading-state"><BrandMark/><h1>Preparing your protection…</h1><p>Loading your family safety workspace.</p><button className="button secondary" onClick={() => window.location.reload()}>Try again</button></div> : <DetectiveBoard variant={view === 'settings' ? 'calm' : 'standard'}>
          {view === 'guardian' && <MissionControl/>}{view === 'cases' && <Cases/>}{view === 'settings' && <Preferences/>}
        </DetectiveBoard>}
      </main>
      <footer className="footer"><span><Shield size={13}/> TRIPWIRE LISTENS FOR THE CON, NOT THE VOICE.</span><span>ROWDYHACKS XII <i/> SAN ANTONIO, TX <i/> 2026</span></footer>
    </div>
  </div>;
}

function MissionControl() {
  const { state, request } = useTripwire(); const s = state!; const call = s.call;
  const [reset, setReset] = useState(false); const [showEval, setShowEval] = useState(false);
  const currentCase = s.cases.find(c => c.evidence?.callId && c.evidence.callId === call.id);
  return <>
    <div className="page-heading mc-heading"><div><p className="eyebrow"><span className="red-dash"/> MISSION CONTROL · THE COUNTER-HEIST</p><h1>Listening for the con<span>.</span></h1></div>
      <div className="mc-status"><Badge tone={call.active ? 'green' : 'neutral'}><span className={call.active ? 'live-dot' : ''}/>{call.active ? (call.live === 'gemini' ? 'GEMINI LIVE' : 'RULE SPOTTER') : 'STANDING BY'}</Badge><button className="button secondary" onClick={() => setShowEval(!showEval)}>{showEval ? 'Back to the call' : 'Proof points'}</button></div></div>
    {showEval ? <EvalCard summary={s.eval}/> : <div className="mc-grid">
      <section className="panel mc-meter" data-board-node="meter"><SectionTitle index="01" title="The Con Meter" right={<span className="mono-small">{call.signals.length} SIGNALS</span>}/><ConMeter call={call}/></section>
      <section className="panel mc-risk" data-board-node="risk"><SectionTitle index="02" title="Risk"/><div className="risk-summary"><RiskDial score={call.assessment.score} level={call.assessment.level}/><div className="risk-copy"><p className="eyebrow">{call.assessment.scamType.toUpperCase()}</p><h3>{call.assessment.score >= 85 ? 'Something isn’t adding up.' : call.active ? 'Listening for the tells.' : 'Waiting for a call.'}</h3><p>{call.assessment.advice}</p><p className="small-note">Family word: <b>{call.safeWord === 'failed' ? 'FAILED' : call.safeWord === 'matched' ? 'matched' : call.safeWord === 'asked' ? 'asked…' : 'not asked'}</b>{call.alert && <> · Diego: <b>{call.alert.reply ? (call.alert.reply === 'block' ? 'NOT ME' : 'IT’S ME') : 'asked…'}</b></>}</p></div></div></section>
      <section className="panel mc-transcript" data-board-node="transcript"><SectionTitle index="03" title="Caller transcript" right={<span className="mono-small">CALLER ONLY</span>}/><div className="transcript-mini">{call.transcript.length ? call.transcript.slice(-12).map(l => <p key={l.id}><time>{stamp(l.at, call.startedAt)}</time>{l.text}<small>{l.source === 'gemini' ? '' : ` · ${l.source}`}</small></p>) : <p className="quiet-text">Caller words appear here as Gemini hears them.</p>}</div></section>
      <section className="panel mc-log" data-board-node="log"><SectionTitle index="04" title="Surveillance log" right={<span className="mono-small">TOOL CALLS</span>}/><ToolTimeline tools={call.tools} start={call.startedAt}/></section>
      <section className="panel mc-money" data-board-node="money"><SectionTitle index="05" title="The Teller" right={<span className="mono-small">PAYMENTS</span>}/><PaymentQueue/></section>
      <section className="mc-case" data-board-node="case">{currentCase && currentCase.outcome !== 'open' ? <CaseFileCard file={currentCase} start={call.startedAt}/> : <div className="kraft-file pending"><div className="kraft-tab">CASE FILE</div><p>The case file opens when the family decides.</p></div>}</section>
    </div>}
    <div className="demo-bottom"><p className="demo-disclosure">Payments are simulated. Signals tagged RULE come from the deterministic backup spotter.</p>{s.config.demo && <button className="text-link" onClick={() => setReset(true)}><RotateCcw size={12}/>Clear activity</button>}<Link className="text-link" href="/stage">Open stage view</Link></div>
    <Confirm open={reset} title="Clear recent activity?" label="Clear activity" onClose={() => setReset(false)} action={async () => { await request('/demo/reset'); }}><p>This removes calls, payments, and case files. The family word stays configured.</p></Confirm>
  </>;
}
export function PaymentQueue() {
  const { state, request } = useTripwire(); const [decision, setDecision] = useState<{ payment: Payment; action: 'approve' | 'deny' } | null>(null);
  const payments = state!.payments.slice(0, 4);
  return <><div className="payment-queue">{payments.length ? payments.map(p => <article className={'payment-item ' + p.status} key={p.id}><div className="payment-item-top"><div className="payment-symbol"><LockKeyhole size={21}/></div><div className="payment-who"><h3>{p.payee}</h3><p>{p.rail.replace('-', ' ')} <span>·</span> {time(p.createdAt)}</p></div><strong>{money(p.amount)}</strong></div><div className="payment-meta"><PaymentStatus payment={p}/>{p.status === 'held' && p.releaseAt && <span>Cooling off <Countdown until={p.releaseAt}/></span>}</div>{p.evidence?.length ? <ul className="held-quotes small">{p.evidence.slice(0, 3).map(e => <li key={e.lever}><q>{e.quote}</q></li>)}</ul> : null}<EscrowStatus payment={p}/>{(p.status === 'held' || p.status === 'review') && !state!.call.alert && <div className="button-row"><button className="button primary" disabled={p.escrow?.state === 'depositing'} onClick={() => setDecision({ payment: p, action: 'deny' })}><ShieldCheck size={15}/>Deny</button><button className="button secondary" disabled={p.escrow?.state === 'depositing'} onClick={() => setDecision({ payment: p, action: 'approve' })}>Approve after verifying</button></div>}</article>) : <Empty title="No payments yet.">A $40 bill goes straight through. A coached payment pauses here.</Empty>}</div><Confirm open={!!decision} title={decision?.action === 'deny' ? 'Stop this payment?' : 'Have you verified this request?'} label={decision?.action === 'deny' ? 'Deny payment' : 'Approve payment'} onClose={() => setDecision(null)} action={async () => { if (decision) { if (decision.payment.escrow) await signGuardianDecision(request, decision.payment.id, decision.action); else await request('/payments/decide', { id: decision.payment.id, decision: decision.action }); } }}><p>{decision?.action === 'deny' ? `This stops the ${money(decision.payment.amount)} request to ${decision.payment.payee}.` : 'Call Rosa on a number you trust first. Approval does not send funds from this app.'}</p></Confirm></>;
}
function Cases() {
  const { state } = useTripwire(); const s = state!; const [filter, setFilter] = useState('all');
  const cases = s.cases.filter(c => filter === 'all' || c.outcome === filter);
  return <><div className="page-heading"><div><p className="eyebrow">THE FAMILY’S CASE HISTORY</p><h1>The case files<span>.</span></h1><p>Know the playbook. Recognize the next attempt.</p></div><Badge tone="outline">{s.cases.length} FILES ON RECORD</Badge></div><div className="filter-tabs">{['all', 'open', 'foiled', 'reviewed'].map(f => <button className={filter === f ? 'selected' : ''} key={f} onClick={() => setFilter(f)}>{f === 'all' ? 'All files' : f === 'foiled' ? 'Heists foiled' : f}</button>)}</div><div className="case-grid">{cases.map(c => <CaseFileCard key={c.id} file={c}/>)}</div>{!cases.length && <section className="panel"><Empty title="A clean slate.">A paused payment creates a case file with the caller’s own words.</Empty></section>}<div className="demo-bottom"><Link className="text-link" href="/guardian"><Radio size={12}/>Back to Mission Control</Link></div></>;
}
