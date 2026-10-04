import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Store } from '../server/store';
import { TigerAnalytics, tigerPoolConfig } from '../server/tiger';

const connectionString = process.env.TIGER_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error('Set DATABASE_URL in your ignored .env file first.'); process.exit(1); }
const pool = new pg.Pool(tigerPoolConfig(connectionString, process.env.TIGER_CA_CERT));
pool.on('error', () => {});
let store: Store | undefined;
let analytics: TigerAnalytics | undefined;
try {
  const extensions = await pool.query("SELECT extversion FROM pg_extension WHERE extname='timescaledb'");
  const tls = await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
  assert.ok(extensions.rowCount, 'TimescaleDB extension missing');
  assert.equal(tls.rows[0]?.ssl, true, 'TLS connection required');
  if (process.argv.includes('--setup') || process.argv.includes('--smoke')) {
    // A unique test stream keeps synthetic checks out of the real dashboard.
    store = new Store(':memory:'); analytics = new TigerAnalytics(store, connectionString);
    if (process.argv.includes('--smoke')) {
      store.startCall();
      store.addLine('Grandma, I am in jail. Please don’t tell Mom. Buy gift cards right now.', 'scripted');
      store.createPayment({ payee: 'Synthetic Tiger integration fixture', amount: 2500, rail: 'gift-card', newPayee: true });
    }
    await analytics.flush();
    if (analytics.status().state !== 'working') throw new Error('Tiger setup did not complete');
    if (process.argv.includes('--smoke')) {
      const history = analytics.history('guardian')!;
      assert.equal(history.points.length, 3); assert.equal(history.total, 3); assert.equal(history.peak, 100);
      assert.equal(store.pendingRiskCount(), 0);
      // Repeat the upload to exercise remote duplicate protection.
      store.enableAnalytics(); await analytics.flush();
      assert.equal(analytics.history('guardian')!.total, 3);
      console.log(JSON.stringify({ connected: true, tls: true, timescale: extensions.rows[0].extversion, syntheticEvents: history.total, peakRisk: history.peak, minuteBuckets: history.minutes.length, duplicateProtection: 'passed' }));
    } else console.log(JSON.stringify({ connected: true, tls: true, timescale: extensions.rows[0].extversion, schema: 'tripwire', hypertable: 'risk_events', continuousAggregate: 'risk_minute' }));
  } else {
    const schema = await pool.query("SELECT to_regclass('tripwire.risk_events') AS events, to_regclass('tripwire.risk_minute') AS rollup");
    console.log(JSON.stringify({ connected: true, tls: true, timescale: extensions.rows[0].extversion, schemaReady: !!schema.rows[0]?.events && !!schema.rows[0]?.rollup }));
  }
} catch (error) {
  // Driver errors may embed credentials/hostnames. Never print the raw error.
  const code = String((error as { code?: string }).code || 'CHECK_FAILED').replace(/[^A-Z0-9_]/g, '');
  console.error(`Tiger verification failed (${code}). Check the database status, credentials, network access, and TLS certificate configuration.`); process.exitCode = 1;
} finally { await analytics?.close(); await pool.end(); store?.db.close(); }
