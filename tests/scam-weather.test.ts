import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScamWeather, scamWeatherTypes } from '../lib/scam-weather';

test('Scam Weather is stable seeded demo data with exactly thirty anonymized daily aggregates', () => {
  const now = Date.UTC(2026, 9, 3, 13, 0); const first = makeScamWeather(now); const second = makeScamWeather(now);
  assert.deepEqual(first, second); assert.equal(first.market, 'San Antonio'); assert.equal(first.source, 'seeded-demo');
  assert.equal(first.days.length, 30); assert.equal(first.days[0].date, '2026-09-04'); assert.equal(first.days.at(-1)?.date, '2026-10-03');
  assert.deepEqual(first.totals.map(item => item.type), scamWeatherTypes);
  for (const day of first.days) {
    assert.equal(day.byType.length, scamWeatherTypes.length);
    assert.equal(day.total, day.byType.reduce((sum, item) => sum + item.count, 0));
    assert.ok(day.byType.every(item => Number.isInteger(item.count) && item.count >= 2));
    assert.ok(!('reporter' in day) && !('address' in day));
  }
});
