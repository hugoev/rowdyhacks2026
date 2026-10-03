'use client';
import { useState } from 'react';
import { useTripwire } from './context';
import { Confirm, ViewLink } from './ui';

export function Presenter({ children }: { children?: React.ReactNode }) {
  const { state, request } = useTripwire();
  const [reset, setReset] = useState(false);
  if (!state?.config.demo) return null;
  return <><details className="presenter-drawer"><summary>Presenter controls</summary><div className="presenter-content">{children}<nav aria-label="Demo views"><ViewLink href="/protected">Rosa</ViewLink><ViewLink href="/guardian">Guardian</ViewLink><ViewLink href="/relative">Relative</ViewLink></nav><p>Scripted scenarios and simulated payments. No financial accounts are linked.</p><button className="button secondary" onClick={() => setReset(true)}>Reset demo</button></div></details><Confirm open={reset} title="Start with a clean caseboard?" label="Reset demo" onClose={() => setReset(false)} action={async () => { await request('/demo/reset'); }}><p>This clears demo calls, payments, and case files. Your family safe word stays configured.</p></Confirm></>;
}
