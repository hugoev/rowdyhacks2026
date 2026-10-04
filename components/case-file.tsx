'use client';
import { useEffect, useState } from 'react';
import type { CaseFile as File } from '@/lib/types';
import { money, useDemo } from './use-demo';

const pad = (n: number) => String(n).padStart(3, '0');
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * The family's view of what happened, styled as a heist case file.
 * /case/latest follows the live demo (the big monitor); /case/:id is fixed.
 */
export function CaseFileView({ id }: { id: string }) {
  const { state } = useDemo();
  const [fixed, setFixed] = useState<File | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (id === 'latest') return;
    void fetch(`/api/case/${encodeURIComponent(id)}`).then(async r => { if (r.ok) setFixed(await r.json()); else setMissing(true); });
  }, [id]);
  const file = id === 'latest' ? state?.caseFile ?? null : fixed;
  if (!file) return <main className="case-page waiting">
    <div className="case-wait"><p className="stamp-small">TRIPWIRE · FAMILY CASE FILES</p><h1>{missing ? 'No such file.' : 'Waiting for the next job…'}</h1><p>{missing ? 'Case files live in this demo session.' : 'When Tripwire stops a payment, the file Rosa’s family gets appears here.'}</p></div>
  </main>;
  const foiled = file.outcome === 'foiled';
  const rows: [string, React.ReactNode][] = [
    ['The mark', file.mark],
    ['The inside man', file.impersonated],
    ['The pressure', file.pressure.length ? file.pressure.map(q => `“${q}”`).join(', ') : '—'],
    ['The cover', file.cover ? `“${file.cover}”` : '—'],
    ['The getaway', file.getaway],
    ['Foiled by', file.foiledBy || '—'],
    ['Time to stop', clock(file.secondsToStop)],
  ];
  return <main className="case-page">
    <div key={file.id} className="laser-reveal" aria-hidden/>
    <article className="case-file">
      <div className="case-tab">TRIPWIRE · FAMILY COPY</div>
      <header>
        <h1>FILE {pad(file.number)} <span>//</span> {file.jobName.toUpperCase()}</h1>
        <div className={'stamp ' + (foiled ? 'foiled' : 'released')}>{foiled ? 'FOILED' : 'VERIFIED'}</div>
      </header>
      <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="case-tip"><span>NEXT TIME</span>{file.tip}</p>
      <footer>
        <span>{money(file.amount)} · {file.multiple}x her usual · {new Date(file.at).toLocaleString()}</span>
        <span>Written by {file.writtenBy === 'gemini' ? 'Gemini from the real conversation' : 'Tripwire rules (teller offline)'} · {file.stored === 'tiger' ? 'saved in Tiger Data' : 'not yet saved to Tiger Data'}</span>
      </footer>
    </article>
  </main>;
}
