'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ShieldCheck, X } from 'lucide-react';
import type { Level, Payment, RiskEvent } from '@/lib/types';
import { RiskHistoryControl } from './risk-history';
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
export const time = (value: number) => new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) { return <span className={'badge ' + tone}>{children}</span>; }
export function SectionTitle({ index, title, right }: { index: string; title: string; right?: React.ReactNode }) { return <div className="section-title"><h2><span>{index}</span>{title}</h2>{right}</div>; }
export function Empty({ title, children }: { title: string; children: React.ReactNode }) { return <div className="empty"><ShieldCheck size={28} strokeWidth={1.3} /><h3>{title}</h3><p>{children}</p></div>; }
export function RiskDial({ score, level }: { score: number; level: Level }) {
  return <div className={'risk-dial ' + level.toLowerCase()} style={{ '--risk': `${score * 3.6}deg` } as React.CSSProperties}><div><span className="dial-label">RISK LEVEL</span><strong>{score}<small>/100</small></strong><span className="dial-level">{level === 'Low' && score === 0 ? 'Standing by' : level + ' risk'}</span></div><span className="dial-tick" /></div>;
}
export function RiskChart({ events }: { events: RiskEvent[] }) {
  return <RiskHistoryControl events={events} render={points => <RiskChartPlot events={points}/>}/>;
}
function RiskChartPlot({ events }: { events: RiskEvent[] }) {
  const points = events.slice(-20); const length = Math.max(points.length - 1, 1);
  const path = points.map((p, i) => `${i * 600 / length},${130 - p.score * 1.1}`).join(' ');
  return <div className="chart"><div className="chart-labels"><span>100</span><span>50</span><span>0</span></div><svg viewBox="0 0 600 150" role="img" aria-label={points.length ? `Risk history: ${points.map(p => p.score).join(', ')}` : 'No risk events yet'} preserveAspectRatio="none"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b3261e" stopOpacity=".18"/><stop offset="100%" stopColor="#b3261e" stopOpacity="0"/></linearGradient></defs>{[20, 75, 130].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#ddd7cb" strokeDasharray="4 5" />)}<line x1="0" y1="36.5" x2="600" y2="36.5" stroke="#b3261e" strokeOpacity=".25" strokeDasharray="3 4"/>{points.length > 0 && <><polygon points={`0,145 ${path} ${points.length === 1 ? 0 : 600},145`} fill="url(#chart-fill)"/><polyline points={path} fill="none" stroke="#b3261e" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/><circle cx={points.length === 1 ? 0 : 600} cy={130 - points[points.length - 1].score * 1.1} r="4" fill="#b3261e"/></>}</svg><div className="chart-times"><span>{points[0] ? time(points[0].at) : 'Waiting for activity'}</span><span>{points.length ? 'LATEST' : 'RECENT ACTIVITY'}</span></div></div>;
}
export function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return <span className="countdown">{String(Math.floor(seconds / 3600)).padStart(2, '0')}:{String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span>;
}
export function PaymentStatus({ payment }: { payment: Payment }) { return <Badge tone={payment.status === 'held' ? 'red' : payment.status === 'denied' ? 'green' : payment.status === 'review' ? 'amber' : 'neutral'}>{payment.status === 'denied' ? 'HEIST FOILED' : payment.status === 'released' ? 'REQUEST REVIEWED' : payment.status === 'held' ? 'PAYMENT HELD' : 'NEEDS REVIEW'}</Badge>; }
export function Confirm({ open, title, children, action, label, onClose }: { open: boolean; title: string; children: React.ReactNode; action: () => Promise<void>; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && !ref.current?.open) ref.current?.showModal(); else if (!open && ref.current?.open) ref.current?.close(); }, [open]);
  return <dialog className="confirm-dialog" ref={ref} onCancel={onClose} onClose={onClose}><button className="icon-button dialog-close" aria-label="Close confirmation" onClick={onClose}><X size={20}/></button><h2>{title}</h2><div>{children}</div><div className="button-row"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy} onClick={async () => { setBusy(true); try { await action(); onClose(); } catch { /* Global error stays visible. */ } finally { setBusy(false); } }}>{busy ? 'Working…' : label}<Check size={16}/></button></div></dialog>;
}
export function ViewLink({ href, children }: { href: string; children: React.ReactNode }) { return <a className="text-link" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={15}/></a>; }
