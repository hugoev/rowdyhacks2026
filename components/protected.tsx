'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CreditCard, Headphones, KeyRound, LockKeyhole, Mic, Phone, PhoneOff, Play, Radio, ShieldCheck, Volume2 } from 'lucide-react';
import { scenarios } from '@/lib/scenarios';
import type { Payment, Rail } from '@/lib/types';
import { LiveTranscription } from '@/lib/live-transcription';
import { connectScribe } from './scribe';
import { headers, useTripwire } from './context';
import { Badge, Countdown, money, PaymentStatus, time, ViewLink } from './ui';
import { EscrowStatus } from './escrow-status';

type RecognitionEvent = { resultIndex: number; results: { length: number; [key: number]: { isFinal: boolean; 0: { transcript: string } } } };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: RecognitionEvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };

export function Protected() {
  const { state, request, setError, role } = useTripwire(); const s = state!;
  const [scenario, setScenario] = useState<keyof typeof scenarios>('grandson');
  const [lineIndex, setLineIndex] = useState(0);
  const [manual, setManual] = useState(''); const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState('');
  const [micMode, setMicMode] = useState<'elevenlabs' | 'browser' | null>(null);
  const [micNotice, setMicNotice] = useState('');
  const live = useRef<LiveTranscription | null>(null);
  const mounted = useRef(true);
  const microphoneGeneration = useRef(0);
  const playbackGeneration = useRef(0);
  const finishPlayback = useRef<(() => void) | null>(null);
  const audioUrl = useRef<string | null>(null);
  const [mic, setMic] = useState(false); const recognition = useRef<Recognition | null>(null);
  const [code, setCode] = useState(''); const [codeResult, setCodeResult] = useState<string | null>(null);
  const [voice, setVoice] = useState(true); const spoken = useRef<string | null>(null);
  const [payee, setPayee] = useState('Emergency gift cards'); const [amount, setAmount] = useState('2500'); const [rail, setRail] = useState<Rail>('gift-card'); const [newPayee, setNewPayee] = useState(true); const [pasted, setPasted] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const payment = s.payments.find(p => p.id === selectedPayment) || s.payments[0];
  const active = s.call.active; const assessment = s.call.assessment;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cancelAudio = useCallback(() => {
    playbackGeneration.current++;
    finishPlayback.current?.(); finishPlayback.current = null;
    audioRef.current?.pause(); audioRef.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current); audioUrl.current = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }, []);
  const say = useCallback(async (text: string) => {
    cancelAudio(); const generation = playbackGeneration.current;
    const capture = live.current;
    try { capture?.mute(); }
    catch { capture?.stop(); setMic(false); setMicNotice('Microphone paused for this warning. Choose Resume microphone afterward.'); }
    recognition.current?.stop();
    const browserVoice = async () => {
      if (!('speechSynthesis' in window)) throw new Error('Spoken warnings are unavailable. Read the warning on screen.');
      await new Promise<void>(resolve => {
        finishPlayback.current = resolve;
        const utterance = new SpeechSynthesisUtterance(text); utterance.rate = .88;
        utterance.onend = () => resolve(); utterance.onerror = () => { if (generation === playbackGeneration.current) setError('Browser voice could not play. Read the warning on screen.'); resolve(); };
        speechSynthesis.speak(utterance);
      });
    };
    try {
      if (!state?.config.elevenlabs) await browserVoice();
      else {
        try {
          const response = await fetch('/api/speak', { method: 'POST', headers: headers(role), body: JSON.stringify({ text }) });
          if (generation !== playbackGeneration.current) return;
          if (!response.ok || !response.headers.get('content-type')?.includes('audio')) throw new Error('Provider audio unavailable');
          const blob = await response.blob();
          if (generation !== playbackGeneration.current) return;
          const url = URL.createObjectURL(blob); audioUrl.current = url;
          const audio = new Audio(url); audioRef.current = audio;
          await new Promise<void>((resolve, reject) => {
            finishPlayback.current = resolve;
            audio.onended = () => resolve(); audio.onerror = () => reject(new Error('Audio playback failed'));
            void audio.play().catch(reject);
          });
        } catch {
          if (generation !== playbackGeneration.current) return;
          if (audioUrl.current) URL.revokeObjectURL(audioUrl.current); audioUrl.current = null;
          setMicNotice('ElevenLabs voice is unavailable. Using browser voice for this warning.');
          await browserVoice();
        }
      }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'Read the warning on screen.'); }
    finally {
      if (generation === playbackGeneration.current) {
        finishPlayback.current = null;
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current); audioUrl.current = null;
        try { capture?.unmute(); } catch { capture?.stop(); setMic(false); }
      }
    }
  }, [state?.config.elevenlabs, role, setError, cancelAudio]);
  useEffect(() => {
    if (voice && active && assessment.score >= 85 && spoken.current !== s.call.id) {
      spoken.current = s.call.id; void say('Let’s pause. ' + assessment.advice + ' You did nothing wrong.');
    }
  }, [active, assessment.score, assessment.advice, voice, s.call.id, say]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; microphoneGeneration.current++; recognition.current?.stop(); live.current?.stop(); cancelAudio(); };
  }, [cancelAudio]);
  useEffect(() => { if (!active) { microphoneGeneration.current++; recognition.current?.stop(); live.current?.stop(); setMic(false); setPartial(''); cancelAudio(); } }, [active, cancelAudio]);
  async function run(action: () => Promise<void>) { setBusy(true); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function startScript() {
    const { callId } = await request<{ callId: string }>('/call/start', { consent: true }); setLineIndex(1); setCodeResult(null);
    await request('/call/line', { callId, segmentId: crypto.randomUUID(), text: scenarios[scenario].lines[0], source: 'scripted' });
  }
  async function nextLine() {
    const text = scenarios[scenario].lines[lineIndex]; if (!text) return;
    await request('/call/line', { callId: s.call.id, segmentId: crypto.randomUUID(), text, source: 'scripted' }); setLineIndex(i => i + 1);
  }
  async function startMic(browserFallback = false) {
    const useElevenLabs = s.config.elevenlabs && !browserFallback;
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!useElevenLabs && !Constructor) throw new Error('Browser transcription is unavailable. Use Chrome, pasted text, or a scripted demo.');
    if (useElevenLabs && (!window.isSecureContext || !navigator.mediaDevices)) throw new Error('Live microphone capture requires HTTPS or localhost.');
    const generation = ++microphoneGeneration.current;
    let callId = s.call.id;
    if (!active) callId = (await request<{ callId: string }>('/call/start', { consent: true })).callId;
    if (!callId || !mounted.current) return;
    // Starting the server session changes active state; an old start must not attach to a newer call.
    const session = callId;
    setLineIndex(0); setMicNotice(''); recognition.current?.stop(); live.current?.stop();
    const submit = (text: string, source: 'browser' | 'elevenlabs') => {
      if (!mounted.current || generation !== microphoneGeneration.current) return;
      void request('/call/line', { callId: session, segmentId: crypto.randomUUID(), text, source }).catch(error => {
        if (!mounted.current || generation !== microphoneGeneration.current) return;
        live.current?.stop(); recognition.current?.stop(); setMic(false);
        setError(error instanceof Error ? error.message : 'Transcript submission failed. Use pasted text or resume the microphone.');
      });
    };
    if (useElevenLabs) {
      live.current = new LiveTranscription(connectScribe);
      const { token } = await request<{ token: string }>('/transcription/token', { callId: session });
      if (!mounted.current || generation !== microphoneGeneration.current) return;
      const interrupted = () => {
        if (!mounted.current || generation !== microphoneGeneration.current) return;
        setMic(false); setPartial(''); setMicNotice('ElevenLabs transcription stopped. Choose browser transcription, resume, or paste the caller’s words.');
        void request('/transcription/status', { callId: session, state: 'degraded' }).catch(error => setError(error.message));
      };
      try {
        await live.current.start(token, {
          ready: () => {
            if (!mounted.current || generation !== microphoneGeneration.current) return;
            setMicMode('elevenlabs'); setMic(true);
            void request('/transcription/status', { callId: session, state: 'working' }).catch(error => setError(error.message));
          },
          partial: text => { if (mounted.current && generation === microphoneGeneration.current) setPartial(text); },
          committed: text => { setPartial(''); submit(text, 'elevenlabs'); }, error: interrupted, closed: interrupted,
        });
      } catch (error) { if (mounted.current && generation === microphoneGeneration.current) setMicNotice('Live transcription could not start. Choose browser transcription or paste text.'); throw error; }
    } else if (Constructor) {
      const instance = new Constructor(); instance.continuous = true; instance.interimResults = false; instance.lang = 'en-US';
      instance.onresult = event => {
        for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) submit(event.results[i][0].transcript, 'browser');
      };
      instance.onerror = event => { if (mounted.current) { setMic(false); setError(`Browser transcription stopped (${event.error}). Use a scripted or pasted transcript.`); } };
      instance.onend = () => { if (mounted.current) setMic(false); };
      recognition.current = instance; instance.start(); setMicMode('browser'); setMic(true);
    }
  }
  async function endCall() { microphoneGeneration.current++; recognition.current?.stop(); live.current?.stop(); cancelAudio(); setMic(false); setPartial(''); await request('/call/end'); }
  function preset(normal: boolean) { setPayee(normal ? 'CPS Energy' : 'Emergency gift cards'); setAmount(normal ? '40' : '2500'); setRail(normal ? 'bill' : 'gift-card'); setNewPayee(!normal); setPasted(false); }
  return <>
    <div className="page-heading senior-heading"><div><p className="eyebrow">ROSA’S SHIELD</p><h1>You have backup, Rosa<span>.</span></h1><p>Take your time. We’ll check it together.</p></div><ViewLink href="/guardian">Open Elena’s guardian view</ViewLink></div>
    <div className="senior-grid"><div className="senior-main">
      <section className={'panel senior-call ' + (assessment.score >= 85 ? 'danger-panel' : '')}>
        <div className="senior-panel-title"><div className="round-icon"><Headphones size={23}/></div><div><p className="eyebrow">THE LOOKOUT</p><h2>A second set of ears.</h2></div><Badge tone={active ? 'green' : 'neutral'}>{active ? 'GUARD IS ON' : 'GUARD IS OFF'}</Badge></div>
        {active && <div className="listening-banner"><Radio size={18}/>{mic ? 'Microphone is listening. Live text is shared with your guardian.' : 'Reading submitted text. Your microphone is off.'}</div>}
        {assessment.score > 0 ? <div className="senior-warning" aria-live="polite"><div><Badge tone={assessment.score >= 85 ? 'red' : 'amber'}>{assessment.level.toUpperCase()} · {assessment.score}/100</Badge><button className="icon-button" aria-label="Read warning aloud" onClick={() => void say(assessment.advice)}><Volume2 size={21}/></button></div><h3>{assessment.score >= 85 ? 'Let’s pause this conversation.' : 'Something needs a closer look.'}</h3><p>{assessment.advice}</p><p className="no-shame">You did nothing wrong. These callers are professionals.</p></div> : <p className="senior-intro">If someone calls asking for money, turn on your call guard. You can always stop.</p>}
        {!active ? <div className="call-controls"><label className="field-label">Try a practice call<select value={scenario} onChange={e => { setScenario(e.target.value as keyof typeof scenarios); setLineIndex(0); }}>{Object.entries(scenarios).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}</select></label><button className="button primary large" disabled={busy} onClick={() => void run(startScript)}><Play size={20}/>Start scripted demo</button><button className="button secondary large" disabled={busy} onClick={() => void run(() => startMic())}><Mic size={20}/>Use microphone</button><p className="consent-note">Starting shares the live transcript with your guardian. Microphone mode sends audio to ElevenLabs when configured, or your browser’s speech service otherwise. Gemini receives submitted text when configured. Use synthetic examples on the free Gemini tier. Tripwire does not store audio or save transcripts by default. Scripted mode uses no microphone.</p></div> : <>
          <div className="live-transcript"><div className="transcript-heading"><span>WHAT THE CALLER SAID</span><Badge tone="outline">{mic ? micMode === 'elevenlabs' ? 'ELEVENLABS LIVE' : 'BROWSER TRANSCRIPTION' : 'SUBMITTED TEXT'}</Badge></div>{s.call.transcript.map(l => <p key={l.id}><span>{time(l.at)}</span>“{l.text}”</p>)}{partial && <p aria-live="polite" className="quiet-text">{partial}</p>}{!s.call.transcript.length && !partial && <p>Waiting for the first words…</p>}</div>
          {!mic && <div className="button-row"><button className="button secondary" disabled={busy} onClick={() => void run(() => startMic())}>Resume microphone</button>{s.config.elevenlabs && <button className="button secondary" disabled={busy} onClick={() => void run(() => startMic(true))}>Use browser transcription</button>}</div>}{!mic && lineIndex > 0 && lineIndex < scenarios[scenario].lines.length && <button className="button secondary large full" disabled={busy} onClick={() => void run(nextLine)}>Next scripted line <Play size={18}/></button>}
          <details className="manual-transcript"><summary>Add spoken words manually<ChevronDown size={16}/></summary><form onSubmit={e => { e.preventDefault(); void run(async () => { await request('/call/line', { callId: s.call.id, segmentId: crypto.randomUUID(), text: manual, source: 'manual' }); setManual(''); }); }}><label>Caller’s words<textarea value={manual} onChange={e => setManual(e.target.value)} required maxLength={3000} placeholder="Paste a transcript or type what the caller said…"/></label><button className="button secondary" disabled={busy}>Check these words</button></form></details>
          <button className="button hangup full" disabled={busy} onClick={() => void run(endCall)}><PhoneOff size={24}/><span>Hang up on your phone<small>Tap here to stop the call guard</small></span></button><p className="consent-note">Tripwire cannot disconnect your telephone call. End it on your phone, then call back using a saved number.</p>
        </>}
        {micNotice && <p className="provider-note" role="status">{micNotice}</p>}<label className="check-row voice-toggle"><input type="checkbox" checked={voice} onChange={e => { setVoice(e.target.checked); if (!e.target.checked) { cancelAudio(); try { live.current?.unmute(); } catch { live.current?.stop(); setMic(false); } } }}/><span>Read critical warnings aloud</span></label>
      </section>
      <section className="panel senior-payment"><div className="senior-panel-title"><div className="round-icon"><CreditCard size={23}/></div><div><p className="eyebrow">THE TELLER</p><h2>Before you send.</h2></div><Badge tone="outline">MOCK PAYMENT</Badge></div><p className="senior-intro">We’ll check for warning signs before this demo payment goes through.</p><div className="preset-row"><button onClick={() => preset(true)}>Try a $40 bill</button><button onClick={() => preset(false)}>Try $2,500 in gift cards</button></div><form onSubmit={e => { e.preventDefault(); void run(async () => { const created = await request<Payment>('/payments', { payee, amount: Number(amount), rail, newPayee, pasted }); setSelectedPayment(created.id); }); }}><label>Who are you paying?<input value={payee} onChange={e => setPayee(e.target.value)} onPaste={() => setPasted(true)} required maxLength={100}/></label><div className="form-grid"><label>Amount ($)<input type="number" min="0.01" max="100000" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required/></label><label>Payment method<select value={rail} onChange={e => setRail(e.target.value as Rail)}><option value="bill">Pay a bill</option><option value="bank">Bank transfer</option><option value="gift-card">Gift cards</option><option value="wire">Wire transfer</option><option value="crypto">Cryptocurrency</option></select></label></div><label className="check-row"><input type="checkbox" checked={newPayee} onChange={e => setNewPayee(e.target.checked)}/><span>This is my first payment to them</span></label><button className="button primary large full" disabled={busy}><ShieldCheck size={21}/>{busy ? 'Checking…' : 'Check & send demo payment'}</button></form>
        {payment && <div className={'payment-result ' + payment.status} aria-live="polite"><PaymentStatus payment={payment}/><EscrowStatus payment={payment}/><h3>{payment.status === 'held' ? 'Your money can wait.' : payment.status === 'denied' ? 'Elena stopped this payment.' : payment.status === 'review' ? 'One quick check first.' : 'Demo payment completed.'}</h3><p>{money(payment.amount)} to {payment.payee}</p>{payment.status === 'held' && <><p>Elena can review this request. Otherwise it releases after the cooling-off period.</p>{payment.releaseAt && <div className="timer-display"><LockKeyhole size={22}/><Countdown until={payment.releaseAt}/><span>remaining</span></div>}</>}{payment.status === 'denied' && <p>Nothing was sent. You did the right thing by pausing.</p>}{payment.status === 'released' && <p>No real money moved. A completed check does not verify the recipient.</p>}{payment.reasons.length > 0 && <ul>{payment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}{payment.status === 'review' && <div className="review-question"><h4>Did the caller ask you to keep this a secret?</h4><div className="button-row"><button className="button primary" disabled={busy} onClick={() => void run(async () => { await request('/payments/review', { id: payment.id, secret: true }); })}>Yes, they did</button><button className="button secondary" disabled={busy} onClick={() => void run(async () => { await request('/payments/review', { id: payment.id, secret: false }); })}>No · I reviewed the warning</button></div></div>}</div>}
      </section>
    </div><div className="senior-side">
      <section className="panel verification-card"><div className="verification-icon"><KeyRound size={26}/></div><p className="eyebrow">THE VAULT CODE</p><h2>A voice can be copied.<br/>Your family word helps.</h2><p>Ask the caller for the word your family agreed on. Never say it to them first.</p>{s.settings.safeWordConfigured ? <form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await request<{ matched: boolean }>('/safe-word/verify', { word: code }); setCodeResult(result.matched ? 'The word matched. Still call back to verify the request.' : 'That word did not match. Please hang up and call Alex.'); setCode(''); }); }}><label>What word did they say?<input type="password" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" required maxLength={100} disabled={!active}/></label><button className="button secondary full" disabled={!active || busy}>Check their answer</button></form> : <a className="button secondary full" href="/settings">Set your family safe word</a>}{codeResult && <p className={'verification-result ' + (s.call.safeWord === 'failed' ? 'red-text' : '')} role="status">{codeResult}</p>}<p className="small-note">Only a salted hash is saved. A match is one clue, not proof of identity.</p></section>
      <section className="panel verification-card callback-card"><div className="verification-icon green"><Phone size={25}/></div><p className="eyebrow">THE CALLBACK</p><h2>Go straight to the source.</h2><div className="contact-row"><div className="avatar alex">A</div><div><strong>Alex Garcia</strong><span>Your grandson · trusted contact</span></div></div><p>Ask the real Alex whether he’s calling you, using his separate family view.</p><button className="button primary full" disabled={!active || busy || !!(s.call.callback && !s.call.callback.answer)} onClick={() => void run(async () => { await request('/callback/request'); })}><Phone size={17}/>{s.call.callback && !s.call.callback.answer ? 'Waiting for Alex…' : 'Check with Alex'}</button>{s.call.callback?.answer && <div className={'callback-answer ' + (s.call.callback.answer === 'no' ? 'negative' : '')} role="status"><Check size={20}/><p>{s.call.callback.answer === 'no' ? 'Alex says: “That isn’t me calling.” Hang up and call his saved number.' : 'Alex confirmed he is calling. Check the payment request with him separately.'}</p></div>}<ViewLink href="/relative">Open Alex’s reply screen</ViewLink><p className="small-note">This demo uses a paired browser view. It does not place a phone call or send an SMS.</p></section>
      <div className="senior-reassurance"><ShieldCheck size={27}/><p>It’s always okay to hang up.<br/><strong>A real emergency can wait for a check.</strong></p></div>
    </div></div>
  </>;
}
