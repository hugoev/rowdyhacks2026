import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store';
import { TigerAnalytics, tigerPoolConfig, type SqlClient } from '../server/tiger';
import { TIGER_MIGRATION } from '../server/tiger-schema';

function mockClient() {
  const calls: { sql: string; values: unknown[] }[] = [];
  const rows = new Map<string, Record<string, unknown>>();
  const control = { fail: false };
  const client: SqlClient = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('pg_extension')) return { rows: [{ extversion: '2-test' }] };
      if (sql.includes('SELECT bucket, scam_type, reports')) return { rows: [{ bucket: new Date(), scam_type: 'Government impostor', reports: 8 }] };
      if (sql.includes('INSERT INTO tripwire.risk_events')) {
        if (control.fail) throw Object.assign(new Error('Never expose postgres://private-password'), { code: 'ECONNREFUSED' });
        for (let i = 0; i < values.length; i += 7) rows.set(String(values[i + 1]), { recorded_at: values[i], event_id: values[i + 1], stream_id: values[i + 2], score: values[i + 3], kind: values[i + 4] });
      }
      const selected = [...rows.values()].filter(row => row.stream_id === values[0]);
      if (sql.includes('SELECT recorded_at')) return { rows: selected.reverse() };
      if (sql.includes('SELECT bucket')) return { rows: selected.length ? [{ bucket: selected[0].recorded_at, peak_score: Math.max(...selected.map(r => Number(r.score))), average_score: 50, samples: selected.length }] : [] };
      return { rows: [] };
    }, async end() {},
  };
  return { client, calls, rows, control };
}
test('Postgres connection honors require and verify-full modes while always requiring TLS', () => {
  const config = tigerPoolConfig('postgres://user:private-password@database.example:5432/test?sslmode=require');
  assert.equal((config.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, false);
  assert.equal((tigerPoolConfig('postgres://user:private-password@database.example:5432/test?sslmode=verify-full').ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  assert.throws(() => tigerPoolConfig('postgres://user:private-password@database.example:5432/test?sslmode=disable'), /encrypted/);
  assert.ok(!config.connectionString?.includes('sslmode='));
  assert.throws(() => tigerPoolConfig('https://example.com'), /PostgreSQL|postgres/);
});
test('unconfigured analytics stays local and never queues cloud writes', async () => {
  const store = new Store(':memory:'); const analytics = new TigerAnalytics(store);
  store.startCall(); await analytics.flush();
  assert.equal(analytics.status().state, 'unconfigured'); assert.equal(store.pendingRiskCount(), 0);
  assert.equal(analytics.history('guardian')?.source, 'local'); assert.equal(analytics.history('relative'), undefined); store.db.close();
});
test('successful persistence acknowledges outbox events and reads raw history plus continuous aggregates', async () => {
  const store = new Store(':memory:'); const mock = mockClient(); const analytics = new TigerAnalytics(store, '', mock.client);
  store.startCall(); store.addLine('Grandma I am in jail. Don’t tell Mom. Buy gift cards right now.', 'manual');
  assert.equal(store.pendingRiskCount(), 2); await analytics.flush();
  assert.equal(store.pendingRiskCount(), 0); assert.equal(analytics.status().source, 'tiger');
  assert.equal(analytics.history('guardian')?.total, 2); assert.equal(analytics.history('guardian')?.peak, 100);
  assert.ok(mock.calls.some(c => c.sql === TIGER_MIGRATION)); assert.ok(mock.calls.some(c => c.sql.includes('ON CONFLICT')));
  assert.ok(TIGER_MIGRATION.includes('tripwire.eval_runs'));
  assert.equal(analytics.history('protected'), undefined); store.db.close();
});
test('cloud failures preserve the durable outbox and retry idempotently after backoff', async () => {
  let now = Date.now(); const store = new Store(':memory:'); const mock = mockClient(); const analytics = new TigerAnalytics(store, '', mock.client, () => now);
  store.startCall(); mock.control.fail = true; await analytics.flush();
  assert.equal(store.pendingRiskCount(), 1); assert.equal(analytics.status().state, 'degraded');
  assert.ok(!JSON.stringify(analytics.status()).includes('private-password'));
  mock.control.fail = false; await analytics.flush(); assert.equal(store.pendingRiskCount(), 1);
  now += 30001; await analytics.flush(); assert.equal(store.pendingRiskCount(), 0); assert.equal(mock.rows.size, 1);
  store.enableAnalytics(); await analytics.flush(); assert.equal(mock.rows.size, 1); store.db.close();
});
test('risk metadata excludes transcripts, caller phrases, recipient details, amounts, and safe words', () => {
  const store = new Store(':memory:'); store.enableAnalytics(); store.startCall();
  store.addLine('Grandma, private transcript details. I am in jail. Please hurry.', 'manual');
  store.createPayment({ payee: 'PRIVATE RECIPIENT', amount: 2500, rail: 'gift-card', newPayee: true });
  const payload = JSON.stringify(store.pendingRiskEvents());
  for (const secret of ['private transcript', 'PRIVATE RECIPIENT', '2500', 'safeWordHash', 'phrase']) assert.ok(!payload.includes(secret));
  store.db.close();
});
test('reset rotates the analytics stream without deleting remote history or pending events', async () => {
  const store = new Store(':memory:'); const mock = mockClient(); const analytics = new TigerAnalytics(store, '', mock.client);
  store.startCall(); await analytics.flush(); const oldStream = store.analyticsStream();
  store.reset(); assert.notEqual(store.analyticsStream(), oldStream); assert.equal(analytics.history('guardian')?.points.length, 0);
  await analytics.flush(); assert.equal(analytics.history('guardian')?.total, 0); assert.equal(mock.rows.size, 1); store.db.close();
});
