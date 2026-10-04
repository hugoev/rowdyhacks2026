'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { BrandMark } from './brand-mark';
import type { PublicState, Role } from '@/lib/types';

type Context = { state: PublicState | null; role: Role; online: boolean; error: string; setError: (error: string) => void; request: <T = unknown>(path: string, body?: unknown) => Promise<T>; refresh: () => Promise<void> };
const AppContext = createContext<Context | null>(null);
export const useTripwire = () => { const context = useContext(AppContext); if (!context) throw new Error('Missing Tripwire provider'); return context; };
export function headers(role: Role) { return { 'Content-Type': 'application/json', 'x-tripwire-client': 'web', 'x-tripwire-role': role }; }
export function Provider({ role, children }: { role: Role; children: React.ReactNode }) {
  const [state, setState] = useState<PublicState | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [ready, setReady] = useState(false);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/state', { headers: headers(role), cache: 'no-store' });
    if (response.status === 401) { setNeedsCode(true); throw new Error('Connect this family view to continue.'); }
    const body = await response.json(); if (!response.ok) throw new Error(body.error);
    if (alive.current) setState(body);
  }, [role]);
  const connect = useCallback(async (code = '') => {
    const response = await fetch('/api/session', { method: 'POST', headers: headers(role), body: JSON.stringify({ role, accessCode: code }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    setNeedsCode(false); setError(''); await refresh(); setReady(true);
  }, [role, refresh]);
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const response = await fetch('/api/config'); const config = await response.json();
        if (config.demo) await connect();
        else { try { await refresh(); setReady(true); } catch { setNeedsCode(true); } }
      } catch (e) { setError((e as Error).message); }
    })();
    return () => { alive.current = false; };
  }, [connect, refresh]);
  useEffect(() => {
    if (!ready) return;
    const socket = io({ auth: { role }, withCredentials: true });
    socket.on('connect', () => {
      if (role === 'protected') void refresh().then(() => { if (socket.connected) setOnline(true); }).catch(() => setOnline(false));
      else { setOnline(true); void refresh().catch(() => {}); }
    });
    socket.on('disconnect', () => setOnline(false));
    socket.on('connect_error', () => setOnline(false));
    socket.on('state', (snapshot: PublicState) => setState(snapshot));
    // Reconnect fallback also keeps timers and other-device actions in sync.
    const poll = setInterval(() => void refresh().catch(() => setOnline(false)), 5000);
    return () => { socket.disconnect(); clearInterval(poll); };
  }, [ready, role, refresh]);
  const request = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    setError('');
    const response = await fetch('/api' + path, { method: 'POST', headers: headers(role), body: JSON.stringify(body || {}) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || 'That action could not be completed.'); throw new Error(result.error); }
    await refresh(); return result as T;
  }, [role, refresh]);
  return <AppContext.Provider value={{ state, role, online, error, setError, request, refresh }}>
    {needsCode ? <main className="access-screen"><div className="access-card"><BrandMark/><p className="eyebrow">YOUR FAMILY’S COUNTER-HEIST CREW</p><h1>Connect your {role} view.</h1><p>Enter the access code provided by the person hosting your family’s Tripwire.</p><form onSubmit={e => { e.preventDefault(); void connect(accessCode).catch(e => setError(e.message)); }}><label>Access code<input type="password" value={accessCode} onChange={e => setAccessCode(e.target.value)} required autoComplete="current-password" /></label><button className="button primary">Connect securely</button></form>{error && <p role="alert" className="error-text">{error}</p>}</div></main> : children}
  </AppContext.Provider>;
}
