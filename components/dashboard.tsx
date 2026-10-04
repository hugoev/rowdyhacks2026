'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronRight, FolderOpen, Landmark, LayoutDashboard, LockKeyhole, Menu, MonitorPlay, Phone, PhoneCall, Radio, RotateCcw, Shield, ShieldCheck, SlidersHorizontal, Smartphone } from 'lucide-react';
import { contacts, railLabels, rosa } from '@/lib/demo-data';
import type { CaseFile, DemoState, Ring } from '@/lib/types';
import { BrandMark } from './brand-mark';
import { Wordmark } from './wordmark';
import { DetectiveBoard, type BoardConnection, type BoardSpotlight } from './detective-board';
import { api, money, useDemo } from './use-demo';

export type DashboardView = 'mission' | 'cases';
const names: Record<DashboardView, string> = { mission: 'Mission Control', cases: 'Case files' };
// The red string follows the heist in story order: the job, the teller, the calls, the verdict, the file.
const missionStrings: readonly BoardConnection[] = [['job', 'teller'], ['teller', 'calls'], ['calls', 'verdict'], ['verdict', 'case']];
const missionSpotlight: BoardSpotlight = { targets: ['protected', 'foiled', 'stop', 'typical', 'job', 'teller', 'calls', 'verdict', 'case', 'wire'] };
const pad = (n: number) => String(n).padStart(3, '0');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const since = (at: number, start: number | null) => { const ms = Math.max(0, at - (start ?? at)); return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor(ms % 1000 / 100))}`; };

/** The family's dashboard: the old detective board, redesigned around the v3 safety-teller flow. */
export function Dashboard({ view }: { view: DashboardView }) {
  const { state, online } = useDemo();
  const [menu, setMenu] = useState(false);
  const [cases, setCases] = useState<CaseFile[]>([]);
  // Case history: this session's files plus the family's history in Tiger Data.
  const latest = state?.caseFile?.id;
  useEffect(() => { void fetch('/api/cases').then(r => r.ok ? r.json() : []).then(setCases).catch(() => {}); }, [latest]);
  const live = state?.phase === 'tripwire';
  return <div className="app-shell dash">
    <a className="skip-link" href="#main">Skip to main content</a>
    <Sidebar view={view} menu={menu} live={live} onClose={() => setMenu(false)}/>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(!menu)}><Menu size={22}/></button><span>GARCIA FAMILY</span><ChevronRight size={13}/><strong>{names[view]}</strong></div>
        <div className="topbar-right"><span className={'connection ' + (online ? 'connected' : '')}><i/>{online ? 'LIVE' : 'RECONNECTING'}</span></div></header>
      {state?.caseFile?.outcome === 'foiled' && <FoiledSweep at={state.caseFile.at}/>}
      <main id="main" className="main-content">
        {!state ? <div className="loading-state"><BrandMark/><h1>Opening the case board…</h1><p>Connecting to Tripwire.</p></div>
          : <DetectiveBoard connections={view === 'mission' ? missionStrings : undefined} spotlight={view === 'mission' ? missionSpotlight : undefined}>
            {view === 'mission' ? <Mission state={state} cases={cases}/> : <Cases cases={cases}/>}
          </DetectiveBoard>}
      </main>
      <footer className="footer"><span><Shield size={13}/> AI MADE THIS SCAM POSSIBLE. NOW AI CALLS YOUR GRANDSON.</span><span>ROWDYHACKS XII <i/> SAN ANTONIO, TX <i/> 2026</span></footer>
    </div>
  </div>;
}

function Sidebar({ view, menu, live, onClose }: { view: DashboardView; menu: boolean; live: boolean; onClose: () => void }) {
  const board = [
    { href: '/dashboard', id: 'mission', label: 'Mission Control', icon: LayoutDashboard },
    { href: '/dashboard/cases', id: 'cases', label: 'Case files', icon: FolderOpen },
  ] as const;
  // Pages outside the board open as full pages, so the board's styles never reach Rosa's calm screens.
  const crew = [
    { href: '/', label: 'Rosa’s bank app', icon: Landmark },
    { href: '/call?who=rosa', label: 'Rosa’s phone', icon: Smartphone },
    { href: '/call?who=diego', label: 'Diego’s phone', icon: PhoneCall },
    { href: '/case/latest', label: 'Case monitor', icon: MonitorPlay },
    { href: '/operator', label: 'Operator', icon: SlidersHorizontal },
  ];
  return <>
    {menu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose}/>}
    <aside className={'sidebar ' + (menu ? 'open' : '')}>
      <Link onClick={onClose} className="brand" href="/dashboard"><BrandMark/><span className="brand-name"><Wordmark/></span><small>BEFORE THE MONEY MOVES</small></Link>
      <div className="sidebar-family"><div className="avatar rosa">R</div><div><strong>The Garcia family</strong><small>Protected household</small></div><ShieldCheck size={17}/></div>
      <div className="nav-label">CASEBOARD</div>
      <nav aria-label="Main navigation">{board.map(item => <Link onClick={onClose} key={item.id} href={item.href} className={view === item.id ? 'nav-item active' : 'nav-item'} aria-current={view === item.id ? 'page' : undefined}><item.icon size={19} strokeWidth={1.6}/><span className="tape-label">{item.label}</span>{item.id === 'mission' && live && <span className="nav-count">LIVE</span>}</Link>)}</nav>
      <div className="nav-label second">THE CREW</div>
      <nav aria-label="Demo surfaces">{crew.map(item => <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="nav-item"><item.icon size={19} strokeWidth={1.6}/><span className="tape-label">{item.label}</span></a>)}</nav>
      <div className="sidebar-bottom"><div className="crew-note"><span className="mini-cross">+</span><p>Every scam is a heist.<br/><strong>You have a crew.</strong></p></div>
        <div className="sidebar-user"><div className="avatar elena">A</div><div><strong>Ana Garcia</strong><small>Rosa’s daughter · gets the case files</small></div></div></div>
    </aside>
  </>;
}

function Mission({ state, cases }: { state: DemoState; cases: CaseFile[] }) {
  const check = state.check; const decision = state.decision; const file = state.caseFile;
  const foiled = cases.filter(c => c.outcome === 'foiled');
  const protectedTotal = foiled.reduce((sum, c) => sum + c.amount, 0);
  const lastStop = file?.secondsToStop ?? cases[0]?.secondsToStop;
  const headline = state.phase === 'tripwire' ? 'The teller is on the line' : file?.outcome === 'foiled' ? 'Heist foiled' : 'Before the money moves';
  return <>
    <div className="page-heading"><div><p className="eyebrow"><span className="red-dash"/> MISSION CONTROL · THE COUNTER-HEIST</p><h1>{headline}<span>.</span></h1><p>Every bank app asks “Are you sure?” Tripwire asks what it’s for, then calls your grandson.</p></div>
      <PhaseBadge state={state}/></div>

    <div className="overview-grid dash-stats">
      <Stat node="protected" label="MONEY PROTECTED" value={money(protectedTotal)} unit="USD" note={`${foiled.length} foiled · ${cases.length - foiled.length} verified and sent`}/>
      <Stat node="foiled" label="HEISTS FOILED" value={String(foiled.length).padStart(2, '0')} note={cases.length ? `${cases.length} case files on record` : 'No case files yet'}/>
      <Stat node="stop" label="TIME TO STOP" value={lastStop ? clock(lastStop) : '—'} note="Send tap → money held"/>
      <Stat node="typical" label="ROSA’S USUAL PAYMENT" value={check ? money(check.typical) : '$86'} note={check?.source === 'tiger' ? 'Live from Tiger Data' : 'From her 12-month history'}/>
    </div>

    <div className="dashboard-columns"><div className="left-column">
      <section className="panel dash-job" data-board-node="job">
        <SectionTitle index="01" title="The Job" right={<Badge tone={check?.trigger ? 'red' : check ? 'green' : 'neutral'}>{check ? (check.trigger ? 'TRIPWIRE OPENED' : 'ROUTINE · SENT') : 'NO PAYMENT YET'}</Badge>}/>
        {check ? <div className="job-body">
          <div className="job-multiple"><strong>{check.multiple}×</strong><span>her usual</span></div>
          <dl className="job-facts">
            <div><dt>The getaway</dt><dd>{money(check.amount)} → {check.payee}</dd></div>
            <div><dt>Rail</dt><dd>{railLabels[check.rail]}{check.rail === 'instant' ? ' · can’t be pulled back' : ''}</dd></div>
            <div><dt>Payee</dt><dd>{check.isNewPayee ? 'Never paid before' : 'Paid before'}</dd></div>
            <div><dt>Rule</dt><dd>&gt; 5× usual <b>and</b> (new payee <b>or</b> instant) → {check.trigger ? 'teller' : 'send'}</dd></div>
          </dl>
          <p className="source-label">{check.source === 'tiger' ? 'One query on Tiger Data · hypertable + continuous aggregate' : 'Local copy of the same history (Tiger Data not connected)'}</p>
        </div> : <Waiting icon={<Landmark size={26}/>} title="The vault is quiet.">When Rosa taps Send in her bank app, the risk check lands here.</Waiting>}
      </section>

      <section className="panel dash-teller" data-board-node="teller">
        <SectionTitle index="02" title="The Teller" right={<span className="mono-small">GEMINI LIVE · {state.language === 'es' ? 'ESPAÑOL' : 'ENGLISH'}</span>}/>
        {state.transcript.length ? <ol className="teller-transcript">{state.transcript.slice(-10).map(line => <li key={line.at + line.who} className={line.who}><time>{since(line.at, state.sentAt)}</time><b>{line.who === 'rosa' ? 'Rosa' : 'Tripwire'}</b><p>{line.text}</p></li>)}</ol>
          : <Waiting icon={<Radio size={26}/>} title={state.phase === 'tripwire' ? 'Listening…' : 'No conversation yet.'}>The safety teller only speaks up for risky payments. Its conversation with Rosa appears here, line by line.</Waiting>}
      </section>

      <section className="panel dash-calls" data-board-node="calls">
        <SectionTitle index="03" title="The Calls" right={<span className="mono-small">ELEVENLABS AGENTS</span>}/>
        <div className="call-cards">
          <CallCard title="The inside man" who="Rosa’s phone" note="Scammer agent · consented voice clone" ring={state.ring?.who === 'rosa' ? state.ring : null}/>
          <CallCard title="The real Diego" who={`Diego’s phone · ${contacts.diego.phone}`} note="Verifier agent · number saved on the account" ring={state.ring?.who === 'diego' ? state.ring : null}
            result={state.result ? (state.result.status === 'not_me' ? 'NOT ME' : state.result.status === 'confirmed' ? 'IT’S ME' : 'NO ANSWER') : undefined} resultNote={state.result?.note} forced={state.result?.source === 'operator'}/>
        </div>
      </section>
    </div>

    <div className="right-column">
      <section className={'panel dash-verdict ' + (decision?.decision || '')} data-board-node="verdict">
        <SectionTitle index="04" title="The Verdict"/>
        {decision ? <div className="verdict-body">
          <div className={'verdict-stamp ' + decision.decision}>{decision.decision === 'hold' ? 'HELD' : 'SENT'}</div>
          <p>{decision.reason}</p>
          <p className="source-label">{decision.source === 'gemini' ? 'decide_payment · Gemini' : 'Tripwire rules'}{state.sentAt ? ` · ${clock(Math.round((decision.at - state.sentAt) / 1000))} after Send` : ''}</p>
        </div> : <Waiting icon={<LockKeyhole size={26}/>} title={state.phase === 'tripwire' ? 'Money is waiting.' : 'Nothing to decide.'}>{state.phase === 'tripwire' ? 'Nothing moves until Diego answers.' : 'Holds and releases land here.'}</Waiting>}
      </section>

      <section className="panel activity-panel" data-board-node="wire">
        <SectionTitle index="05" title="The Wire" right={<span className="mono-small">EVENT LOG</span>}/>
        <div className="activity-list">{state.log.length ? [...state.log].reverse().slice(0, 9).map((entry, i) => <div className="activity-event" key={entry.at + entry.text}><div className={'event-node ' + (i === 0 ? 'latest' : '')}>{/RING|RESULT/.test(entry.text) ? <Phone size={13}/> : /HOLD|RELEASE|finish/.test(entry.text) ? <LockKeyhole size={13}/> : <Radio size={13}/>}</div><div><p>{entry.text}</p><time>{new Date(entry.at).toLocaleTimeString()}</time></div></div>)
          : <div className="activity-waiting"><Radio size={23}/><p>The wire is quiet.</p><span>Payments, calls, and verdicts appear here.</span></div>}</div>
      </section>

      <OperatorCard state={state}/>
    </div></div>

    <section className="mc-case" data-board-node="case">{file ? <KraftFile file={file}/> : <div className="kraft-file pending"><div className="kraft-tab">CASE FILE</div><p>The file Rosa’s family gets opens here when the job is settled.</p></div>}</section>
    <div className="demo-bottom"><p className="demo-disclosure">Payments are simulated. The scam call is a consented AI voice clone, used only for this demo.</p><a className="text-link" href="/case/latest" target="_blank" rel="noreferrer">Open the case monitor<ArrowUpRight size={12}/></a></div>
  </>;
}

function Cases({ cases }: { cases: CaseFile[] }) {
  const [filter, setFilter] = useState<'all' | 'foiled' | 'released'>('all');
  const shown = cases.filter(c => filter === 'all' || c.outcome === filter);
  return <>
    <div className="page-heading"><div><p className="eyebrow">THE FAMILY’S CASE HISTORY</p><h1>The case files<span>.</span></h1><p>Written by the teller from the real conversation. Know the playbook; recognize the next attempt.</p></div><Badge tone="outline">{cases.length} FILES ON RECORD</Badge></div>
    <div className="filter-tabs">{(['all', 'foiled', 'released'] as const).map(f => <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All files' : f === 'foiled' ? 'Heists foiled' : 'Verified and sent'}</button>)}</div>
    {shown.length ? <div className="case-grid">{shown.map(c => <article className="case-card" key={c.id} data-board-node={`case-${c.id}`}>
      <div className="case-tab">CONFIDENTIAL · FAMILY COPY</div>
      <div className="case-card-top"><span className="eyebrow">FILE {pad(c.number)}</span><Badge tone={c.outcome === 'foiled' ? 'green' : 'neutral'}>{c.outcome === 'foiled' ? 'FOILED' : 'VERIFIED'}</Badge></div>
      <h2>{c.jobName}</h2><p className="case-date">{new Date(c.at).toLocaleString()} · {clock(c.secondsToStop)} to stop</p>
      <div className="case-divider"/>
      <ul><li><b>Inside man:</b> {c.impersonated}</li>{c.pressure.length > 0 && <li><b>Pressure:</b> {c.pressure.map(q => `“${q}”`).join(', ')}</li>}{c.cover && <li><b>Cover:</b> “{c.cover}”</li>}<li><b>Getaway:</b> {c.getaway}</li><li><b>Foiled by:</b> {c.foiledBy}</li></ul>
      <div className="case-lesson"><Shield size={18}/><p>{c.tip}</p></div>
      {c.outcome === 'foiled' && <div className="foiled-stamp">HEIST FOILED</div>}
      <a className="text-link" href={`/case/${c.id}`} target="_blank" rel="noreferrer">Open file<ArrowUpRight size={12}/></a>
    </article>)}</div>
      : <section className="panel"><Waiting icon={<FolderOpen size={26}/>} title="A clean slate.">Every time the teller stops a payment, the file Rosa’s family gets is stored here (and in Tiger Data).</Waiting></section>}
  </>;
}

function KraftFile({ file }: { file: CaseFile }) {
  const rows: [string, string][] = [
    ['The mark', file.mark], ['The inside man', file.impersonated],
    ['The pressure', file.pressure.length ? file.pressure.map(q => `“${q}”`).join(', ') : '—'], ['The cover', file.cover ? `“${file.cover}”` : '—'],
    ['The getaway', file.getaway], ['Foiled by', file.foiledBy || '—'], ['Time to stop', clock(file.secondsToStop)],
  ];
  return <article className="kraft-file">
    <div className="kraft-tab">CASE FILE · {file.outcome === 'foiled' ? 'HEIST FOILED' : 'VERIFIED'}</div>
    <h3>FILE {pad(file.number)} // {file.jobName.toUpperCase()}</h3>
    <ul className="kraft-levers">{rows.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}</ul>
    <p className="kraft-lesson"><span>NEXT TIME</span>{file.tip}</p>
    <p className="kraft-foot">You did nothing wrong. These callers are professionals. · written by {file.writtenBy === 'gemini' ? 'Gemini from the real conversation' : 'Tripwire rules'}{file.resultSource === 'operator' ? ' · result entered by the operator' : ''} · {file.stored === 'tiger' ? 'saved in Tiger Data' : 'saving…'}</p>
    {file.outcome === 'foiled' && <div className="foiled-stamp">FOILED</div>}
  </article>;
}

function CallCard({ title, who, note, ring, result, resultNote, forced }: { title: string; who: string; note: string; ring: Ring | null; result?: string; resultNote?: string; forced?: boolean }) {
  const status = ring ? ring.status : 'idle';
  return <div className={'call-card ' + status}>
    <div className="call-card-top"><span className="call-icon">{status === 'ringing' ? <PhoneCall size={20}/> : <Phone size={20}/>}</span><div><strong>{title}</strong><small>{who}</small></div>
      <Badge tone={status === 'ringing' ? 'amber' : status === 'answered' ? 'green' : 'neutral'}>{status === 'idle' ? 'STANDING BY' : status === 'ringing' ? 'RINGING' : status === 'answered' ? 'ON THE CALL' : 'HUNG UP'}</Badge></div>
    <p>{note}</p>
    {result && <div className={'call-result ' + (result === 'NOT ME' ? 'not-me' : '')}><b>{result}</b>{resultNote && <span>“{resultNote}”</span>}{forced && <small>entered by the operator</small>}</div>}
  </div>;
}

function OperatorCard({ state }: { state: DemoState }) {
  const [error, setError] = useState('');
  const run = (path: string, body: unknown = {}) => { setError(''); let key = ''; try { key = localStorage.getItem('tripwire-operator-key') || ''; } catch { /* storage blocked */ } void api(path, body, key).catch(e => setError(e.message)); };
  return <section className="demo-card" data-board-node="operator">
    <div className="demo-card-top"><span className="eyebrow">THE CREW / RUN THE DEMO</span><span className="target-symbol">⊕</span></div>
    <h2>Run the<br/>job.</h2>
    <div className="crew-controls">
      <button className="button paper" onClick={() => run('/operator/scam')}>Start scam call</button>
      <button className="button paper" disabled={state.phase !== 'tripwire'} onClick={() => run('/operator/call-diego')}>Call Diego</button>
      <button className="button paper" disabled={state.phase !== 'tripwire'} onClick={() => run('/operator/force', { status: 'not_me' })}>Force: not me</button>
      <button className="button paper" disabled={state.phase !== 'tripwire'} onClick={() => run('/operator/force', { status: 'confirmed' })}>Force: it’s me</button>
      <button className="button paper" onClick={() => run('/operator/reset')}><RotateCcw size={14}/>Reset</button>
    </div>
    {error && <p className="crew-error" role="alert">{error}</p>}
    <div className="demo-fine"><span/>{rosa.name.toUpperCase()}, {rosa.age} · {state.coach ? 'COACH MODE ON' : 'STANDARD SCRIPT'} · {state.pushToTalk ? 'PUSH-TO-TALK' : 'OPEN MIC'}</div>
  </section>;
}

function PhaseBadge({ state }: { state: DemoState }) {
  const [label, tone] = state.phase === 'tripwire' ? (state.ring?.who === 'diego' && !state.result ? ['CALLING DIEGO', 'amber'] : ['TELLER ON THE LINE', 'red'])
    : state.phase === 'outcome' ? (state.decision?.decision === 'hold' ? ['MONEY HELD', 'green'] : ['SENT', 'neutral'])
    : state.ring?.who === 'rosa' && state.ring.status !== 'ended' ? ['SCAM CALL IN PROGRESS', 'red'] : ['STANDING BY', 'neutral'];
  return <Badge tone={tone}><span className={state.phase === 'tripwire' ? 'live-dot' : ''}/>{label}</Badge>;
}
function Stat({ node, label, value, unit, note }: { node: string; label: string; value: string; unit?: string; note: string }) {
  return <div className="stat-card" data-board-node={node} tabIndex={0}><div className="stat-top"><span>{label}</span></div><strong>{value}{unit && <span className="stat-unit">{unit}</span>}</strong><p>{note}</p></div>;
}
function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) { return <span className={'badge ' + tone}>{children}</span>; }
function SectionTitle({ index, title, right }: { index: string; title: string; right?: React.ReactNode }) { return <div className="section-title"><h2><span>{index}</span>{title}</h2>{right}</div>; }
function Waiting({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <div className="empty">{icon}<h3>{title}</h3><p>{children}</p></div>; }

/** Red laser sweep + vault slam when a heist is foiled (fires once per case). */
const swept = new Set<number>();
function FoiledSweep({ at }: { at: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => { if (Date.now() - at > 15000 || swept.has(at)) return; swept.add(at); setShow(true); const t = setTimeout(() => setShow(false), 4200); return () => clearTimeout(t); }, [at]);
  return show ? <div className="foiled-overlay" role="status" aria-live="assertive"><div className="laser-beam"/><div className="vault-slam"><span>HEIST FOILED</span></div></div> : null;
}
