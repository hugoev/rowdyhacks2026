export const scamWeatherTypes = ['Government impostor', 'Family emergency', 'Tech support', 'Romance', 'Gift cards / crypto', 'Fake job / check'] as const;
export type ScamWeatherType = typeof scamWeatherTypes[number];
export type ScamWeatherDay = { date: string; total: number; byType: { type: ScamWeatherType; count: number }[] };
export type ScamWeatherReport = { market: 'San Antonio'; source: 'seeded-demo' | 'tiger-seeded-demo'; generatedAt: number; days: ScamWeatherDay[]; totals: { type: ScamWeatherType; count: number }[] };

function hash(value: string) { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; }
export function makeScamWeather(now = Date.now(), source: ScamWeatherReport['source'] = 'seeded-demo'): ScamWeatherReport {
  const today = new Date(now); const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Array.from({ length: 30 }, (_, offset) => {
    const at = new Date(midnight - (29 - offset) * 86_400_000); const date = at.toISOString().slice(0, 10);
    const byType = scamWeatherTypes.map((type, index) => ({ type, count: 2 + hash(`${date}:${type}`) % (index < 2 ? 13 : 9) }));
    return { date, total: byType.reduce((sum, item) => sum + item.count, 0), byType };
  });
  const totals = scamWeatherTypes.map(type => ({ type, count: days.reduce((sum, day) => sum + (day.byType.find(item => item.type === type)?.count || 0), 0) }));
  return { market: 'San Antonio', source, generatedAt: now, days, totals };
}
