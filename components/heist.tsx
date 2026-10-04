'use client';
import { useEffect, useState } from 'react';
import { leverLabels, levers } from '@/lib/levers';
import type { CallState, CaseFile, EvalSummary, Lever, Signal, ToolLog } from '@/lib/types';

/** mm:ss.mmm since call start, surveillance-log style. */
export function stamp(at: number, start: number | null) {
  const ms = Math.max(0, at - (start ?? at));
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
export function bestSignal(signals: Signal[], lever: Lever) {
  return signals.find(s => s.lever === lever && s.source === 'gemini') || signals.find(s => s.lever === lever);
}

/** The Con Meter: four vault tumblers plus payment pressure. Each clicks in with the caller's quote. */
export function ConMeter({ call, compact = false }: { call: CallState; compact?: boolean }) {
  return <div className={'con-meter' + (compact ? ' compact' : '')} role="list" aria-label="Con Meter">
    {levers.map(lever => {
      const signal = bestSignal(call.signals, lever);
      const red = lever === 'trust' && call.safeWord === 'failed';
      return <div key={signal?.id || lever} role="listitem" className={'tumbler' + (signal ? ' lit' : '') + (red ? ' red' : '')} data-lever={lever}>
        <div className="tumbler-dial" aria-hidden="true"><span/></div>
        <div className="tumbler-copy">
          <strong>{leverLabels[lever]}</strong>
          {signal ? <q>{signal.quote}</q> : <span className="tumbler-wait">listening…</span>}
          {signal && <small>{signal.source === 'rule' ? 'RULE' : 'GEMINI'}{signal.latencyMs !== null ? ` · ${signal.latencyMs} ms` : ''}{signal.source === 'gemini' ? ` · ${Math.round(signal.confidence * 100)}%` : ''}</small>}
        </div>
      </div>;
    })}
  </div>;
}

export function ToolTimeline({ tools, start }: { tools: ToolLog[]; start: number | null }) {
  return <ol className="tool-log" aria-label="Agent tool calls">
    {tools.length ? [...tools].reverse().slice(0, 40).map(t => <li key={t.id} className={'tool-' + t.source}>
      <time>{stamp(t.at, start)}</time><code>{t.name}</code><span>{t.detail}</span><em>{t.latencyMs !== null ? `${t.latencyMs} ms` : t.source === 'rule' ? 'rule' : ''}</em>
    </li>) : <li className="tool-empty"><span>Surveillance log is quiet. Waiting for the call.</span></li>}
  </ol>;
}

export function CaseFileCard({ file, start }: { file: CaseFile; start?: number | null }) {
  return <article className="kraft-file">
    <div className="kraft-tab">CASE FILE · {file.outcome === 'foiled' ? 'HEIST FOILED' : file.outcome.toUpperCase()}</div>
    <h3>{file.title}</h3>
    <p className="kraft-summary">{file.summary || file.education?.whatHappened || 'Tripwire paused this payment and asked the family.'}</p>
    {file.levers?.length ? <ul className="kraft-levers">{file.levers.map(l => <li key={l.lever}><b>{leverLabels[l.lever]}</b><q>{l.quote}</q>{l.at !== null && <time>{stamp((start ?? 0) + l.at, start ?? 0)}</time>}</li>)}</ul> : null}
    {file.lesson && <p className="kraft-lesson"><span>LESSON</span>{file.lesson}</p>}
    <p className="kraft-foot">You did nothing wrong. These callers are professionals.{file.closedBy && <> · written by {file.closedBy === 'gemini' ? 'Gemini' : 'Tripwire rules'}</>}</p>
    {file.outcome === 'foiled' && <div className="foiled-stamp">HEIST FOILED</div>}
  </article>;
}

export function EvalCard({ summary }: { summary: EvalSummary | null | undefined }) {
  if (!summary) return <section className="eval-card pending"><h3>Red-team results</h3><p>No measured run yet. Run <code>npm run eval:live</code>; only real numbers appear here.</p></section>;
  const rate = summary.scams ? Math.round(summary.caught / summary.scams * 100) : 0;
  return <section className="eval-card"><h3>Red-teamed with {summary.total} AI scam and normal calls</h3>
    <p>{summary.scamTypes} scam types · {summary.languages.map(l => l === 'es' ? 'Spanish' : 'English').join(' and ')}</p>
    <div className="eval-stats"><div><strong>{rate}%</strong><span>of {summary.scams} scams caught</span></div><div><strong>{summary.falseAlarms}</strong><span>false alarms in {summary.benign} normal calls</span></div><div><strong>{summary.medianFirstFlagMs !== null ? (summary.medianFirstFlagMs / 1000).toFixed(1) + ' s' : '—'}</strong><span>median to first flag</span></div></div>
    <small>{summary.model} · measured {new Date(summary.ranAt).toLocaleString()}</small>
  </section>;
}

/** Red laser sweep + vault slam on every screen when Diego taps "Not me". */
export function HeistFoiled({ at, label = 'HEIST FOILED' }: { at: number | null | undefined; label?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!at || Date.now() - at > 15000) return;
    setShow(true); const timer = setTimeout(() => setShow(false), 4200); return () => clearTimeout(timer);
  }, [at]);
  if (!show) return null;
  return <div className="foiled-overlay" role="status" aria-live="assertive"><div className="laser-beam"/><div className="vault-slam"><span>{label}</span></div></div>;
}
