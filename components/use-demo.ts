'use client';
import { useEffect, useState } from 'react';
import type { DemoState } from '@/lib/types';

/** Live demo state from the server (SSE), reconnecting automatically. */
export function useDemo() {
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
  return { state, online };
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
