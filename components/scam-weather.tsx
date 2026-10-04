'use client';
import { useEffect, useState } from 'react';
import { CloudSun, RefreshCw } from 'lucide-react';
import type { ScamWeatherReport } from '@/lib/scam-weather';
import { useTripwire, headers } from './context';
import { Badge } from './ui';
import styles from './scam-weather.module.css';

const colors = ['#aa332b', '#d18136', '#647c88', '#8a6684', '#627d4f', '#b69b55'];
const yLabels = [0, 20, 40, 60, 80];
export function ScamWeather() {
  const { role } = useTripwire(); const [report, setReport] = useState<ScamWeatherReport | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetch('/api/scam-weather', { headers: headers(role), cache: 'no-store' }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Scam Weather is unavailable.');
      if (active) setReport(body);
    }).catch(reason => { if (active) setError((reason as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role]);
  const max = Math.max(80, ...(report?.days.map(day => day.total) || [])); const scale = 176 / max;
  return <div className={styles.wrap}>
    <div className={styles.intro}><p className="eyebrow">COMMUNITY SIGNALS / SAN ANTONIO</p><h1>Scam Weather<span>.</span></h1><p>See the kinds of pressure the community should watch for, without collecting anyone’s identity, conversation, or payment details.</p></div>
    {loading ? <section className={styles.panel} role="status">Loading the 30-day report…</section> : error ? <section className={styles.panel} role="alert"><p>{error}</p><button className="button secondary" onClick={() => window.location.reload()}><RefreshCw size={15}/>Try again</button></section> : report && <>
      <div className={styles.banner}><CloudSun size={21}/><div><strong>SAMPLE DATA · NOT INCIDENT REPORTS</strong>These illustrative 30-day San Antonio figures are generated, not measured community activity or an estimate of actual incidents. No personal reports are collected.</div></div>
      <section className={styles.panel}>
        <div className="section-title"><h2><span>30</span>Days of scam patterns</h2><Badge tone="outline">{report.source === 'tiger-seeded-demo' ? 'TIGER DATA' : 'SAMPLE ARCHIVE'}</Badge></div>
        <div className={styles.chart}><svg viewBox="0 0 930 250" role="img" aria-label="Stacked column chart of synthetic scam report counts by scam type for the past 30 days">
          {yLabels.map(label => { const y = 212 - label * scale; return <g key={label}><line x1="42" x2="916" y1={y} y2={y} stroke="#ddd5c8" strokeDasharray="4 5"/><text x="34" y={y + 4} textAnchor="end" fill="#786f63" fontSize="11">{label}</text></g>; })}
          {report.days.map((day, index) => {
            let heightUsed = 0; const x = 50 + index * 28.5;
            return <g key={day.date}>{day.byType.map(item => { const height = item.count * scale; const y = 212 - heightUsed - height; heightUsed += height; return <rect key={item.type} x={x} y={y} width="17" height={height} fill={colors[report.days[0].byType.findIndex(type => type.type === item.type)]} rx="1"><title>{`${day.date} · ${item.type} · ${item.count} seeded reports`}</title></rect>; })}<text x={x + 8} y="231" textAnchor="middle" fill="#786f63" fontSize="8">{index % 5 === 0 ? day.date.slice(5) : ''}</text></g>;
          })}
        </svg></div>
        <div className={styles.legend}>{report.totals.map((item, index) => <span key={item.type}><i className={styles.swatch} style={{ background: colors[index] }}/>{item.type}</span>)}</div>
        <div className={styles.totals}>{report.totals.map(item => <div className={styles.total} key={item.type}><strong>{item.count}</strong><span>{item.type}</span></div>)}</div>
        <p className={styles.fine}>Source: generated sample counts. “Reports” here are not complaints, verified cases, or measured community activity.</p>
      </section>
    </>}
  </div>;
}
