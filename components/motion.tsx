'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useTripwire } from './context';
import type { PublicState } from '@/lib/types';

const MotionContext = createContext<ReadonlySet<string>>(new Set());
export const useArrival = (id: string) => useContext(MotionContext).has(id);
function snapshot(state: PublicState) {
  return new Set([
    ...state.events.map(event => `event:${event.id}`),
    ...state.call.assessment.tells.map(tell => `tell:${state.call.id}:${tell.id}`),
    ...state.payments.filter(payment => payment.status === 'denied' || (payment.status === 'held' && (!payment.escrow || payment.escrow.state === 'held'))).map(payment => `payment:${payment.id}:${payment.status}`),
    ...(state.call.alert?.reply ? [`alert:${state.call.alert.id}:${state.call.alert.reply}`] : []),
  ]);
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const { state, online, role } = useTripwire();
  const seen = useRef<Set<string> | null>(null);
  const connected = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [arrivals, setArrivals] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!state) return;
    const current = snapshot(state);
    // Initial loads and reconnect snapshots establish a baseline, never a replay.
    const added = seen.current && online && connected.current ? [...current].filter(id => !seen.current!.has(id)) : [];
    seen.current = new Set([...(seen.current || []), ...current]);
    connected.current = online;
    if (!added.length) return;
    setArrivals(previous => new Set([...previous, ...added]));
    const timer = setTimeout(() => {
      setArrivals(previous => new Set([...previous].filter(id => !added.includes(id))));
      timers.current = timers.current.filter(value => value !== timer);
    }, 950);
    timers.current.push(timer);
  }, [state, online]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const held = [...arrivals].filter(id => id.startsWith('payment:') && id.endsWith(':held'));
  return <MotionContext.Provider value={arrivals}>{held.map(id => <div key={id} className={`laser-sweep ${role === 'protected' ? 'calm' : ''}`} aria-hidden="true"/>)}{children}</MotionContext.Provider>;
}

export function Arrival({ id, className = '', children, role }: { id: string; className?: string; children: React.ReactNode; role?: React.AriaRole }) {
  const arrived = useArrival(id);
  return <div role={role} className={`${className}${arrived ? ' evidence-arrival' : ''}`}>{children}</div>;
}
