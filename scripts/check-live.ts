// Hour-0 gate for the safety teller. Mints an ephemeral token exactly as the
// app does, opens a Gemini Live session, and plays Rosa's side as text:
// story -> permission -> call_trusted_contact -> (late) not_me -> hold -> finish.
//   npm run check:live            English
//   npm run check:live -- --es    Spanish
import 'dotenv/config';
import { FunctionResponseScheduling, GoogleGenAI, type LiveServerMessage } from '@google/genai';
import { mintTellerToken } from '../server/gemini';
import { localRisk } from '../server/tiger';
import { scamPayment } from '../lib/demo-data';
import { openingCue } from '../lib/teller-config';

const es = process.argv.includes('--es');
const lines = es
  ? ['Mi nieto Diego está en la cárcel. Necesita la fianza. Me pidió que no le dijera a su mamá.', 'Sí, por favor, llámelo.']
  : ['My grandson Diego is in jail. He needs bail. He asked me not to tell his mom.', 'Yes, please call him.'];
const started = Date.now(); const at = () => `${String(Date.now() - started).padStart(6)} ms`;
const check = localRisk(scamPayment.payee, scamPayment.amount, scamPayment.rail);
const { token, model, config } = await mintTellerToken(check, es ? 'es' : 'en');
console.log(`${at()}  token for ${model} (${check.multiple}x typical, trigger=${check.trigger})`);
const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
let said = ''; let audioBytes = 0; let firstAudio = 0; let turn = 0; const tools: string[] = [];
let pendingCall: { id: string; name: string } | null = null;
let finish!: (ok: boolean) => void; const done = new Promise<boolean>(r => { finish = r; });
const timeout = setTimeout(() => finish(false), 75000);
const session = await ai.live.connect({ model, config, callbacks: {
  onmessage: (m: LiveServerMessage) => {
    for (const p of m.serverContent?.modelTurn?.parts || []) if (p.inlineData?.data) { if (!firstAudio) { firstAudio = Date.now(); console.log(`${at()}  first teller audio`); } audioBytes += p.inlineData.data.length * 0.75; }
    if (m.serverContent?.outputTranscription?.text) said += m.serverContent.outputTranscription.text;
    if (m.serverContent?.turnComplete) {
      if (said.trim()) console.log(`${at()}  TELLER: ${said.trim()}`);
      said = '';
      // Rosa answers after each of the teller's first two turns.
      if (turn < lines.length && !pendingCall) { console.log(`${at()}  ROSA:   ${lines[turn]}`); session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: lines[turn++] }] }], turnComplete: true }); }
    }
    for (const call of m.toolCall?.functionCalls || []) {
      tools.push(call.name || '');
      console.log(`${at()}  TOOL ${call.name} ${JSON.stringify(call.args)}`);
      if (call.name === 'call_trusted_contact') {
        pendingCall = { id: call.id || '', name: call.name };
        // Diego's phone rings and he answers ~6 s later; the result arrives mid-session.
        setTimeout(() => { console.log(`${at()}  RESULT not_me → delivered`); session.sendToolResponse({ functionResponses: [{ id: pendingCall!.id, name: pendingCall!.name, response: { status: 'not_me', note: "I'm fine, I'm right here. I never asked for money." }, scheduling: FunctionResponseScheduling.INTERRUPT }] }); }, 6000);
      } else {
        session.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response: { ok: true }, scheduling: FunctionResponseScheduling.WHEN_IDLE }] });
        if (call.name === 'finish') setTimeout(() => finish(true), 4000);
      }
    }
  },
  onerror: e => console.error('error', (e as ErrorEvent).message),
  onclose: e => { if (e.code !== 1000) console.error(`closed ${e.code} ${e.reason}`); finish(false); },
} });
session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: openingCue(es ? 'es' : 'en') }] }], turnComplete: true });
const ok = await done; clearTimeout(timeout);
try { session.close(); } catch { /* closed */ }
const decided = tools.includes('decide_payment');
console.log(`\naudio received: ${(audioBytes / 48000).toFixed(1)} s · tools: ${tools.join(', ') || 'none'}`);
const pass = ok && tools.includes('call_trusted_contact') && decided && tools.includes('finish');
console.log(pass ? 'PASS: story → call Diego → late result → hold → case file' : 'FAIL: see the transcript above');
process.exit(pass ? 0 : 1);
