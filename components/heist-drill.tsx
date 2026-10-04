'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Headphones, RotateCcw, ShieldCheck } from 'lucide-react';
import type { DrillAction, DrillResult } from '@/lib/heist-drill';
import { drillScenarios, findDrillScenario, scoreDrill } from '@/lib/heist-drill';
import { useTripwire, headers } from './context';
import { Badge } from './ui';
import styles from './heist-drill.module.css';

type Phase = 'choose' | 'playing' | 'scoring' | 'result';
const FALLBACK_ACTION: DrillAction = 'keep-secret';
export function HeistDrill() {
  const { role, request, setError } = useTripwire();
  const [scenarioId, setScenarioId] = useState(drillScenarios[1].id);
  const [phase, setPhase] = useState<Phase>('choose'); const [roundIndex, setRoundIndex] = useState(0);
  const [actions, setActions] = useState<DrillAction[]>([]); const [seconds, setSeconds] = useState(120);
  const [result, setResult] = useState<DrillResult | null>(null); const [voiceBusy, setVoiceBusy] = useState(false);
  const startedAt = useRef(0); const finishRef = useRef<(answers: DrillAction[]) => void>(() => {});
  const scenario = findDrillScenario(scenarioId)!; const activeRound = scenario.rounds[roundIndex];

  useEffect(() => {
    finishRef.current = answers => { void (async () => {
      setPhase('scoring');
      const complete = [...answers, ...Array.from({ length: Math.max(0, scenario.rounds.length - answers.length) }, () => FALLBACK_ACTION)].slice(0, scenario.rounds.length);
      const local = scoreDrill(scenario, complete);
      try {
        const remote = await request<DrillResult>('/drill/score', { scenario: scenario.id, actions: complete });
        setResult(remote);
      } catch { setResult(local); }
      setPhase('result');
    })(); };
  }, [request, scenario]);
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(() => {
      const left = Math.max(0, 120 - Math.floor((Date.now() - startedAt.current) / 1000));
      setSeconds(left);
      if (!left) finishRef.current(actions);
    }, 500);
    return () => clearInterval(timer);
  }, [phase, actions]);
  function start() { setActions([]); setResult(null); setRoundIndex(0); setSeconds(120); startedAt.current = Date.now(); setPhase('playing'); }
  function choose(action: DrillAction) {
    const next = [...actions, action]; setActions(next);
    if (next.length >= scenario.rounds.length) finishRef.current(next);
    else setRoundIndex(next.length);
  }
  async function speakCaller() {
    if (!activeRound || voiceBusy) return;
    setVoiceBusy(true);
    try {
      const response = await fetch('/api/speak', { method: 'POST', headers: headers(role), body: JSON.stringify({ text: activeRound.caller }) });
      const type = response.headers.get('content-type') || '';
      if (response.ok && type.includes('audio')) { const audio = new Audio(URL.createObjectURL(await response.blob())); audio.onended = () => URL.revokeObjectURL(audio.src); await audio.play(); }
      else if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(activeRound.caller)); }
    } catch { if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(activeRound.caller)); }
    finally { setVoiceBusy(false); }
  }

  return <div className={styles.wrap}>
    <div className={styles.intro}><p className="eyebrow">PRACTICE / RECOGNIZE THE PLAY</p><h1>Heist Drill<span>.</span></h1><p>Practice a pressured conversation in a safe simulation. No phone call or microphone is used. Choose what you would do; Gemini can coach your decisions, and the score is always explainable.</p></div>
    {phase === 'choose' && <section className={styles.panel}>
      <div className={styles.topline}><div><Badge tone="outline">2-MINUTE PRACTICE</Badge><h2>Choose a scenario.</h2><p>Scam callers work by creating trust, emotion, urgency, or isolation.</p></div><Headphones size={28}/></div>
      <div className={styles.grid}>{drillScenarios.map(item => <button className={styles.scenario} key={item.id} aria-pressed={scenarioId === item.id} onClick={() => setScenarioId(item.id)}><strong>{item.title}</strong><span>{item.description}</span></button>)}</div>
      <button className="button primary" onClick={start}>Start practice <ArrowRight size={16}/></button>
      <p className={styles.notice}>Caller lines are fictional practice scripts. Your selected answer categories are sent for scoring; no transcript or free-text response is collected.</p>
    </section>}
    {phase === 'playing' && activeRound && <section className={styles.panel}>
      <div className={styles.topline}><div><Badge tone="red">PRACTICE SCENARIO · {scenario.title.toUpperCase()}</Badge><p>Moment {roundIndex + 1} of {scenario.rounds.length}</p></div><div className={styles.timer} aria-label={`${seconds} seconds remaining`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</div></div>
      <div className={styles.caller} aria-live="polite">“{activeRound.caller}”</div>
      <p className={styles.tell}>A possible tell: {activeRound.tell}</p>
      <div className={styles.topline}><h2>What would you do?</h2><button className="button secondary" disabled={voiceBusy} onClick={() => void speakCaller()}><Headphones size={16}/>{voiceBusy ? 'Playing…' : 'Hear caller'}</button></div>
      <div className={styles.choices}>{activeRound.choices.map(choice => <button className={styles.choice} key={choice.id} onClick={() => choose(choice.id)}><span>{choice.label}</span><ArrowRight size={17}/></button>)}</div>
      <p className={styles.notice}>You can stop any time. In real life: pause, end contact, and independently call someone you trust.</p>
    </section>}
    {phase === 'scoring' && <section className={styles.panel} role="status"><p className="eyebrow">THE COACH IS REVIEWING YOUR CHOICES</p><h2>Putting together your case file…</h2><p>Your score uses only the scenario and your selected action categories.</p></section>}
    {phase === 'result' && result && <section className={styles.panel}>
      <div className={styles.topline}><div><Badge tone={result.score >= 75 ? 'green' : 'amber'}>PRACTICE COMPLETE</Badge><p className="eyebrow">{scenario.title.toUpperCase()}</p></div><ShieldCheck size={28}/></div>
      <div className={styles.resultScore}>{result.score}<span style={{ fontSize: '.35em' }}>/100</span></div>
      <p><strong>{result.correct} of {result.total} protective choices.</strong> {result.feedback}</p>
      {result.missed.length > 0 && <><p className="eyebrow">SIGNS TO REMEMBER</p><div className={styles.missed}>{result.missed.map(item => <span key={item}>{item}</span>)}</div></>}
      <p><strong>Next time:</strong> {result.nextTime}</p>
      <p className={styles.notice}>Coaching: {result.source === 'gemini' ? 'Gemini · choices only, not a transcript' : 'local rules fallback'}. This practice score is educational, not a prediction of future behavior.</p>
      <div className="button-row"><button className="button secondary" onClick={() => setPhase('choose')}><ArrowLeft size={16}/>Choose another</button><button className="button primary" onClick={start}><RotateCcw size={16}/>Practice again</button></div>
    </section>}
  </div>;
}
