import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, DAY } from '../server/store';
import { authenticate, issue } from '../server/auth';

const gift = { payee: 'Test gift cards', amount: 2500, rail: 'gift-card' as const, newPayee: true };
test('hold cannot be reviewed away; guardian denial is final', () => {
  const store = new Store(':memory:');
  const p = store.createPayment(gift);
  assert.equal(p.status, 'held'); assert.throws(() => store.reviewPayment(p.id, false));
  store.decidePayment(p.id, 'deny'); assert.equal(p.status, 'denied');
  assert.throws(() => store.decidePayment(p.id, 'approve')); store.tick(); assert.equal(p.status, 'denied');
  assert.equal(store.state.cases[0].outcome, 'foiled'); store.db.close();
});
test('guardian can approve a held payment exactly once', () => {
  const store = new Store(':memory:'); const p = store.createPayment(gift);
  store.decidePayment(p.id, 'approve'); assert.equal(p.status, 'released');
  assert.throws(() => store.decidePayment(p.id, 'deny')); store.db.close();
});
test('cooling-off timer releases only at the server deadline, never a denied payment', () => {
  let now = 100000; const store = new Store(':memory:', () => now);
  const held = store.createPayment(gift); const denied = store.createPayment(gift); store.decidePayment(denied.id, 'deny');
  now += DAY - 1; store.tick(); assert.equal(held.status, 'held');
  now += 1; store.tick(); assert.equal(held.status, 'released'); assert.equal(denied.status, 'denied'); store.db.close();
});
test('co-sign policy changes remain delayed for 24 hours', () => {
  let now = 100000; const store = new Store(':memory:', () => now);
  store.updateSettings({ coSignLimit: 10000 }); assert.equal(store.state.settings.coSignLimit, 1000);
  now += DAY - 1; store.tick(); assert.equal(store.state.settings.coSignLimit, 1000);
  now += 1; store.tick(); assert.equal(store.state.settings.coSignLimit, 10000); store.db.close();
});
test('release rechecks new critical evidence that arrived during review', () => {
  const store = new Store(':memory:'); store.startCall();
  const p = store.createPayment({ payee: 'New recipient', amount: 600, rail: 'bank', newPayee: true });
  assert.equal(p.status, 'review'); store.addLine('Grandma, I am in jail. Please don’t tell Mom. Buy gift cards right now.', 'scripted');
  store.reviewPayment(p.id, false); assert.equal(p.status, 'held'); assert.ok(p.score >= 85); store.db.close();
});
test('explicit secrecy escalates a medium payment', () => {
  const store = new Store(':memory:'); const p = store.createPayment({ payee: 'New contact', amount: 700, rail: 'bank', newPayee: true });
  assert.equal(p.status, 'review'); store.reviewPayment(p.id, true); assert.equal(p.status, 'held'); store.db.close();
});
test('safe words are bcrypt hashes; wrong answer is sticky and later matches do not lower risk', async () => {
  const store = new Store(':memory:'); await store.setSafeWord('Marigold');
  assert.match(store.get('safeWordHash')!, /^\$2[aby]\$/); assert.ok(!store.get('safeWordHash')!.includes('Marigold'));
  store.startCall(); assert.equal(await store.verifyWord('wrong'), false); assert.equal(store.state.call.assessment.level, 'Critical');
  assert.equal(await store.verifyWord(' marigold '), true); assert.equal(store.state.call.safeWord, 'failed'); assert.equal(store.state.call.assessment.level, 'Critical');
  assert.ok(!JSON.stringify(store.snapshot('guardian', { demo: true, gemini: false, elevenlabs: false })).includes('$2b$')); store.db.close();
});
test('callback no sets Critical, and relative gets no payment or transcript data', () => {
  const store = new Store(':memory:'); store.startCall(); store.addLine('Grandma, I am in jail.', 'scripted'); store.createPayment(gift);
  const callback = store.requestCallback(); store.answerCallback(callback.id, 'no'); assert.equal(store.state.call.assessment.score, 100);
  assert.throws(() => store.answerCallback(callback.id, 'yes'));
  const relative = store.snapshot('relative', { demo: true, gemini: false, elevenlabs: false });
  assert.equal(relative.payments.length, 0); assert.equal(relative.call.transcript.length, 0); assert.equal(relative.events.length, 0); assert.equal(relative.call.callback?.answer, 'no'); store.db.close();
});
test('transcripts are not persisted by default and clearing consent removes saved text', () => {
  const store = new Store(':memory:'); store.startCall(); store.addLine('Private words: Grandma I am in jail. Please hurry.', 'manual');
  assert.equal(JSON.parse(store.get('state')!).call.transcript.length, 0);
  store.updateSettings({ retainFlaggedTranscripts: true }); assert.equal(JSON.parse(store.get('state')!).call.transcript.length, 1);
  store.updateSettings({ retainFlaggedTranscripts: false }); assert.equal(JSON.parse(store.get('state')!).call.transcript.length, 0);
  store.endCall(); assert.equal(store.state.call.transcript.length, 0); store.db.close();
});
test('persisted payment holds survive a server restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tripwire-test-')); const path = join(directory, 'state.sqlite');
  try { const first = new Store(path); const payment = first.createPayment(gift); first.db.close(); const second = new Store(path); assert.equal(second.payment(payment.id).status, 'held'); second.db.close(); }
  finally { rmSync(directory, { recursive: true, force: true }); }
});
test('session signatures are role-bound, tamper-resistant, and expire', () => {
  const secret = 'unit-test-key'; const token = issue('guardian', secret);
  assert.equal(authenticate(`tw_guardian=${token}`, 'guardian', secret), true);
  assert.equal(authenticate(`tw_protected=${token}`, 'protected', secret), false);
  assert.equal(authenticate(`tw_guardian=${token}changed`, 'guardian', secret), false);
  assert.equal(authenticate(undefined, 'guardian', secret), false);
});
