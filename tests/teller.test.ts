import test from 'node:test';
import assert from 'node:assert/strict';
import { billPayment, median, scamPayment, seedTransactions } from '../lib/demo-data';
import { riskRule } from '../lib/risk';
import { openingCue, systemInstruction, tellerConfig, tellerTools, toolNames } from '../lib/teller-config';
import { Demo, fallbackFinish } from '../server/state';
import { localRisk, RISK_QUERY, Tiger, TIGER_SCHEMA, type SqlClient } from '../server/tiger';
import { agentSignedUrl } from '../server/elevenlabs';
import { mintTellerToken } from '../server/gemini';

const config = { gemini: false, elevenlabs: false, scammer: false, verifier: false, tiger: false };

test('seeded history: typical payment ~$86, so $2,500 is ~29x', () => {
  const history = seedTransactions();
  assert.ok(history.length >= 140);
  assert.equal(median(history.map(t => t.amount)), 86);
  const check = localRisk(scamPayment.payee, scamPayment.amount, scamPayment.rail);
  assert.equal(check.typical, 86); assert.equal(check.multiple, 29); assert.equal(check.isNewPayee, true); assert.equal(check.trigger, true);
});
test('acceptance 1: $40 to City Electric (known payee) never opens Tripwire', () => {
  const check = localRisk(billPayment.payee, billPayment.amount, billPayment.rail);
  assert.equal(check.isNewPayee, false); assert.equal(check.trigger, false);
});
test('risk rule: >5x typical AND (new payee OR irreversible rail)', () => {
  const base = { typical: 86, knownPayees: ['Diego Garcia', 'City Electric'] };
  assert.equal(riskRule({ ...base, payee: 'Diego Garcia', amount: 2500, rail: 'ach' }, 'local').trigger, false, 'large but known payee, reversible');
  assert.equal(riskRule({ ...base, payee: 'Diego Garcia', amount: 2500, rail: 'instant' }, 'local').trigger, true, 'known payee but instant');
  assert.equal(riskRule({ ...base, payee: 'New Plumber', amount: 400, rail: 'ach' }, 'local').trigger, false, 'new payee but under 5x');
  assert.equal(riskRule({ ...base, payee: 'New Plumber', amount: 431, rail: 'ach' }, 'local').trigger, true, 'new payee over 5x');
  assert.equal(riskRule({ ...base, payee: ' city electric ', amount: 40, rail: 'bill-pay' }, 'local').isNewPayee, false, 'payee match ignores case and spaces');
});
test('teller config: three tools, payment context, no secrets, language', () => {
  assert.deepEqual(tellerTools.map(t => t.name), [...toolNames]);
  const check = localRisk(scamPayment.payee, scamPayment.amount, scamPayment.rail);
  const prompt = systemInstruction(check, 'en');
  for (const fact of ['$2,500', 'M. Ellis Legal', '29 times', '$86', 'Diego', 'Ana']) assert.ok(prompt.includes(fact), fact);
  assert.match(prompt, /Never call call_trusted_contact before asking/);
  assert.match(systemInstruction(check, 'es'), /Start in Spanish/);
  const cfg = JSON.stringify(tellerConfig(check, 'en', { pushToTalk: true }));
  assert.ok(cfg.includes('"disabled":true') && cfg.includes('outputAudioTranscription'));
  assert.ok(!/AIza|xi-api-key|sk_/.test(cfg));
  assert.match(openingCue('es'), /Rosa acaba de tocar Enviar/);
});
test('demo flow: send -> ring Diego -> result -> hold -> case file -> reset', () => {
  let now = 1_000_000; const demo = new Demo(config, () => now);
  const check = localRisk(scamPayment.payee, scamPayment.amount, scamPayment.rail);
  demo.sent(check); assert.equal(demo.state.phase, 'tripwire');
  const ring = demo.callContact('diego', 'you were arrested and need bail today');
  assert.equal(ring.who, 'diego'); assert.equal(ring.agent, 'verifier');
  assert.equal(ring.variables.amount, '$2,500'); assert.equal(ring.variables.contact_name, 'Diego');
  demo.ringStatus(ring.id, 'answered'); now += 20_000;
  demo.result('not_me', "I'm fine", 'verifier'); now += 5_000;
  demo.decide('hold', 'Diego did not ask for money', 'gemini');
  assert.equal(demo.decide('release', 'second decision ignored', 'gemini').decision, 'hold', 'first decision is final');
  const file = demo.finish({ job_name: 'The Bail Job', impersonated: 'her grandson Diego', pressure_quotes: ['arrested', 'bail today', ''], cover_quote: "don't tell Mom", getaway: '$2,500 instant transfer to M. Ellis Legal', foiled_by: 'Tripwire called the real Diego', tip: 'Hang up and call Diego yourself.' }, 'gemini');
  assert.equal(file.outcome, 'foiled'); assert.equal(file.number, 1); assert.deepEqual(file.pressure, ['arrested', 'bail today']);
  assert.equal(file.secondsToStop, 25); assert.equal(demo.state.phase, 'outcome'); assert.equal(demo.getCase('latest')?.id, file.id);
  demo.reset(); assert.equal(demo.state.phase, 'home'); assert.equal(demo.state.ring, null); assert.equal(demo.state.caseFile, null);
  assert.equal(demo.getCase(file.id)?.jobName, 'The Bail Job', 'case files survive a reset for the monitor');
});
test('acceptance 5: forced "confirmed" releases; scam call carries coach mode; ordinary sends skip the teller', () => {
  const demo = new Demo(config);
  demo.setCoach(true); assert.equal(demo.scamCall().variables.coach, 'on');
  demo.setCoach(false); assert.deepEqual(demo.scamCall().variables, {});
  demo.sent(localRisk(scamPayment.payee, scamPayment.amount, scamPayment.rail));
  demo.result('confirmed', '', 'operator');
  const file = demo.finish(fallbackFinish('', demo.state.check!, 'confirmed', 'en'), 'rules');
  assert.equal(file.outcome, 'released'); assert.equal(demo.state.decision?.decision, 'release');
  demo.reset(); demo.sent(localRisk(billPayment.payee, billPayment.amount, billPayment.rail));
  assert.equal(demo.state.phase, 'outcome'); assert.equal(demo.state.decision?.decision, 'release');
});
test('rules case file quotes only what Rosa said and strips control characters', () => {
  const check = localRisk(scamPayment.payee, scamPayment.amount, scamPayment.rail);
  const fields = fallbackFinish('He got arrested and needs bail today. He said don\'t tell Mom.', check, 'not_me', 'en');
  assert.equal(fields.job_name, 'The Bail Job'); assert.deepEqual(fields.pressure_quotes, ['arrested', 'bail', 'today']);
  assert.equal(fields.cover_quote, "don't tell mom"); assert.match(fields.getaway, /29x/);
  assert.deepEqual(fallbackFinish('', check, 'not_me', 'en').pressure_quotes, []);
  assert.match(fallbackFinish('', check, 'not_me', 'es').tip, /llama tú/);
  const demo = new Demo(config); demo.sent(check);
  const file = demo.finish({ ...fields, job_name: 'The\u0007 Bail\nJob' }, 'rules');
  assert.equal(file.jobName, 'The Bail Job');
});
test('Tiger: schema has the hypertable, continuous aggregate, and cases; risk query and case rows round-trip', async () => {
  assert.match(TIGER_SCHEMA, /create_hypertable\('teller\.transactions'/); assert.match(TIGER_SCHEMA, /timescaledb\.continuous/); assert.match(TIGER_SCHEMA, /teller\.cases/);
  const calls: { sql: string; values?: unknown[] }[] = [];
  const client: SqlClient = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: sql === RISK_QUERY ? [{ typical: '86', known: values?.[0] === 'City Electric' }] : [] }; }, end: async () => {} };
  const tiger = new Tiger(client);
  const scam = await tiger.check(scamPayment.payee, 2500, 'instant');
  assert.deepEqual([scam.source, scam.multiple, scam.isNewPayee, scam.trigger], ['tiger', 29, true, true]);
  assert.equal((await tiger.check('City Electric', 40, 'bill-pay')).trigger, false);
  const demo = new Demo(config); demo.sent(scam); demo.decide('hold', 'x', 'gemini');
  const file = demo.finish(fallbackFinish('arrested', scam, 'not_me', 'en'), 'rules');
  assert.equal(await tiger.saveCase(file), true);
  assert.ok(calls.some(c => c.sql.includes('INSERT INTO teller.cases') && (c.values as unknown[]).includes(file.id)));
});
test('Tiger outage falls back to the same local history, labeled', async () => {
  const tiger = new Tiger({ query: async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); }, end: async () => {} });
  const check = await tiger.check(scamPayment.payee, 2500, 'instant');
  assert.equal(check.source, 'local'); assert.equal(check.trigger, true); assert.equal(tiger.state, 'degraded');
  assert.equal(await tiger.saveCase({} as never), false);
});
test('keys stay server-side: no Gemini key means no token; agent sessions use a signed URL', async t => {
  const original = { ...process.env }; t.after(() => { process.env = original; });
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(mintTellerToken(localRisk(scamPayment.payee, 2500, 'instant'), 'en'), /not configured/);
  process.env.ELEVENLABS_API_KEY = 'unit-test-only'; process.env.EL_AGENT_VERIFIER_ID = 'agent_verifier'; delete process.env.EL_AGENT_SCAMMER_ID;
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    assert.match(String(url), /agent_id=agent_verifier/); assert.equal(new Headers(options?.headers).get('xi-api-key'), 'unit-test-only');
    return Response.json({ signed_url: 'wss://example.test/session' });
  });
  assert.equal(await agentSignedUrl('verifier'), 'wss://example.test/session');
  delete process.env.ELEVENLABS_AGENT_ID; await assert.rejects(agentSignedUrl('scammer'), /Configure the scammer agent/);
});
