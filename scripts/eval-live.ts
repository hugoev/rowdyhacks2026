// Red-team harness: ElevenLabs voices speak synthetic scam and normal calls;
// the audio streams into Gemini Live with the production config and tools.
// Writes ONLY measured numbers to data/eval-results.json (and Tiger when configured).
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleGenAI, type LiveServerMessage } from '@google/genai';
import { evalScripts, type EvalScript } from '../lib/eval-fixtures';
import { liveConfig, liveModel } from '../lib/live-config';
import type { EvalSummary } from '../lib/types';
import { evalPath } from '../server/eval-store';
import { Store } from '../server/store';
import { TigerAnalytics } from '../server/tiger';

if (!process.env.GEMINI_API_KEY || !process.env.ELEVENLABS_API_KEY) throw new Error('Set GEMINI_API_KEY and ELEVENLABS_API_KEY in .env. Evaluation uses synthetic calls only.');
const voices = (process.env.ELEVENLABS_EVAL_VOICES || 'JBFqnCBsd6RMkjVDRZzb,21m00Tcm4TlvDq8ikWAM,EXAVITQu4vr4xnSDxMaL,pNInz6obpgDQGcFmaJgB,TX3LPaxmHKxFdv7VOQHJ').split(',').map(v => v.trim()).filter(Boolean);
const only = process.argv.find(a => a.startsWith('--limit='));
const limit = only ? Number(only.split('=')[1]) : Infinity;
const concurrency = Number(process.env.EVAL_CONCURRENCY || 3);
const audioDir = join(process.env.DATA_DIR || './data', 'eval-audio'); mkdirSync(audioDir, { recursive: true });

// Scam scripts: English x3 voices, Spanish x2 voices (30). Benign: x2 voices (20).
const plan = evalScripts.flatMap(script => voices.slice(0, script.kind === 'benign' ? 2 : script.language === 'en' ? 3 : 2).map(voice => ({ script, voice }))).slice(0, limit);

/** Caller turns of about two sentences, like a real call where the victim answers in between. */
export function turns(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()) || [text];
  const out: string[] = []; for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '));
  return out;
}
const GAP = Buffer.alloc(16000 * 2 * 2.5); // 2.5 s of silence while the victim "answers"
async function speakTurn(text: string, voice: string, language: string) {
  const file = join(audioDir, createHash('sha256').update(voice + text).digest('hex').slice(0, 16) + '.pcm');
  if (existsSync(file)) return readFileSync(file);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_16000`, { method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_EVAL_MODEL || 'eleven_multilingual_v2', language_code: language }) });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}`);
  const audio = Buffer.from(await response.arrayBuffer()); writeFileSync(file, audio); return audio;
}
async function synthesize(script: EvalScript, voice: string) {
  const parts: Buffer[] = [];
  for (const turn of turns(script.text)) parts.push(await speakTurn(turn, voice, script.language), GAP);
  return Buffer.concat(parts);
}

type Run = { id: string; voice: string; kind: EvalScript['kind']; type: string; language: string; levers: string[]; maxRisk: number; flagged: boolean; firstFlagMs: number | null; error?: string };
async function runOne(script: EvalScript, voice: string): Promise<Run> {
  const base: Run = { id: script.id, voice, kind: script.kind, type: script.type, language: script.language, levers: [], maxRisk: 0, flagged: false, firstFlagMs: null };
  const audio = await synthesize(script, voice);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const levers = new Set<string>(); let maxRisk = 0; let firstFlagAt: number | null = null; let started = 0;
  const flagged = () => maxRisk >= 60 || levers.size >= 2;
  let closed = false;
  const session = await ai.live.connect({ model: liveModel(), config: liveConfig(script.language), callbacks: {
    onmessage: (message: LiveServerMessage) => {
      const calls = message.toolCall?.functionCalls || []; if (!calls.length) return;
      for (const call of calls) {
        const args = (call.args || {}) as Record<string, unknown>;
        if (call.name === 'report_signal' && typeof args.lever === 'string') levers.add(args.lever);
        if (call.name === 'update_risk') maxRisk = Math.max(maxRisk, Number(args.score_0_100) || 0);
        if (firstFlagAt === null && flagged()) firstFlagAt = Date.now();
      }
      session.sendToolResponse({ functionResponses: calls.map(call => ({ id: call.id, name: call.name, response: call.name === 'check_family_word' ? { match: false } : { ok: true } })) });
    },
    onerror: () => {}, onclose: () => { closed = true; },
  } });
  started = Date.now();
  // Real-time streaming (100 ms frames) so time-to-flag is honest. The audio already
  // ends with a silent gap, which ends the caller's last turn.
  for (let offset = 0; offset < audio.length && !closed; offset += 3200) {
    session.sendRealtimeInput({ audio: { data: audio.subarray(offset, offset + 3200).toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await new Promise(resolve => setTimeout(resolve, 3000));
  try { session.close(); } catch { /* closed */ }
  return { ...base, levers: [...levers], maxRisk, flagged: flagged(), firstFlagMs: firstFlagAt === null ? null : firstFlagAt - started };
}

const runs: Run[] = []; let index = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (index < plan.length) {
    const { script, voice } = plan[index++];
    try { const run = await runOne(script, voice); runs.push(run); console.log(JSON.stringify(run)); }
    catch (error) { const run = { id: script.id, voice, kind: script.kind, type: script.type, language: script.language, levers: [], maxRisk: 0, flagged: false, firstFlagMs: null, error: (error as Error).message }; runs.push(run); console.log(JSON.stringify(run)); }
  }
}));
const valid = runs.filter(r => !r.error);
const scams = valid.filter(r => r.kind === 'scam'); const benign = valid.filter(r => r.kind === 'benign');
const flags = scams.filter(r => r.flagged && r.firstFlagMs !== null).map(r => r.firstFlagMs!).sort((a, b) => a - b);
const summary: EvalSummary = {
  ranAt: Date.now(), model: liveModel(), total: valid.length, scams: scams.length, benign: benign.length,
  caught: scams.filter(r => r.flagged).length, falseAlarms: benign.filter(r => r.flagged).length,
  medianFirstFlagMs: flags.length ? flags[Math.floor(flags.length / 2)] : null,
  scamTypes: new Set(scams.map(r => r.type)).size, languages: [...new Set(valid.map(r => r.language))].sort(),
};
writeFileSync(evalPath(), JSON.stringify({ summary, runs, errors: runs.length - valid.length }, null, 2));
console.log('\nSUMMARY', JSON.stringify(summary));
if (process.env.TIGER_DATABASE_URL || process.env.DATABASE_URL) {
  const store = new Store(':memory:'); const tiger = new TigerAnalytics(store, process.env.TIGER_DATABASE_URL || process.env.DATABASE_URL);
  try { console.log((await tiger.recordEval(summary)) ? 'Recorded in Tiger Data.' : 'Tiger not configured.'); } catch (error) { console.warn('Tiger record failed:', (error as Error).message); }
  await tiger.close(); store.db.close();
}
