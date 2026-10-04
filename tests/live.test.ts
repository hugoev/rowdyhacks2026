import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store';
import { executeTool } from '../server/live-tools';
import { mintLiveToken } from '../server/gemini';
import { agentSignedUrl, speakStream } from '../server/elevenlabs';
import { liveConfig, systemInstruction, toolDeclarations, toolNames } from '../lib/live-config';

const gift = { payee: 'Bail gift cards', amount: 2500, rail: 'gift-card' as const, newPayee: true };

test('tool declarations match the PRD and the family word never enters the prompt', async () => {
  assert.deepEqual(toolDeclarations.map(t => t.name), [...toolNames]);
  const store = new Store(':memory:'); await store.setSafeWord('Marigold');
  assert.ok(!JSON.stringify(liveConfig('en')).toLowerCase().includes('marigold'));
  assert.match(systemInstruction(), /Never speak/); assert.match(systemInstruction('Rosa', 'Diego', 'es'), /Spanish/); store.db.close();
});
test('report_signal records the quote, the source, and latency from when the caller said it', async () => {
  let now = 1_000_000; const store = new Store(':memory:', () => now); store.startCall('gemini');
  store.addLine('Hi Grandma, it is me.', 'gemini'); now += 412;
  assert.deepEqual(await executeTool(store, 'report_signal', { lever: 'trust', quote: 'it is me', confidence: 0.8 }), { ok: true });
  const signal = store.state.call.signals.at(-1)!;
  assert.equal(signal.source, 'gemini'); assert.equal(signal.latencyMs, 412);
  assert.match(store.state.call.tools.at(-1)!.detail, /TRUST/);
  assert.match(String((await executeTool(store, 'report_signal', { lever: 'greed', quote: 'x' })).error), /Invalid/);
  assert.match(String((await executeTool(store, 'launch_rocket', {})).error), /Unknown tool/); store.db.close();
});
test('check_family_word: a dodge fails, the phrase is never logged, and only match comes back', async () => {
  const store = new Store(':memory:'); await store.setSafeWord('Marigold'); store.startCall('gemini');
  store.familyWordAsked();
  assert.deepEqual(await executeTool(store, 'check_family_word', { heard_phrase: '' }), { match: false });
  assert.equal(store.state.call.safeWord, 'failed'); assert.equal(store.state.call.assessment.level, 'Critical');
  assert.ok(store.state.call.signals.some(s => s.lever === 'trust' && /dodged/.test(s.quote)));
  assert.deepEqual(await executeTool(store, 'check_family_word', { heard_phrase: 'marigold' }), { match: true });
  assert.equal(store.state.call.safeWord, 'failed', 'a later match never erases a failure');
  assert.ok(!JSON.stringify(store.state).toLowerCase().includes('marigold')); store.db.close();
});
test('the right word from the real grandson does not raise risk', async () => {
  const store = new Store(':memory:'); await store.setSafeWord('Marigold'); store.startCall('gemini');
  assert.deepEqual(await executeTool(store, 'check_family_word', { heard_phrase: 'Marigold' }), { match: true });
  assert.equal(store.state.call.safeWord, 'matched'); assert.ok(store.state.call.assessment.score < 30); store.db.close();
});
test('payment loop: model can hold and alert, never release; Diego decides; close_case drops invented quotes', async () => {
  const store = new Store(':memory:'); store.startCall('gemini');
  store.addLine('I need bail money. Please don’t tell Mom.', 'gemini');
  const payment = store.createPayment({ ...gift, amount: 600, rail: 'bank' });
  assert.equal(payment.status, 'held', 'secrecy during the call holds even a medium transfer');
  assert.deepEqual(await executeTool(store, 'hold_payment', { payment_id: payment.id, reason: 'Caller asked for secrecy' }), { ok: true, status: 'held' });
  const alert = await executeTool(store, 'alert_guardian', { summary: 'Someone using your name is asking Grandma for $600 in bail money right now.', recommended_action: 'block' });
  assert.equal(alert.ok, true); assert.equal(store.state.call.alert!.source, 'gemini');
  store.guardianReply(store.state.call.alert!.id, 'block');
  const closed = await executeTool(store, 'close_case', { summary: 'A caller pretended to be Diego.', lesson: 'Secrecy plus money means pause.', levers: [{ lever: 'isolation', quote: 'don’t tell Mom' }, { lever: 'emotion', quote: 'I crashed a Ferrari' }] });
  assert.equal(closed.ok, true);
  const file = store.state.cases[0];
  assert.equal(file.closedBy, 'gemini'); assert.equal(file.lesson, 'Secrecy plus money means pause.');
  assert.ok(!JSON.stringify(file.levers).includes('Ferrari'));
  assert.ok(file.levers!.some(l => l.lever === 'isolation'));
  assert.equal((await executeTool(store, 'speak_to_user', { text: 'Again', language: 'en', tone: 'calm' })).spoken, false); store.db.close();
});
test('routine $40 bill with no call goes straight through', () => {
  const store = new Store(':memory:');
  const bill = store.createPayment({ payee: 'CPS Energy', amount: 40, rail: 'bill', newPayee: false });
  assert.equal(bill.status, 'released'); assert.equal(store.state.call.alert, null); store.db.close();
});
test('live tokens require a server-side key', async t => {
  const original = { ...process.env }; t.after(() => { process.env = original; });
  delete process.env.GEMINI_API_KEY; await assert.rejects(mintLiveToken('en'), /not configured/);
});
test('ElevenLabs streaming voice and agent sessions keep the key server-side', async t => {
  const original = { ...process.env }; t.after(() => { process.env = original; });
  process.env.ELEVENLABS_API_KEY = 'unit-test-only'; process.env.ELEVENLABS_AGENT_ID = 'agent_123'; process.env.ELEVENLABS_VOICE_ID_ES = 'voice_es';
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    calls.push(String(url)); assert.equal(new Headers(options?.headers).get('xi-api-key'), 'unit-test-only');
    if (String(url).includes('get-signed-url')) return Response.json({ signed_url: 'wss://example.test/session' });
    assert.equal(JSON.parse(String(options?.body)).language_code, 'es');
    return new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  assert.ok(await speakStream('Hola Rosa', 'es')); assert.match(calls[0], /voice_es\/stream/);
  assert.equal(await agentSignedUrl(), 'wss://example.test/session');
  delete process.env.ELEVENLABS_API_KEY; assert.equal(await speakStream('Hi', 'en'), null);
});
