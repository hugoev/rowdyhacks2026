'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceConversation } from '@elevenlabs/client';
import { Phone, PhoneOff, ShieldCheck } from 'lucide-react';
import { scammerOpening } from '@/lib/scammer-config';
import { TellerSession, type Grant } from '@/lib/teller-session';
import type { VerifyStatus, Who } from '@/lib/types';
import { api, useDemo } from './use-demo';

/**
 * "Rosa's phone" or "Diego's phone": a teammate's real phone with this page
 * open. When the server rings it, it shows a full-screen incoming call; Answer
 * starts the ElevenLabs agent (the scammer for Rosa, the verifier for Diego)
 * on speaker. No telephony: to the judges it looks and sounds like a call.
 */
export function PhoneCall({ who, embedded = false }: { who: Who; embedded?: boolean }) {
  const { state, online } = useDemo();
  // Embedded in /demo, the page's Start tap already unlocked audio.
  const [ready, setReady] = useState(embedded);
  const [inCall, setInCall] = useState<{ id: string; since: number; caller: string } | null>(null);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [ending, setEnding] = useState(false);
  const conversation = useRef<VoiceConversation | null>(null);
  const scammer = useRef<TellerSession | null>(null);
  const reported = useRef(0);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ringtone = useRingtone();
  const setSpeakingFrom = (call: TellerSession) => {
    const tick = setInterval(() => { if (scammer.current !== call) { clearInterval(tick); return; } setSpeaking(call.player.speaking); }, 200);
  };
  const ring = state?.ring?.who === who ? state.ring : null;
  const incoming = !!ring && ring.status === 'ringing' && !inCall;

  useEffect(() => { if (ready && incoming) ringtone.start(); else ringtone.stop(); }, [ready, incoming, ringtone]);

  const hangUp = useCallback(async () => {
    const current = conversation.current; conversation.current = null;
    const caller = scammer.current; scammer.current = null;
    if (caller) { setEnding(true); await caller.endGracefully({ max: 5000 }); setEnding(false); }
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
      // The scam call is a Gemini Live voice (stock voice, no clone); ElevenLabs'
      // safety review blocks scam-impersonation agents. The verifier stays on ElevenLabs.
      if (ring.agent === 'scammer') {
        const grant = await api<Grant>('/scammer/token', { id });
        const call = new TellerSession({
          grant: () => api<Grant>('/scammer/token', { id }),
          // The caller hangs up itself once its sign-off has played (end_call, or the
          // sign-off words in its own transcript, since audio models rarely call tools).
          tool: async name => { if (name === 'end_call') setTimeout(() => { if (scammer.current === call) void hangUp(); }, 0); return { ok: true }; },
          caption: (who, text, done) => {
            if (who === 'teller' && done && /call you (right )?back|love you,? grandma|te (vuelvo a )?llam/i.test(text)) setTimeout(() => { if (scammer.current === call) void hangUp(); }, 0);
          },
          status: next => { if (next === 'failed') setError('The scam call dropped. Ring again.'); },
        });
        // Backstop: a real scam call is short; end it at 50 s (after the current sentence).
        setTimeout(() => { if (scammer.current === call) void hangUp(); }, 50000);
        scammer.current = call;
        setSpeakingFrom(call);
        await call.start(grant, scammerOpening);
        return;
      }
      const { signedUrl, variables } = await api<{ signedUrl: string; variables: Record<string, string> }>('/agent/session', { id });
      conversation.current = await VoiceConversation.startSession({
        signedUrl, connectionType: 'websocket',
        dynamicVariables: variables,
        ...(ring.agent === 'verifier' ? { clientTools: {
          // The verifier reports back as soon as it knows; the teller speaks it mid-conversation.
          report_result: async (params: { status?: string; note?: string }) => {
            const status = (['not_me', 'confirmed', 'no_answer'].includes(params.status || '') ? params.status : 'no_answer') as VerifyStatus;
            await api('/result', { id, status, note: String(params.note || '').slice(0, 300) });
            // Turn-taking: let the verifier finish its thank-you (it usually ends the call
            // itself), then hang up so the teller can speak. Never mid-sentence.
            reported.current = Date.now();
            setTimeout(() => { if (conversation.current && reported.current) void hangUp(); }, 15000);
            return 'Result delivered to Tripwire. Thank them in one short sentence and end the call.';
          },
        } } : {}),
        onModeChange: ({ mode }) => {
          setSpeaking(mode === 'speaking');
          clearTimeout(quietTimer.current);
          // After reporting, the first pause after its closing words ends the call.
          if (reported.current && mode !== 'speaking') quietTimer.current = setTimeout(() => { if (conversation.current) void hangUp(); }, 1500);
        },
        onDisconnect: () => { conversation.current = null; reported.current = 0; clearTimeout(quietTimer.current); void api('/ring/status', { id, status: 'ended' }).catch(() => {}); setInCall(null); setSpeaking(false); },
        onError: message => setError(String(message)),
      });
    } catch (e) {
      setError((e as Error).message + ' The operator can use FORCE RESULT.');
      void api('/ring/status', { id, status: 'ended' }).catch(() => {}); setInCall(null);
    }
  }
  const name = who === 'rosa' ? 'Rosa' : 'Diego';
  const page = 'call-page' + (embedded ? ' embedded' : '');
  if (!ready) return <main className="call-page idle">
    <p className="call-owner">{name}’s phone</p>
    <button className="big primary" onClick={() => void unlock()}>Ready</button>
    <p className="muted">Tap once to allow sound and the microphone. Keep this page open, speaker on.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <p className="conn">{online ? '● connected' : '○ connecting…'}</p>
  </main>;
  if (inCall) return <main className={page + ' active' + (speaking ? ' speaking' : '')}>
    <p className="call-owner">{name}’s phone</p>
    <div className="caller-avatar" aria-hidden>{inCall.caller.startsWith('Tripwire') ? <ShieldCheck size={56}/> : inCall.caller[0]}</div>
    <h1>{inCall.caller}</h1>
    <p className="call-timer">{ending ? 'Ending call…' : <Timer since={inCall.since}/>}</p>
    <button className="round decline" aria-label="Hang up" disabled={ending} onClick={() => void hangUp()}><PhoneOff size={34}/></button>
    {error && <p className="error" role="alert">{error}</p>}
  </main>;
  if (incoming && ring) return <main className={page + ' ringing'} aria-live="assertive">
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
  return <main className={page + ' idle'}>
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
