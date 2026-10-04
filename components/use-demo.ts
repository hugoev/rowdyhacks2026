'use client';
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DemoState } from '@/lib/types';

const DemoContext = createContext<{ state: DemoState | null; online: boolean } | null>(null);

/** Share one event stream across all embedded panels so HTTP requests retain a connection. */
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState | null>(null);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let source: EventSource | null = null; let retry: ReturnType<typeof setTimeout> | undefined; let closed = false;
    const connect = () => {
      source = new EventSource('/api/events');
      source.onopen = () => setOnline(true);
      source.onmessage = event => setState(JSON.parse(event.data));
      source.onerror = () => { setOnline(false); source?.close(); if (!closed) retry = setTimeout(connect, 1000); };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); source?.close(); };
  }, []);
  return createElement(DemoContext.Provider, { value: { state, online } }, children);
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error('Demo views must be inside DemoProvider.');
  return value;
}

export async function api<T = unknown>(path: string, body: unknown = {}, operatorKey?: string): Promise<T> {
  const response = await fetch('/api' + path, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-tripwire-client': 'web', ...(operatorKey ? { 'x-operator-key': operatorKey } : {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result as T;
}

export const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
