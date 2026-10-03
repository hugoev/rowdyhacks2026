import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPayment, assessTranscript, levelFor } from '../lib/risk';
import { scanSamples, scenarios } from '../lib/scenarios';
import { inspect } from '../server/providers';

test('friction boundaries are exact', () => {
  assert.deepEqual([0, 29, 30, 59, 60, 84, 85, 100].map(levelFor), ['Low', 'Low', 'Medium', 'Medium', 'High', 'High', 'Critical', 'Critical']);
});
test('routine $40 bill has no friction', () => {
  assert.equal(assessPayment({ amount: 40, rail: 'bill', newPayee: false, activeCall: false, callScore: 0 }).score, 0);
});
test('$2,500 gift cards during a flagged call reaches Critical with reasons', () => {
  const result = assessPayment({ amount: 2500, rail: 'gift-card', newPayee: true, activeCall: true, callScore: 65 });
  assert.equal(result.level, 'Critical'); assert.ok(result.reasons.length >= 4);
});
test('IRS script produces at least three concrete tells', () => {
  const result = assessTranscript(scenarios.irs.lines.join(' '));
  assert.equal(result.level, 'Critical'); assert.ok(result.tells.length >= 3);
  assert.ok(result.tells.every(t => t.label && t.phrase && t.advice));
});
test('secrecy and failed family verification independently trigger Critical', () => {
  assert.equal(assessTranscript('Please don’t tell Mom.').level, 'Critical');
  assert.equal(assessTranscript('', true).level, 'Critical');
  assert.equal(assessTranscript('', false, true).score, 100);
});
test('ordinary dinner call has no detected signals', () => {
  assert.equal(assessTranscript(scenarios.normal.lines.join(' ')).score, 0);
});
for (const sample of scanSamples) test('prepared sample: ' + sample.title, async () => {
  const result = await inspect(sample.text);
  assert.equal(result.score >= 30, sample.risky);
  assert.ok(!/^safe$/i.test(result.verdict));
});
