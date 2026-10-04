'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceConversation } from '@elevenlabs/client';
import { Phone, PhoneOff, ShieldCheck } from 'lucide-react';
import { coachLine, scammerPrompt } from '@/lib/phone-agents';
import type { VerifyStatus, Who } from '@/lib/types';
import { api, useDemo } from './use-demo';

/**
 * "Rosa's phone" or "Diego's phone": a teammate's real phone with this page
 * open. When the server rings it, it shows a full-screen incoming call; Answer
 * starts the ElevenLabs agent (the scammer for Rosa, the verifier for Diego)
 * on speaker. No telephony: to the judges it looks and sounds like a call.
 */
export function PhoneCall({ who }: { who: Who }) {
  const { state, online } = useDemo();
  const [ready, setReady] = useState(false);
  const [inCall, setInCall] = useState<{ id: string; since: number; caller: string } | null>(null);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const conversation = useRef<VoiceConversation | null>(null);
  const ringtone = useRingtone();
  const ring = state?.ring?.who === who ? state.ring : null;
  const incoming = !!ring && ring.status === 'ringing' && !inCall;

  useEffect(() => { if (ready && incoming) ringtone.start(); else ringtone.stop(); }, [ready, incoming, ringtone]);

  const hangUp = useCallback(async () => {
    const current = conversation.current; conversation.current = null;
    await current?.endSession().catch(() => {});
    setInCall(prev => { if (prev) void api('/ring/status', { id: prev.id, status: 'ended' }).catch(() => {}); return null; });
    setSpeaking(false);
  }, []);
  // RESET (or a new ring) ends whatever call this phone was on.
  useEffect(() => { if (inCall && (!state?.ring || state.ring.id !== inCall.id || state.ring.status === 'ended')) void hangUp(); }, [state?.ring, inCall, hangUp]);

  async function unlock() {
    // One tap unlocks audio and the mic so later calls can start instantly.
    try {
      const context = new AudioContext(); await context.resume(); void context.close();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(t => t.stop());
      setReady(true); setError('');
    } catch { setError('Allow the microphone (HTTPS is required on phones), then tap Ready again.'); }
  }
  async function answer() {
    if (!ring) return;
    ringtone.stop(); setError('');
    const id = ring.id;
    setInCall({ id, since: Date.now(), caller: ring.callerName });
    try {
      await api('/ring/status', { id, status: 'answered' });
      const { signedUrl, variables } = await api<{ signedUrl: string; variables: Record<string, string> }>('/agent/session', { id });
      conversation.current = await VoiceConversation.startSession({
        signedUrl, connectionType: 'websocket',
        ...(ring.agent === 'verifier' ? { dynamicVariables: variables } : variables.coach ? { overrides: { agent: { prompt: { prompt: `${scammerPrompt}\n${coachLine}` } } } } : {}),
        ...(ring.agent === 'verifier' ? { clientTools: {
          // The verifier reports back as soon as it knows; the teller speaks it mid-conversation.
          report_result: async (params: { status?: string; note?: string }) => {
            const status = (['not_me', 'confirmed', 'no_answer'].includes(params.status || '') ? params.status : 'no_answer') as VerifyStatus;
            await api('/result', { id, status, note: String(params.note || '').slice(0, 300) });
            return 'Result delivered to Tripwire.';
          },
        } } : {}),
        onModeChange: ({ mode }) => setSpeaking(mode === 'speaking'),
        onDisconnect: () => { conversation.current = null; void api('/ring/status', { id, status: 'ended' }).catch(() => {}); setInCall(null); setSpeaking(false); },
        onError: message => setError(String(message)),
      });
    } catch (e) {
      setError((e as Error).message + ' The operator can use FORCE RESULT.');
      void api('/ring/status', { id, status: 'ended' }).catch(() => {}); setInCall(null);
    }
  }
  const name = who === 'rosa' ? 'Rosa' : 'Diego';
  if (!ready) return <main className="call-page idle">
    <p className="call-owner">{name}’s phone</p>
    <button className="big primary" onClick={() => void unlock()}>Ready</button>
    <p className="muted">Tap once to allow sound and the microphone. Keep this page open, speaker on.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="conn">{online ? '● connected' : '○ connecting…'}</p>
  </main>;
  if (inCall) return <main className={'call-page active' + (speaking ? ' speaking' : '')}>
    <p className="call-owner">{name}’s phone</p>
    <div className="caller-avatar" aria-hidden>{inCall.caller.startsWith('Tripwire') ? <ShieldCheck size={56}/> : inCall.caller[0]}</div>
    <h1>{inCall.caller}</h1>
    <p className="call-timer"><Timer since={inCall.since}/></p>
    <button className="round decline" aria-label="Hang up" onClick={() => void hangUp()}><PhoneOff size={34}/></button>
    {error && <p className="error" role="alert">{error}</p>}
  </main>;
  if (incoming && ring) return <main className="call-page ringing" aria-live="assertive">
    <p className="call-owner">{name}’s phone</p>
    <p className="incoming-label">Incoming call</p>
    <div className="caller-avatar" aria-hidden>{ring.callerName.startsWith('Tripwire') ? <ShieldCheck size={56}/> : ring.callerName[0]}</div>
    <h1>{ring.callerName}</h1>
    <p className="muted">{ring.callerName.startsWith('Tripwire') ? 'Calling the number saved on Rosa’s account' : 'mobile'}</p>
    <div className="ring-actions">
      <button className="round decline" aria-label="Decline" onClick={() => void api('/ring/status', { id: ring.id, status: 'ended' })}><PhoneOff size={34}/></button>
      <button className="round accept" aria-label="Answer" onClick={() => void answer()}><Phone size={34}/></button>
    </div>
  </main>;
  return <main className="call-page idle">
    <p className="call-owner">{name}’s phone</p>
    <p className="clock"><Clock/></p>
    <p className="muted">Ready. Ringer on.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="conn">{online ? '● connected' : '○ connecting…'}</p>
  </main>;
}

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</>;
}
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const i = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(i); }, []);
  return <>{now?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>;
}

/** Classic two-tone ring (440 + 480 Hz, 2 s on / 4 s off) synthesized with WebAudio. */
function useRingtone() {
  const ref = useRef<{ context: AudioContext; timer: ReturnType<typeof setInterval> } | null>(null);
  const stop = useCallback(() => { if (!ref.current) return; clearInterval(ref.current.timer); void ref.current.context.close(); ref.current = null; if ('vibrate' in navigator) navigator.vibrate(0); }, []);
  const start = useCallback(() => {
    if (ref.current) return;
    const context = new AudioContext();
    const burst = () => {
      const t0 = context.currentTime; const gain = context.createGain(); gain.connect(context.destination);
      gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(0.18, t0 + 0.05); gain.gain.setValueAtTime(0.18, t0 + 1.9); gain.gain.linearRampToValueAtTime(0, t0 + 2);
      for (const f of [440, 480]) { const o = context.createOscillator(); o.frequency.value = f; o.connect(gain); o.start(t0); o.stop(t0 + 2); }
      if ('vibrate' in navigator) navigator.vibrate([800, 400, 800]);
    };
    burst(); ref.current = { context, timer: setInterval(burst, 4000) };
  }, []);
  useEffect(() => stop, [stop]);
  return { start, stop };
}
