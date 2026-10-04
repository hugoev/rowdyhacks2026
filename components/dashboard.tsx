'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronRight, FolderOpen, LayoutDashboard, Menu, MonitorPlay, Shield, ShieldCheck } from 'lucide-react';
import { rosa } from '@/lib/demo-data';
import type { CaseFile, DemoState } from '@/lib/types';
import { BrandMark } from './brand-mark';
import { Wordmark } from './wordmark';
import { DetectiveBoard, type BoardConnection, type BoardSpotlight } from './detective-board';
import { money, useDemo } from './use-demo';

export type DashboardView = 'mission' | 'cases';
const names: Record<DashboardView, string> = { mission: 'Dashboard', cases: 'Saved calls' };
// The red string follows the heist in story order: the job, the teller, the calls, the verdict, the file.
const missionStrings: readonly BoardConnection[] = [['protected', 'history'], ['history', 'demo']];
const missionSpotlight: BoardSpotlight = { targets: ['protected', 'foiled', 'stop', 'typical', 'history', 'demo'] };
const pad = (n: number) => String(n).padStart(3, '0');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The family's dashboard: the old detective board, redesigned around the v3 safety-teller flow. */
export function Dashboard({ view }: { view: DashboardView }) {
  const { state, online } = useDemo();
  const [menu, setMenu] = useState(false);
  const [cases, setCases] = useState<CaseFile[]>([]);
  const [historyError, setHistoryError] = useState('');
  // Case history: this session's files plus the family's history in Tiger Data.
  const latest = state?.caseFile?.id;
  useEffect(() => {
    let active = true;
    void fetch('/api/cases').then(async r => {
      if (!r.ok) throw new Error('Saved calls could not load. Refresh to try again.');
      return r.json() as Promise<CaseFile[]>;
    }).then(files => { if (active) { setCases(files); setHistoryError(''); } })
      .catch(e => { if (active) setHistoryError((e as Error).message); });
    return () => { active = false; };
  }, [latest, state?.caseFile?.stored]);
  return <div className="app-shell dash">
    <a className="skip-link" href="#main">Skip to main content</a>
    <Sidebar view={view} menu={menu} onClose={() => setMenu(false)}/>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenu(!menu)}><Menu size={22}/></button><span>GARCIA FAMILY</span><ChevronRight size={13}/><strong>{names[view]}</strong></div>
        {!online && <span className="connection" role="status">Reconnecting...</span>}</header>
      {state?.caseFile?.outcome === 'foiled' && <FoiledSweep at={state.caseFile.at}/>}
      <main id="main" className="main-content">
        {historyError && <p className="error-banner" role="alert">{historyError}</p>}
        {!state ? <div className="loading-state"><BrandMark/><h1>Opening the case board…</h1><p>Connecting to Tripwire.</p></div>
          : <DetectiveBoard connections={view === 'mission' ? missionStrings : undefined} spotlight={view === 'mission' ? missionSpotlight : undefined}>
            {view === 'mission' ? <Mission state={state} cases={cases}/> : <Cases cases={cases}/>}
          </DetectiveBoard>}
      </main>
    </div>
  </div>;
}

function Sidebar({ view, menu, onClose }: { view: DashboardView; menu: boolean; onClose: () => void }) {
  const board = [
    { href: '/', id: 'mission', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/calls', id: 'cases', label: 'Saved calls', icon: FolderOpen },
  ] as const;
  return <>
    {menu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose}/>}
    <aside className={'sidebar ' + (menu ? 'open' : '')}>
      <Link onClick={onClose} className="brand" href="/"><BrandMark/><span className="brand-name"><Wordmark/></span><small>BEFORE THE MONEY MOVES</small></Link>
      <div className="sidebar-family"><div className="avatar rosa">R</div><div><strong>The Garcia family</strong><small>Protected household</small></div><ShieldCheck size={17}/></div>
      <div className="nav-label">YOUR FAMILY</div>
      <nav aria-label="Main navigation">{board.map(item => <Link onClick={onClose} key={item.id} href={item.href} className={view === item.id ? 'nav-item active' : 'nav-item'} aria-current={view === item.id ? 'page' : undefined}><item.icon size={19} strokeWidth={1.6}/><span className="tape-label">{item.label}</span></Link>)}</nav>
      <a href="/demo" className="nav-item"><MonitorPlay size={19} strokeWidth={1.6}/><span className="tape-label">Demo</span></a>
      <div className="sidebar-bottom"><div className="crew-note"><span className="mini-cross">+</span><p>Every scam is a heist.<br/><strong>You have a crew.</strong></p></div>
        <div className="sidebar-user"><div className="avatar elena">A</div><div><strong>Ana Garcia</strong><small>Rosa’s daughter · trusted contact</small></div></div></div>
    </aside>
  </>;
}

