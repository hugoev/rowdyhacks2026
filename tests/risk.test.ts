import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPayment, assessTranscript, levelFor } from '../lib/risk';
import { scenarios } from '../lib/scenarios';
import { leverScore, spotLevers } from '../lib/levers';

test('friction boundaries are exact', () => {
  assert.deepEqual([0, 29, 30, 59, 60, 84, 85, 100].map(levelFor), ['Low', 'Low', 'Medium', 'Medium', 'High', 'High', 'Critical', 'Critical']);
});
test('routine $40 bill has no friction', () => {
  assert.equal(assessPayment({ amount: 40, rail: 'bill', newPayee: false, activeCall: false, callScore: 0 }).score, 0);
});
test('Critical call evidence holds even a small otherwise ordinary payment', () => {
  assert.equal(assessPayment({ amount: 40, rail: 'bill', newPayee: false, activeCall: true, callScore: 85 }).level, 'Critical');
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
test('demo script lights all four levers plus payment pressure', () => {
  const levers = new Set(scenarios.grandson.lines.flatMap(line => spotLevers(line).map(hit => hit.lever)));
  for (const lever of ['emotion', 'urgency', 'isolation', 'payment'] as const) assert.ok(levers.has(lever), lever);
});
test('Spanish script lights levers too', () => {
  const levers = new Set(scenarios.nieto.lines.flatMap(line => spotLevers(line).map(hit => hit.lever)));
  assert.ok(levers.has('isolation') && levers.has('payment') && levers.has('emotion'));
});
for (const benign of ['Hi Grandma, are we still on for dinner Sunday?', 'This is Dr. Patel’s office reminding you of your appointment Tuesday at 10.', 'Frost Bank alert: did you make a $40 purchase at H-E-B? Reply in the app. We will never ask for your password.', 'Grandma, I got an A on my test today! Love you.'])
  test('benign call stays quiet: ' + benign.slice(0, 30), () => assert.deepEqual(spotLevers(benign), []));
test('lever score: isolation with money pressure is Critical; failed family word and Diego’s block are decisive', () => {
  assert.ok(leverScore(new Set(['isolation', 'payment']), false, false) >= 85);
  assert.equal(leverScore(new Set(), true, false), 90); assert.equal(leverScore(new Set(), false, true), 100);
  assert.ok(leverScore(new Set(['urgency']), false, false) < 30);
});
