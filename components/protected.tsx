'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CreditCard, Headphones, KeyRound, LockKeyhole, Mic, Phone, PhoneOff, Play, Radio, ShieldCheck, Volume2 } from 'lucide-react';
import { scenarios } from '@/lib/scenarios';
import type { Payment, Rail } from '@/lib/types';
import { LiveTranscription } from '@/lib/live-transcription';
import { connectScribe } from './scribe';
import { CaseEducation } from './case-education';
import { EscrowStatus } from './escrow-status';
import { Presenter } from './presenter';
import { Arrival, useArrival } from './motion';
import { headers, useTripwire } from './context';
import { Badge, Countdown, money, PaymentStatus, time } from './ui';

type RecognitionEvent = { resultIndex: number; results: { length: number; [key: number]: { isFinal: boolean; 0: { transcript: string } } } };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: RecognitionEvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };

export function Protected({ student = false }: { student?: boolean }) {
  const { state, request, setError, role } = useTripwire(); const s = state!;
  const [task, setTask] = useState<'home' | 'call' | 'payment'>('home');
  const [verification, setVerification] = useState<'word' | 'callback' | null>(null);
  const taskHeading = useRef<HTMLHeadingElement>(null);
  const previousTask = useRef(task);
  useEffect(() => { if (previousTask.current !== task) taskHeading.current?.focus(); previousTask.current = task; }, [task]);
  const [scenario, setScenario] = useState<keyof typeof scenarios>(student ? 'fakeJob' : 'grandson');
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
  const [composingPayment, setComposingPayment] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const paymentHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (!composingPayment) paymentHeading.current?.focus(); }, [composingPayment, selectedPayment]);
  const payment = s.payments.find(p => p.id === selectedPayment) || s.payments[0];
  const paymentArrival = useArrival(`payment:${payment?.id}:${payment?.status}`);
  const education = s.cases.find(c => c.paymentId === payment?.id)?.education;
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
    setTask('call');
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
    if (!useElevenLabs && !Constructor) throw new Error('Browser transcription is unavailable. Use a supported browser or submit text for review.');
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
      } catch (error) { if (mounted.current && generation === microphoneGeneration.current) setMicNotice('Transcription could not start. Choose browser transcription or submit text.'); throw error; }
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
  function preset(normal: boolean) { setTask('payment'); setComposingPayment(true); setPayee(normal ? 'Campus bookstore' : student ? 'Remote job equipment vendor' : 'Emergency gift cards'); setAmount(normal ? '40' : student ? '2400' : '2500'); setRail(normal ? 'bill' : student ? 'wire' : 'gift-card'); setNewPayee(!normal); setPasted(false); }
  return <>
    <div className="page-heading senior-heading"><div><h1 ref={taskHeading} tabIndex={-1}>{task === 'home' ? student ? 'Check the offer.' : 'Hello, Rosa.' : task === 'call' ? 'Check a call' : 'Send money'}</h1>{student && task === 'home' && <p>New job? Check the check before you send money back.</p>}</div></div>
    <nav className="task-navigation" aria-label={student ? 'Student tasks' : 'Rosa’s tasks'}><button aria-current={task === 'home' ? 'page' : undefined} onClick={() => setTask('home')}>Home</button><button aria-current={task === 'call' ? 'page' : undefined} onClick={() => setTask('call')}>Check a call{active && <span className="task-live-dot" aria-label="Guard is running"/>}</button><button aria-current={task === 'payment' ? 'page' : undefined} onClick={() => setTask('payment')}>Send money</button></nav>
    {task === 'home' && <div className="task-home"><p>{student ? 'Starting a job or buying something online? Take a minute to check.' : 'What would you like to check?'}</p><div className="task-choices"><button data-board-node="check-call" onClick={() => setTask('call')}><Headphones size={38}/><strong>Check a call</strong><span>{active ? 'Return to your running call guard' : 'Get help with a suspicious caller'}</span></button><button data-board-node="send-money" onClick={() => setTask('payment')}><CreditCard size={38}/><strong>Send money</strong><span>{student ? 'Check a transfer or job-related payment' : 'Check a payment before you send it'}</span></button></div>{payment?.status === 'held' && <button className="held-reminder" onClick={() => { setTask('payment'); setComposingPayment(false); }}><LockKeyhole size={24}/>{money(payment.amount)} payment on hold. View payment.</button>}{student && <p className="consent-note">A check can appear in your balance before it clears. Never send part of a check back to a new contact.</p>}</div>}
    {active && task !== 'call' && <div className="call-continuity"><Radio size={22}/><span>{mic ? 'Your microphone is still listening.' : 'Call guard is running. Microphone is off.'}</span><button onClick={() => setTask('call')}>Return to call</button></div>}
    <div className="senior-grid"><div className="senior-main">
      <section data-board-node="call" hidden={task !== 'call'} className={'panel senior-call ' + (assessment.score >= 85 ? 'danger-panel' : '')}>
        <div className="senior-panel-title"><div className="round-icon"><Headphones size={23}/></div><div><h2>Call guard</h2></div><Badge tone={active ? 'green' : 'neutral'}>{active ? 'GUARD IS ON' : 'GUARD IS OFF'}</Badge></div>
        {active && <div className="listening-banner"><Radio size={18}/>{mic ? 'Microphone is listening. Call text is shared with your guardian.' : 'Reading submitted text. Your microphone is off.'}</div>}
        {assessment.score > 0 ? <div className="senior-warning" aria-live="polite"><div><Badge tone={assessment.score >= 85 ? 'red' : 'amber'}>{assessment.level.toUpperCase()} · {assessment.score}/100</Badge><button className="icon-button" aria-label="Read warning aloud" onClick={() => void say(assessment.advice)}><Volume2 size={21}/></button></div><h3>{assessment.score >= 85 ? 'Let’s pause this conversation.' : 'Something needs a closer look.'}</h3><p>{assessment.advice}</p><p className="no-shame">You did nothing wrong. These callers are professionals.</p></div> : <p className="senior-intro">If someone calls asking for money, turn on your call guard. You can always stop.</p>}
        {!active ? <div className="call-controls"><p className="consent-note">Starting shares the caller’s words with your guardian and our speech and analysis services. Tripwire does not save audio. Saving flagged transcripts is {s.settings.retainFlaggedTranscripts ? 'on' : 'off'}.</p><details className="privacy-details"><summary>How your words are used</summary><p>Microphone audio goes to {s.config.elevenlabs ? 'ElevenLabs' : 'your browser’s speech service'}. {s.config.gemini ? 'Gemini receives submitted text for analysis. Use synthetic examples on the free Gemini tier.' : 'Submitted text is checked by rules on this server.'} Scripted mode uses no microphone.</p></details><button className="button primary large" disabled={busy} onClick={() => void run(() => startMic())}><Mic size={20}/>Use microphone</button></div> : <>
          <button className="button hangup full" disabled={busy} onClick={() => void run(endCall)}><PhoneOff size={24}/><span>Hang up on your phone<small>Tap here to stop the call guard</small></span></button><p className="consent-note">Tripwire cannot disconnect your telephone call. End it on your phone, then call back using a saved number.</p>
          <details className="transcript-details"><summary>Read the transcript</summary><div className="live-transcript"><div className="transcript-heading"><span>WHAT THE CALLER SAID</span><Badge tone="outline">{mic ? micMode === 'elevenlabs' ? 'ELEVENLABS' : 'BROWSER TRANSCRIPTION' : 'SUBMITTED TEXT'}</Badge></div>{s.call.transcript.map(l => <p key={l.id}><span>{time(l.at)}</span>“{l.text}”</p>)}{partial && <p aria-live="polite" className="quiet-text">{partial}</p>}{!s.call.transcript.length && !partial && <p>Waiting for the first words…</p>}</div></details>
          {!mic && <div className="button-row"><button className="button secondary" disabled={busy} onClick={() => void run(() => startMic())}>Resume microphone</button>{s.config.elevenlabs && <button className="button secondary" disabled={busy} onClick={() => void run(() => startMic(true))}>Use browser transcription</button>}</div>}
          <details className="manual-transcript"><summary>Add spoken words manually<ChevronDown size={16}/></summary><form onSubmit={e => { e.preventDefault(); void run(async () => { await request('/call/line', { callId: s.call.id, segmentId: crypto.randomUUID(), text: manual, source: 'manual' }); setManual(''); }); }}><label>Caller’s words<textarea value={manual} onChange={e => setManual(e.target.value)} required maxLength={3000} placeholder="Paste a transcript or type what the caller said…"/></label><button className="button secondary" disabled={busy}>Check these words</button></form></details>

        </>}
        {micNotice && <p className="provider-note" role="status">{micNotice}</p>}<label className="check-row voice-toggle"><input type="checkbox" checked={voice} onChange={e => { setVoice(e.target.checked); if (!e.target.checked) { cancelAudio(); try { live.current?.unmute(); } catch { live.current?.stop(); setMic(false); } } }}/><span>Read critical warnings aloud</span></label>
      </section>
      <section data-board-node="payment" hidden={task !== 'payment'} className="panel senior-payment"><div className="senior-panel-title"><div className="round-icon"><CreditCard size={23}/></div><div><h2>Your payment</h2></div><Badge tone="outline">PAYMENT REVIEW</Badge></div><p className="senior-intro">We’ll review this request for warning signs before you continue. No funds are transferred from this app.</p><form hidden={!composingPayment} onSubmit={e => { e.preventDefault(); void run(async () => { const created = await request<Payment>('/payments', { payee, amount: Number(amount), rail, newPayee, pasted }); setSelectedPayment(created.id); setComposingPayment(false); }); }}><label>Who are you paying?<input value={payee} onChange={e => setPayee(e.target.value)} onPaste={() => setPasted(true)} required maxLength={100}/></label><div className="form-grid"><label>Amount ($)<input type="number" min="0.01" max="100000" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required/></label><label>Payment method<select value={rail} onChange={e => setRail(e.target.value as Rail)}><option value="bill">Pay a bill</option><option value="bank">Bank transfer</option><option value="gift-card">Gift cards</option><option value="wire">Wire transfer</option><option value="crypto">Cryptocurrency</option></select></label></div><label className="check-row"><input type="checkbox" checked={newPayee} onChange={e => setNewPayee(e.target.checked)}/><span>This is my first payment to them</span></label><button className="button primary large full" disabled={busy}><ShieldCheck size={21}/>{busy ? 'Checking…' : 'Review payment'}</button></form>
        {payment && !composingPayment && <div className={'payment-result ' + payment.status + (paymentArrival ? ' payment-transition' : '')}><>{payment.escrow?.state === 'depositing' ? <Badge tone="amber">ESCROW PENDING</Badge> : <PaymentStatus payment={payment}/>}</><EscrowStatus payment={payment}/><h3 ref={paymentHeading} tabIndex={-1} aria-live="polite">{payment.status === 'held' ? 'Your money can wait.' : payment.status === 'denied' ? 'Elena stopped this payment.' : payment.status === 'review' ? 'One quick check first.' : 'Payment review complete.'}</h3><p>{money(payment.amount)} to {payment.payee}</p>{payment.status === 'held' && <><p>Elena can review this request. Otherwise it releases after the cooling-off period.</p>{payment.releaseAt && <div className="timer-display"><LockKeyhole size={22}/><Countdown until={payment.releaseAt}/><span>remaining</span></div>}</>}{payment.status === 'denied' && <><p>Nothing was sent. You did the right thing by pausing.</p>{education && <CaseEducation education={education}/>}</>}{payment.status === 'released' && <p>No payment was sent by this app. A completed review does not verify the recipient.</p>}{payment.reasons.length > 0 && <ul>{payment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}{payment.status === 'review' && <div className="review-question"><h4>Did the caller ask you to keep this a secret?</h4><div className="button-row"><button className="button primary" disabled={busy} onClick={() => void run(async () => { await request('/payments/review', { id: payment.id, secret: true }); })}>Yes, they did</button><button className="button secondary" disabled={busy} onClick={() => void run(async () => { await request('/payments/review', { id: payment.id, secret: false }); })}>No · I reviewed the warning</button></div></div>}</div>}
        {!composingPayment && <button className="button secondary new-payment" onClick={() => setComposingPayment(true)}>Check another payment</button>}
      </section>
    </div><div className="senior-side" hidden={task !== 'call' || !active}>
      <div className="verification-actions"><h2>Check who is calling</h2><button className="button secondary" aria-expanded={verification === 'word'} onClick={() => setVerification(verification === 'word' ? null : 'word')}><KeyRound size={23}/>Check the family word</button><button className="button secondary" aria-expanded={verification === 'callback'} onClick={() => setVerification(verification === 'callback' ? null : 'callback')}><Phone size={23}/>Ask Alex</button></div>
      <section hidden={verification !== 'word'} className="panel verification-card"><div className="verification-icon"><KeyRound size={26}/></div><h2>Check the family word</h2><p>Ask the caller for the word your family agreed on. Never say it to them first.</p>{s.settings.safeWordConfigured ? <form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await request<{ matched: boolean }>('/safe-word/verify', { word: code }); setCodeResult(result.matched ? 'The word matched. Still call back to verify the request.' : 'That word did not match. Please hang up and call Alex.'); setCode(''); }); }}><label>What word did they say?<input type="password" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" required maxLength={100} disabled={!active}/></label><button className="button secondary full" disabled={!active || busy}>Check their answer</button></form> : <Link className="button secondary full" href="/settings">Set your family safe word</Link>}{codeResult && <p className={'verification-result ' + (s.call.safeWord === 'failed' ? 'red-text' : '')} role="status">{codeResult}</p>}<p className="small-note">A matching word is one clue. Call back to verify.</p></section>
      <section hidden={verification !== 'callback'} className="panel verification-card callback-card"><div className="verification-icon green"><Phone size={25}/></div><h2>Ask the real Alex</h2><div className="contact-row"><div className="avatar alex">A</div><div><strong>Alex Garcia</strong><span>Your grandson · trusted contact</span></div></div><p>Ask the real Alex whether he’s calling you, using his separate family view.</p><button className="button primary full" disabled={!active || busy || !!(s.call.callback && !s.call.callback.answer)} onClick={() => void run(async () => { await request('/callback/request'); })}><Phone size={17}/>{s.call.callback && !s.call.callback.answer ? 'Waiting for Alex…' : 'Check with Alex'}</button>{s.call.callback?.answer && <Arrival id={`callback:${s.call.callback.id}:${s.call.callback.answer}`} className={'callback-answer ' + (s.call.callback.answer === 'no' ? 'negative' : '')} role="status"><Check size={20}/><p>{s.call.callback.answer === 'no' ? 'Alex says: “That isn’t me calling.” Hang up and call his saved number.' : 'Alex confirmed he is calling. Check the payment request with him separately.'}</p></Arrival>}<p className="small-note">The relative confirms through a separate paired browser view; no phone call or SMS is placed.</p></section>

    </div></div>
    <Presenter><label className="field-label">Choose a practice scenario<select value={scenario} onChange={e => { setScenario(e.target.value as keyof typeof scenarios); setLineIndex(0); }}>{Object.entries(scenarios).map(([key, value]) => <option key={key} value={key}>{value.title}</option>)}</select></label><button className="button primary large" disabled={busy} onClick={() => void run(startScript)}><Play size={20}/>Start call practice</button>{!mic && lineIndex > 0 && lineIndex < scenarios[scenario].lines.length && <button className="button secondary large full" disabled={busy} onClick={() => void run(nextLine)}>Next caller statement <Play size={18}/></button>}<div className="preset-row"><button onClick={() => preset(true)}>Try a $40 bill</button><button onClick={() => preset(false)}>{student ? 'Try a $2,400 fake-job transfer' : 'Try $2,500 in gift cards'}</button></div></Presenter>
  </>;
}