function Mission({ state, cases }: { state: DemoState; cases: CaseFile[] }) {
  const foiled = cases.filter(c => c.outcome === 'foiled');
  const protectedTotal = foiled.reduce((sum, c) => sum + c.amount, 0);
  const latestStop = cases[0]?.secondsToStop;
  return <>
    <div className="page-heading"><div><p className="eyebrow"><span className="red-dash"/> THE COUNTER-HEIST CREW</p><h1>Before the money moves<span>.</span></h1><p>Your family's call reviews, and the crew that helps stop the next con.</p></div></div>
    <div className="overview-grid dash-stats">
      <Stat node="protected" label="MONEY PROTECTED" value={money(protectedTotal)} unit="USD" note={`${foiled.length} payments held`}/>
      <Stat node="foiled" label="HEISTS FOILED" value={String(foiled.length).padStart(2, '0')} note={`${cases.length} saved call reviews`}/>
      <Stat node="stop" label="LAST RESPONSE TIME" value={latestStop !== undefined ? clock(latestStop) : '—'} note="From Send to the decision"/>
      <Stat node="typical" label="ROSA'S USUAL PAYMENT" value={money(state.check?.typical ?? 86)} note="From her payment history"/>
    </div>
    <div className="dashboard-columns"><section className="panel saved-history" data-board-node="history">
      <SectionTitle index="01" title="Recent saved calls" right={<Link className="text-link" href="/calls">View all<ArrowUpRight size={13}/></Link>}/>
      <SavedCallCards cases={cases.slice(0, 3)}/>
    </section><section className="demo-card" data-board-node="demo">
      <div className="demo-card-top"><span className="eyebrow">THE COUNTER-HEIST / TRY IT</span><MonitorPlay size={22}/></div>
      <h2>Meet the con.<br/>Trip the alarm.</h2>
      <p>A call to Rosa. A risky payment. A teller who calls the real Diego.</p>
      <a className="button paper" href="/demo">Open the demo<ArrowUpRight size={16}/></a>
      <p className="demo-fine">Demo payments are simulated.</p>
    </section></div>
  </>;
}

function Cases({ cases }: { cases: CaseFile[] }) {
  const [filter, setFilter] = useState<'all' | 'foiled' | 'released'>('all');
  const shown = cases.filter(c => filter === 'all' || c.outcome === filter);
  return <>
    <div className="page-heading"><div><p className="eyebrow">THE FAMILY RECORD</p><h1>Saved calls<span>.</span></h1><p>What happened, how the payment ended, and what to look for next time.</p></div><Badge tone="outline">{cases.length} CALL REVIEWS</Badge></div>
    <div className="filter-tabs">{(['all', 'foiled', 'released'] as const).map(f => <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All calls' : f === 'foiled' ? 'Heists foiled' : 'Verified and sent'}</button>)}</div>
    <SavedCallCards cases={shown}/>
  </>;
}

function SavedCallCards({ cases }: { cases: CaseFile[] }) {
  if (!cases.length) return <Waiting icon={<FolderOpen size={26}/>} title="No saved calls yet.">Completed teller conversations appear here with their payment outcome and a short review. Audio recordings are not saved here.</Waiting>;
  return <div className="saved-call-list">{cases.map(c => <article className="case-card saved-call" key={c.id}>
    <div className="case-card-top"><span className="eyebrow">CALL {pad(c.number)}</span><Badge tone={c.outcome === 'foiled' ? 'green' : 'neutral'}>{c.outcome === 'foiled' ? 'FOILED' : 'VERIFIED'}</Badge></div>
    <h2>{c.jobName}</h2><p className="case-date">{new Date(c.at).toLocaleString()} · {money(c.amount)} → {c.payee}</p>
    <details><summary>Review call</summary><div className="saved-call-details">
      <p><b>Person being verified:</b> {c.impersonated}</p>
      {c.pressure.length > 0 && <p><b>Pressure:</b> {c.pressure.map(q => `“${q}”`).join(', ')}</p>}
      {c.cover && <p><b>Secrecy:</b> “{c.cover}”</p>}
      <p><b>Verification:</b> {c.foiledBy}</p>
      <div className="case-lesson"><Shield size={18}/><p>{c.tip}</p></div>
      {c.resultSource === 'operator' && <p className="source-label">Demo result entered manually.</p>}
      <p className="source-label">{c.stored === 'tiger' ? 'Saved in Tiger Data' : 'Saved for this session'}</p>
    </div></details>
  </article>)}</div>;
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
