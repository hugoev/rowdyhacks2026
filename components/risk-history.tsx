'use client';
import { useState } from 'react';
import type { RiskEvent } from '@/lib/types';
import { useTripwire } from './context';

export function RiskHistoryControl({ events, render }: { events: RiskEvent[]; render: (points: RiskEvent[]) => React.ReactNode }) {
  const { state } = useTripwire();
  const [mode, setMode] = useState<'live' | 'minute'>('live');
  const history = state?.riskHistory;
  const status = state?.config.analytics;
  const cloud = history?.source === 'tiger';
  const points: RiskEvent[] = cloud && mode === 'minute' ? history.minutes.map(bucket => ({ id: String(bucket.at), at: bucket.at, score: bucket.peak, kind: 'system', label: 'One-minute peak risk' })) : cloud ? history.points : events;
  return <>
    {status && status.state !== 'unconfigured' && <div className="risk-history-control"><span className={'badge ' + (cloud ? 'green' : 'amber')}>{cloud ? 'TIGER DATA' : 'LOCAL HISTORY'}</span><div className="risk-history-tabs" aria-label="Risk chart interval"><button type="button" aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Recent events</button><button type="button" aria-pressed={mode === 'minute'} disabled={!cloud} onClick={() => setMode('minute')}>1-minute peaks</button></div></div>}
    {render(points)}
    {cloud && <p className="analytics-note">{history.total} events across recent minute buckets · Peak risk {history.peak}/100 · {history.minutes.length} minute buckets</p>}
    {status?.state === 'degraded' && <p className="analytics-note">Cloud history is temporarily unavailable. {status.pendingEvents} events queued locally for retry.</p>}
  </>;
}
