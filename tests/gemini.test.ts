import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCall, analyzeScan, geminiModel, summarizePayment, summarizeCase } from '../server/gemini';
import { providerStatuses } from '../server/provider-status';
import { inspect } from '../server/providers';
import { Store } from '../server/store';
import { CallScheduler } from '../server/call-scheduler';

const response = (value: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10 } }), { status: 200 });
test('Gemini schemas, evidence, summaries, and explicit failures', async t => {
  const original = { ...process.env };
  t.after(() => { process.env = original; });
  process.env.GEMINI_API_KEY = 'unit-test-only'; process.env.GEMINI_MAX_REQUESTS_PER_MINUTE = '100';
  process.env.GEMINI_CALL_MODEL = 'test-call'; process.env.GEMINI_SCAN_MODEL = 'test-scan'; process.env.GEMINI_SUMMARY_MODEL = 'test-summary';
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body));
    assert.ok(body.generationConfig.responseJsonSchema);
    assert.ok(body.systemInstruction.parts[0].text.includes('untrusted'));
    return response({ score: 75, scamType: 'Impostor', advice: 'Call a trusted number.', tells: [{ label: 'Urgency', phrase: 'act now' }] });
  });
  const result = await analyzeCall('Please act now.'); assert.equal(result.source, 'gemini'); assert.equal(result.tells.length, 1);
  assert.equal(providerStatuses().geminiCall?.state, 'working');
  fetchMock.mock.mockImplementation(async () => response({ score: 75, scamType: 'Impostor', advice: 'Pause.', tells: [{ label: 'Invented', phrase: 'not in transcript' }] }));
  await assert.rejects(analyzeCall('Dinner on Sunday.'), /unsupported evidence/);
  assert.equal(providerStatuses().geminiCall?.state, 'degraded');
  fetchMock.mock.mockImplementation(async () => response({ score: 'incorrect' }));
  await assert.rejects(analyzeScan('text'), /invalid response/);
  fetchMock.mock.mockImplementation(async () => { throw new DOMException('test', 'TimeoutError'); });
  const fallback = await inspect('Buy gift cards now.'); assert.equal(fallback.source, 'rules'); assert.match(fallback.limitations!, /timeout/);
  await assert.rejects(inspect('', { data: 'AA==', mimeType: 'image/png' }), /temporarily unavailable/);
  fetchMock.mock.mockImplementation(async () => response({ summary: 'Gift-card request held. Call Rosa using her saved number.' }));
  const store = new Store(':memory:'); t.after(() => store.db.close());
  const payment = store.createPayment({ amount: 2500, payee: 'Demo', rail: 'gift-card', newPayee: true });
  assert.match(await summarizePayment(payment, ['Urgency']), /held/); assert.equal(payment.status, 'held');
  store.decidePayment(payment.id, 'deny');
  fetchMock.mock.mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.ok(!body.contents[0].parts[0].text.includes('2500'));
    return response({ whatHappened: 'This request had warning signs. Your family paused to check it.' });
  });
  const education = structuredClone(store.state.cases[0].education);
  assert.match(await summarizeCase(store.state.cases[0]), /warning signs/);
  assert.deepEqual(store.state.cases[0].education, education);
  fetchMock.mock.mockImplementation(async () => response({ whatHappened: '' }));
  await assert.rejects(summarizeCase(store.state.cases[0]), /invalid response/);
  process.env.GEMINI_CALL_MODEL = ''; process.env.GEMINI_MODEL = 'legacy'; assert.equal(geminiModel('call'), 'legacy');
});
test('429 backs off without retrying paid or alternate models', async t => {
  const original = { ...process.env }; t.after(() => { process.env = original; });
  process.env.GEMINI_API_KEY = 'test'; process.env.GEMINI_SCAN_MODEL = 'quota-test';
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }));
  await assert.rejects(analyzeScan('text'), /quota limited/);
  await assert.rejects(analyzeScan('text'), /quota limited/);
  assert.equal(mock.mock.callCount(), 1);
});
test('scheduler coalesces segments, prevents overlap, and cancels queued work', async () => {
  const scheduler = new CallScheduler(15); const jobs: number[] = [];
  let finish!: () => void;
  scheduler.submit('call', async () => { jobs.push(1); await new Promise<void>(resolve => { finish = resolve; }); });
  scheduler.submit('call', async () => { jobs.push(2); });
  scheduler.submit('call', async () => { jobs.push(3); });
  assert.deepEqual(jobs, [1]); finish();
  await new Promise(resolve => setTimeout(resolve, 40)); assert.deepEqual(jobs, [1, 3]);
  scheduler.submit('call', async () => { jobs.push(4); });
  scheduler.submit('call', async () => { jobs.push(5); }); scheduler.cancel();
  await new Promise(resolve => setTimeout(resolve, 30)); assert.ok(!jobs.includes(5));
});
test('successful lower AI score is attributed without reducing critical risk or applying ended-call evidence', () => {
  const store = new Store(':memory:'); store.startCall();
  const id = store.addLine('Keep this secret.', 'manual')!;
  store.enrichCall(id, { score: 20, level: 'Low', source: 'gemini', scamType: 'Unverified', advice: 'Pause.', tells: [] });
  assert.equal(store.state.call.assessment.score, 85); assert.equal(store.state.call.assessment.source, 'gemini');
  store.endCall(); store.startCall();
  store.enrichCall(id, { score: 100, level: 'Critical', source: 'gemini', scamType: 'Old', advice: 'Pause.', tells: [] });
  assert.equal(store.state.call.assessment.score, 0); store.db.close();
});
