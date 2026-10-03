import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store';

const gift = { amount: 2500, payee: 'Synthetic gift cards', rail: 'gift-card' as const, newPayee: true };
test('denial explains original evidence, verification, and outcome without keeping transcript or secret', async t => {
  const store = new Store(':memory:'); t.after(() => store.db.close());
  await store.setSafeWord('synthetic-family-word'); store.startCall();
  store.addLine('Grandma, I am in jail. Keep this secret. Buy gift cards right now. Private detail 12345.', 'manual');
  const payment = store.createPayment(gift);
  await store.verifyWord('incorrect'); const callback = store.requestCallback(); store.answerCallback(callback.id, 'no');
  store.decidePayment(payment.id, 'deny');
  const education = store.state.cases[0].education!;
  assert.match(education.whatHappened, /relative in trouble/);
  assert.equal(education.clues.length, 3); assert.equal(education.source, 'rules');
  assert.ok(education.protections.some(p => p.includes('safe word')));
  assert.ok(education.protections.some(p => p.includes('not the person calling')));
  assert.ok(education.protections.some(p => p.includes('paused')));
  assert.match(education.nextStep, /already have saved/);
  const saved = JSON.stringify(JSON.parse(store.get('state')!).cases);
  assert.ok(!saved.includes('12345')); assert.ok(!saved.includes('synthetic-family-word'));
  assert.equal(store.snapshot('relative', { demo: true, gemini: false, elevenlabs: false }).cases.length, 0);
});
test('later calls cannot supply evidence for an earlier denied payment', t => {
  const store = new Store(':memory:'); t.after(() => store.db.close());
  store.startCall(); store.addLine('IRS warrant, buy gift cards immediately.', 'manual');
  const payment = store.createPayment(gift); store.endCall(); store.startCall();
  store.addLine('Grandma, keep this secret.', 'manual'); const callback = store.requestCallback(); store.answerCallback(callback.id, 'no');
  store.decidePayment(payment.id, 'deny'); const file = store.state.cases[0];
  assert.match(file.education!.whatHappened, /government/);
  assert.ok(!file.education!.protections.some(p => p.includes('relative')));
  assert.ok(!file.tells.includes('Keep-it-secret request'));
});
test('approval and routine payments do not create a scam lesson', t => {
  const store = new Store(':memory:'); t.after(() => store.db.close());
  store.createPayment({ amount: 40, payee: 'Utilities', rail: 'bill', newPayee: false });
  assert.equal(store.state.cases.length, 0);
  const payment = store.createPayment(gift); store.decidePayment(payment.id, 'approve');
  assert.equal(store.state.cases[0].education, undefined);
});
test('verification stays with its payment when the original call ends before denial', t => {
  const store = new Store(':memory:'); t.after(() => store.db.close());
  store.startCall(); store.addLine('Grandma, buy gift cards urgently.', 'manual');
  const payment = store.createPayment(gift);
  const callback = store.requestCallback(); store.answerCallback(callback.id, 'no');
  store.endCall(); store.startCall(); store.decidePayment(payment.id, 'deny');
  assert.ok(store.state.cases[0].education!.protections.some(p => p.includes('not the person calling')));
});
test('older denied cases get a conservative explanation on restart', t => {
  const store = new Store(':memory:'); t.after(() => store.db.close());
  const payment = store.createPayment(gift); store.decidePayment(payment.id, 'deny');
  const saved = JSON.parse(store.get('state')!);
  delete saved.cases[0].education; delete saved.cases[0].evidence;
  const originalGet = Store.prototype.get;
  const get = t.mock.method(Store.prototype, 'get', function (this: Store, key: string) { return key === 'state' ? JSON.stringify(saved) : originalGet.call(this, key); });
  const migrated = new Store(':memory:'); t.after(() => migrated.db.close()); get.mock.restore();
  const education = migrated.state.cases[0].education!;
  assert.match(education.whatHappened, /does not prove/);
  assert.equal(education.protections.length, 1);
});
