'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, FileSearch, LockKeyhole, Upload, X } from 'lucide-react';
import type { ScanResult } from '@/lib/types';
import { scanSamples } from '@/lib/scenarios';
import { useTripwire } from './context';
import styles from './inspector.module.css';
import { Badge } from './ui';

type Screenshot = { data: string; mimeType: string; name: string };

export function Inspector() {
  const { request, state } = useTripwire();
  const [text, setText] = useState('');
  const [image, setImage] = useState<Screenshot | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reader = useRef<FileReader | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const gemini = state!.config.gemini;

  useEffect(() => () => { reader.current?.abort(); }, []);
  useEffect(() => {
    if (result) {
      resultHeading.current?.focus({ preventScroll: true });
      resultHeading.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [result]);

  function clearImage() {
    reader.current?.abort();
    reader.current = null;
    setReading(false);
    setImage(null);
    if (input.current) input.current.value = '';
  }

  function addFile(file: File) {
    if (busy) return;
    clearImage();
    setResult(null);
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP picture up to 5 MB. If you cannot upload it, paste the message below.');
      return;
    }
    const current = new FileReader();
    reader.current = current;
    setReading(true);
    current.onload = () => {
      if (reader.current !== current) return;
      setImage({ data: String(current.result).split(',')[1], mimeType: file.type, name: file.name });
      setReading(false);
    };
    current.onerror = () => {
      if (reader.current !== current) return;
      setReading(false);
      setError('We could not open that picture. Choose another picture or paste the message below.');
    };
    current.readAsDataURL(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || reading) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await request<ScanResult>('/inspect', { text, image: image ? { data: image.data, mimeType: image.mimeType } : undefined }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The check could not finish. Please try again.');
    } finally { setBusy(false); }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">LOOK CLOSER. BEFORE YOU CLICK.</p><h1>Something feel off<span>?</span></h1><p>Bring the message. We will look for the warning signs.</p></div><Badge tone={gemini ? 'green' : 'outline'}>{gemini ? 'GEMINI MULTIMODAL' : 'TEXT RULES MODE'}</Badge></div>
    <div className="inspector-grid">
      <section className="panel inspector-input" data-board-node="inspector-input" aria-labelledby="inspector-input-title">
        <div className="inspector-title"><FileSearch size={24}/><h2 id="inspector-input-title">The Inspector</h2></div>
        <p>Check a text, email, dating-app message, payment request, or suspicious link. You did nothing wrong by checking.</p>
        <form onSubmit={event => void submit(event)}>
          <fieldset disabled={busy} className={styles.fields}>
            <label htmlFor="inspector-message">Paste the message or link<textarea id="inspector-message" rows={7} maxLength={20000} placeholder="Paste the whole message here. A little context helps." value={text} onChange={event => { setText(event.target.value); setResult(null); setError(''); }} aria-describedby="inspector-privacy"/></label>
            <div className={'upload-zone ' + (dragging ? 'dragging' : '')} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files[0]) addFile(event.dataTransfer.files[0]); }}>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload screenshot" onChange={event => { if (event.target.files?.[0]) addFile(event.target.files[0]); }}/>
              {image ? <>
                <img className={styles.preview} src={`data:${image.mimeType};base64,${image.data}`} alt="Preview of your selected message" onError={() => { clearImage(); setError('That picture could not be displayed. Choose another picture or paste the message.'); }}/>
                <span>{image.name}</span>
                <button type="button" className="text-link" onClick={() => { clearImage(); setResult(null); setError(''); }}>Remove picture<X aria-hidden="true" size={14}/></button>
              </> : <>
                <Upload aria-hidden="true" size={26}/>
                <button type="button" onClick={() => input.current?.click()}>Choose a picture, or drop it here</button>
                <span>PNG, JPG, WEBP - UP TO 5 MB</span>
              </>}
            </div>
            {reading && <p role="status">Opening your picture...</p>}
            {!gemini && <p className="provider-note">Picture checking is unavailable right now. Paste the words above to check the text instead.{image && ' Your picture will not be checked.'}</p>}
            <button className="button primary full" disabled={busy || reading || (!text.trim() && (!image || !gemini))}><FileSearch aria-hidden="true" size={18}/>{busy ? 'Checking your message...' : 'Inspect this message'}<ArrowRight aria-hidden="true" size={17}/></button>
            <p id="inspector-privacy" className="privacy-note"><LockKeyhole aria-hidden="true" size={13}/>Scans are not saved by Tripwire. When configured, content is sent to Gemini for analysis. Remove account numbers and other private details first. Use fictional examples on the free tier; Google may use that content to improve its products.</p>
          </fieldset>
          {error && <div className="error" role="alert"><h3>We could not finish this check</h3><p>{error}</p><p>You can try again or paste the words from the picture. Do not send money while you are unsure.</p></div>}
        </form>
      </section>
      <section className={'panel inspector-results ' + (result ? 'has-result' : '')} data-board-node="inspector-result" aria-labelledby="inspector-result-title" aria-busy={busy}>
        {busy ? <div className="inspector-empty" role="status"><FileSearch aria-hidden="true" size={48}/><h2 id="inspector-result-title">Checking your message...</h2><p>Take a breath. You do not need to reply or send money while you wait.</p></div> : result ? <>
          <Badge tone={result.score >= 60 ? 'red' : result.score >= 30 ? 'amber' : 'green'}>{result.score}/100 - {result.source.toUpperCase()}</Badge>
          <h2 id="inspector-result-title" ref={resultHeading} tabIndex={-1}>{result.verdict}</h2>
          <p>{result.explanation}</p>
          <div className="case-divider"/>
          <h3>What stood out</h3>
          {result.redFlags.length ? <ul className="red-flags">{result.redFlags.map((flag, index) => <li key={index}><AlertTriangle aria-hidden="true" size={16}/><span>{flag}</span></li>)}</ul> : <p>No known warning signs were found. This does not prove that the sender or request is real.</p>}
          <div className="next-step"><p className="eyebrow">ONE NEXT STEP</p><p>{result.nextStep}</p></div>
          <details className="provider-note"><summary>How this was checked</summary><p>{result.source === 'gemini' ? 'Gemini helped look for warning signs in the content you provided.' : 'Tripwire checked the pasted text for common scam patterns.'} Links were not opened. This check cannot confirm anyone's identity.</p>{result.limitations && <p>{result.limitations}</p>}</details>
        </> : <div className="inspector-empty"><div className="inspection-art"><FileSearch size={64} strokeWidth={1}/><span className="inspection-cross one">+</span><span className="inspection-cross two">+</span><span className="inspection-line"/></div><p className="eyebrow">TRUST YOUR INSTINCT TO CHECK</p><h2 id="inspector-result-title">No judgment.<br/>Just a closer look.</h2><p>Your findings will appear here, with the warning signs and one clear next step.</p></div>}
      </section>
    </div>
    <section className="sample-section" aria-labelledby="inspector-samples-title"><div><p className="eyebrow">FROM THE CASEBOOK</p><h2 id="inspector-samples-title">Try a prepared example.</h2></div><p>These made-up messages are for practice.</p><div className="sample-buttons">{scanSamples.map(sample => <button key={sample.title} disabled={busy} onClick={() => { clearImage(); setText(sample.text); setResult(null); setError(''); document.getElementById('inspector-input-title')?.scrollIntoView({ block: 'start' }); }}>{sample.title}<ArrowRight aria-hidden="true" size={14}/></button>)}</div></section>
  </>;
}
