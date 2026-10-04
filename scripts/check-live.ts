// Hour-0 gate: mints an ephemeral token, opens a Gemini Live session with the
// production config, sends one synthetic caller line, and prints the tool calls.
import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { mintLiveToken } from '../server/gemini';
import { liveConfig } from '../lib/live-config';

const started = Date.now();
const { token, model } = await mintLiveToken('en');
console.log(`token minted for ${model} in ${Date.now() - started} ms`);
const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
let finish!: () => void; const finished = new Promise<void>(resolve => { finish = resolve; });
let tools = 0;
const session = await ai.live.connect({ model, config: liveConfig('en'), callbacks: {
  onmessage: message => {
    const calls = message.toolCall?.functionCalls; if (!calls?.length) return;
    tools += calls.length;
    for (const call of calls) console.log(`${Date.now() - started} ms  ${call.name}  ${JSON.stringify(call.args)}`);
    session.sendToolResponse({ functionResponses: calls.map(call => ({ id: call.id, name: call.name, response: { ok: true } })) });
  },
  onerror: event => console.error('error', (event as ErrorEvent).message),
  onclose: event => { if (event.code !== 1000) console.error(`closed ${event.code} ${event.reason}`); finish(); },
} });
session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'CALLER_SAID: Grandma, it’s me. I got arrested. I need $2,500 for bail right now, and please, don’t tell Mom.' }] }], turnComplete: true });
setTimeout(() => session.close(), Number(process.env.CHECK_LIVE_MS || 12000));
await finished;
console.log(tools ? `PASS: ${tools} tool calls` : 'FAIL: no tool calls');
process.exit(tools ? 0 : 1);
