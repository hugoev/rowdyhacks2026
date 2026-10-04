import test from 'node:test';
import assert from 'node:assert/strict';
import { drillScenarios, scoreDrill, type DrillAction } from '../lib/heist-drill';

test('drill covers the scam scripts and scores protective choices with clear evidence', () => {
  assert.deepEqual(drillScenarios.map(item => item.id), ['government', 'family', 'tech-support', 'romance', 'safe-account', 'fake-job']);
  for (const scenario of drillScenarios) {
    assert.equal(scenario.rounds.length, 3);
    const allSafe = scenario.rounds.map(item => item.choices.find(choice => choice.safe)!.id);
    const result = scoreDrill(scenario, allSafe);
    assert.equal(result.score, 100); assert.equal(result.missed.length, 0); assert.equal(result.source, 'rules');
    const unsafe = scenario.rounds.map(item => item.choices.find(choice => !choice.safe)!.id);
    const missed = scoreDrill(scenario, unsafe);
    assert.equal(missed.score, 0); assert.equal(missed.missed.length, 3);
    assert.ok(missed.feedback.length > 0 && missed.nextTime.length > 0);
  }
  const mixed: DrillAction[] = ['independent-check', 'send-money', 'tell-trusted-person'];
  assert.equal(scoreDrill(drillScenarios[0], mixed).score, 67);
});
