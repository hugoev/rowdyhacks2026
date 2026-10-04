'use client';
import { useState } from 'react';
import { useTripwire } from './context';
import { Confirm, ViewLink } from './ui';

export function Presenter({ children }: { children?: React.ReactNode }) {
  const { state, request } = useTripwire();
  const [reset, setReset] = useState(false);
  if (!state?.config.demo) return null;
  return <><details className="presenter-drawer"><summary>Operator</summary><div className="presenter-content">{children}<nav aria-label="Family views"><ViewLink href="/protected">Rosa</ViewLink><ViewLink href="/guardian">Mission Control</ViewLink><ViewLink href="/relative">Diego</ViewLink><ViewLink href="/stage">Stage</ViewLink></nav><p>Operator controls are hidden from Rosa’s screen. Payments are simulated.</p><button className="button secondary" onClick={() => setReset(true)}>Clear activity</button></div></details><Confirm open={reset} title="Clear recent activity?" label="Clear activity" onClose={() => setReset(false)} action={async () => { await request('/demo/reset'); }}><p>This removes recent calls, payment requests, and case files. Your family safe word stays configured.</p></Confirm></>;
}
