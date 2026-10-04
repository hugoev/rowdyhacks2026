// Hour-0 gate: mints an ephemeral token, opens a Gemini Live session with the
// production config, sends one synthetic caller turn, and prints the tool calls.
//   npm run check:live                       one typed caller line
//   npm run check:live -- --audio=call.wav   streams a 16-bit mono PCM WAV in real time
//   (leave ~3 s of silence between caller turns, e.g. say "... [[slnc 3000]] ...")
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { mintLiveToken } from '../server/gemini';
import { liveConfig } from '../lib/live-config';

/** Returns the PCM payload and sample rate of a 16-bit mono WAV. */
export function wavPcm(file: Buffer) {
  if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected a WAV file.');
  let offset = 12; let rate = 16000; let bits = 16; let channels = 1;
  while (offset + 8 <= file.length) {
    const id = file.toString('ascii', offset, offset + 4); const size = file.readUInt32LE(offset + 4);
    if (id === 'fmt ') { channels = file.readUInt16LE(offset + 10); rate = file.readUInt32LE(offset + 12); bits = file.readUInt16LE(offset + 22); }
    if (id === 'data') {
      if (bits !== 16 || channels !== 1) throw new Error('Use 16-bit mono PCM (for example: say -o call.wav --data-format=LEI16@16000 "...").');
      return { pcm: file.subarray(offset + 8, offset + 8 + size), rate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk.');
}

const audioArg = process.argv.find(arg => arg.startsWith('--audio='))?.slice(8);
const started = Date.now();
const { token, model } = await mintLiveToken('en');
console.log(`token minted for ${model} in ${Date.now() - started} ms`);
const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
let finish!: () => void; const finished = new Promise<void>(resolve => { finish = resolve; });
let tools = 0; let audioStart = 0; const heard: string[] = [];
const session = await ai.live.connect({ model, config: liveConfig('en'), callbacks: {
  onmessage: message => {
    const text = message.serverContent?.inputTranscription?.text; if (text) heard.push(text);
    const calls = message.toolCall?.functionCalls; if (!calls?.length) return;
    tools += calls.length;
    const at = audioStart ? `+${Date.now() - audioStart} ms after audio start` : `${Date.now() - started} ms`;
    for (const call of calls) console.log(`${at}  ${call.name}  ${JSON.stringify(call.args)}`);
    session.sendToolResponse({ functionResponses: calls.map(call => ({ id: call.id, name: call.name, response: { ok: true } })) });
  },
  onerror: event => console.error('error', (event as ErrorEvent).message),
  onclose: event => { if (event.code !== 1000) console.error(`closed ${event.code} ${event.reason}`); finish(); },
} });
if (audioArg) {
  const { pcm, rate } = wavPcm(readFileSync(audioArg));
  const frame = Math.round(rate / 10) * 2; audioStart = Date.now();
  for (let offset = 0; offset < pcm.length; offset += frame) {
    session.sendRealtimeInput({ audio: { data: pcm.subarray(offset, offset + frame).toString('base64'), mimeType: `audio/pcm;rate=${rate}` } });
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log(`audio sent: ${(pcm.length / 2 / rate).toFixed(1)} s`);
  // Trailing silence lets turn detection end the caller's turn (as Rosa's reply would).
  for (let i = 0; i < 30; i++) { session.sendRealtimeInput({ audio: { data: Buffer.alloc(frame).toString('base64'), mimeType: `audio/pcm;rate=${rate}` } }); await new Promise(resolve => setTimeout(resolve, 100)); }
} else {
  session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'CALLER_SAID: Grandma, it’s me. I got arrested. I need $2,500 for bail right now, and please, don’t tell Mom.' }] }], turnComplete: true });
}
setTimeout(() => session.close(), Number(process.env.CHECK_LIVE_MS || (audioArg ? 8000 : 12000)));
await finished;
if (heard.length) console.log('transcription:', heard.join('').trim());
console.log(tools ? `PASS: ${tools} tool calls` : 'FAIL: no tool calls');
process.exit(tools ? 0 : 1);
