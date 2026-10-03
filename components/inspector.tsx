'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, FileSearch, LockKeyhole, Upload, X } from 'lucide-react';
import type { ScanResult } from '@/lib/types';
import { scanSamples } from '@/lib/scenarios';
import { useTripwire } from './context';
import styles from './inspector.module.css';

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

  return <div className={styles.inspector}>
    <header className={styles.heading}>
      <p className={styles.kicker}>THE INSPECTOR</p>
      <h1>Something feel off?</h1>
      <p>Check a message before you reply, click a link, or send money.</p>
      <p className={styles.reassurance}>You did nothing wrong by checking. You can take your time.</p>
    </header>
    <div className={styles.grid}>
      <section className={styles.card} aria-labelledby="inspector-input-title">
        <h2 id="inspector-input-title">1. Add the message</h2>
        <p>Choose a picture of the message, or paste its words below.</p>
        <form onSubmit={event => void submit(event)}>
          <fieldset disabled={busy} className={styles.fields}>
            <div className={`${styles.upload} ${dragging ? styles.dragging : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files[0]) addFile(event.dataTransfer.files[0]); }}>
              <input ref={input} className={styles.fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload screenshot" onChange={event => { if (event.target.files?.[0]) addFile(event.target.files[0]); }}/>
              {image ? <>
                <img className={styles.preview} src={`data:${image.mimeType};base64,${image.data}`} alt="Preview of your selected message" onError={() => { clearImage(); setError('That picture could not be displayed. Choose another picture or paste the message.'); }}/>
                <p className={styles.filename}>{image.name}</p>
                <button type="button" className={styles.secondary} onClick={() => { clearImage(); setResult(null); setError(''); }}><X aria-hidden="true" size={22}/>Remove picture</button>
              </> : <>
                <Upload aria-hidden="true" size={32}/>
                <button type="button" className={styles.secondary} onClick={() => input.current?.click()}>Choose a picture</button>
                <p>JPG, PNG, or WebP. Up to 5 MB.</p>
              </>}
            </div>
            {reading && <p role="status">Opening your picture...</p>}
            {!gemini && <p className={styles.notice}>Picture checking is unavailable right now. Paste the words below to check the text instead.{image && ' Your picture will not be checked.'}</p>}
            <label className={styles.label} htmlFor="inspector-message">Or paste the message or link</label>
            <textarea id="inspector-message" className={styles.textarea} rows={5} maxLength={20000} placeholder="For example: Your package is held. Send money now." value={text} onChange={event => { setText(event.target.value); setResult(null); setError(''); }} aria-describedby="inspector-privacy"/>
            <p id="inspector-privacy" className={styles.privacy}><LockKeyhole aria-hidden="true" size={22}/>Tripwire does not save these checks. When picture checking is available, the content is shared with Google's Gemini service. Remove account numbers and other private details first.</p>
            <button className={styles.primary} disabled={busy || reading || (!text.trim() && (!image || !gemini))}><FileSearch aria-hidden="true" size={24}/>{busy ? 'Checking your message...' : 'Inspect this message'}<ArrowRight aria-hidden="true" size={24}/></button>
          </fieldset>
          {error && <div className={styles.error} role="alert"><h3>We could not finish this check</h3><p>{error}</p><p>You can try again or paste the words from the picture. Do not send money while you are unsure.</p></div>}
        </form>
      </section>
      <section className={`${styles.card} ${styles.results}`} aria-labelledby="inspector-result-title" aria-busy={busy}>
        {busy ? <div className={styles.empty} role="status"><FileSearch aria-hidden="true" size={48}/><h2 id="inspector-result-title">Checking your message...</h2><p>Take a breath. You do not need to reply or send money while you wait.</p></div> : result ? <>
          <p className={`${styles.verdictLabel} ${result.score >= 60 ? styles.high : result.score >= 30 ? styles.medium : styles.low}`}>{result.score >= 60 ? 'Stop and check' : result.score >= 30 ? 'Take a moment to check' : 'Keep checking who sent it'}</p>
          <h2 id="inspector-result-title" ref={resultHeading} tabIndex={-1}>{result.verdict}</h2>
          <p>{result.explanation}</p>
          <h3>Warning signs in this message</h3>
          {result.redFlags.length ? <ul className={styles.flags}>{result.redFlags.map((flag, index) => <li key={index}><AlertTriangle aria-hidden="true" size={24}/><span>{flag}</span></li>)}</ul> : <p>No known warning signs were found. This does not prove that the sender or request is real.</p>}
          <div className={styles.nextStep}><h3>2. What to do next</h3><p>{result.nextStep}</p></div>
          <p className={styles.reassurance}>Checking is a good decision. These messages can fool anyone.</p>
          <details className={styles.details}><summary>How this was checked</summary><p>{result.source === 'gemini' ? 'Gemini helped look for warning signs in the content you provided.' : 'Tripwire checked the pasted text for common scam patterns.'} Links were not opened. This check cannot confirm anyone's identity.</p>{result.limitations && <p>{result.limitations}</p>}</details>
        </> : <div className={styles.empty}><FileSearch aria-hidden="true" size={48}/><h2 id="inspector-result-title">Your result will appear here</h2><p>We will explain any warning signs and give you one next step.</p><p>If someone is rushing you, stop and contact them using a number you already trust.</p></div>}
      </section>
    </div>
    <section className={styles.samples} aria-labelledby="inspector-samples-title"><h2 id="inspector-samples-title">Want to try it first?</h2><p>These made-up messages are for practice.</p><div className={styles.sampleButtons}>{scanSamples.map(sample => <button key={sample.title} disabled={busy} onClick={() => { clearImage(); setText(sample.text); setResult(null); setError(''); document.getElementById('inspector-input-title')?.scrollIntoView({ block: 'start' }); }}>{sample.title}<ArrowRight aria-hidden="true" size={22}/></button>)}</div></section>
  </div>;
}
