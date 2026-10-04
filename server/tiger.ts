import pg, { type PoolConfig } from 'pg';
import { median, seedTransactions, type Transaction } from '../lib/demo-data';
import { riskRule } from '../lib/risk';
import type { CaseFile, Rail, RiskCheck } from '../lib/types';

export type SqlClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; end: () => Promise<void> };

export function tigerUrl() { return process.env.TIGER_DATABASE_URL || process.env.DATABASE_URL || ''; }
export function tigerPoolConfig(connectionString: string, ca?: string): PoolConfig {
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error('TIGER_DATABASE_URL is not a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('TIGER_DATABASE_URL must use postgres:// or postgresql://.');
  const mode = url.searchParams.get('sslmode') || 'verify-full';
  if (!['require', 'verify-ca', 'verify-full'].includes(mode)) throw new Error('Tiger Data requires an encrypted PostgreSQL connection.');
  // "require" encrypts without authenticating the certificate (Tiger's free tier
  // uses self-signed certificates); a supplied CA or verify-* checks it.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: mode !== 'require' || !!ca, ...(ca ? { ca: ca.replace(/\\n/g, '\n') } : {}) }, max: 3, connectionTimeoutMillis: 5000, query_timeout: 8000, statement_timeout: 8000, application_name: 'tripwire-teller' };
}

// Rosa's history is a hypertable; a continuous aggregate keeps her daily
// payment medians; the risk check and every case file share one database.
export const TIGER_SCHEMA = `
SELECT pg_advisory_xact_lock(hashtext('tripwire_teller_schema_v3'));
CREATE SCHEMA IF NOT EXISTS teller;
CREATE TABLE IF NOT EXISTS teller.transactions (
  ts TIMESTAMPTZ NOT NULL,
  payee TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  rail TEXT NOT NULL CHECK (rail IN ('instant','ach','bill-pay'))
);
SELECT create_hypertable('teller.transactions', 'ts', if_not_exists => TRUE, migrate_data => TRUE);
CREATE MATERIALIZED VIEW IF NOT EXISTS teller.daily_payments
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', ts) AS day,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) AS median_amount,
       count(*) AS payments
FROM teller.transactions
GROUP BY time_bucket(INTERVAL '1 day', ts)
WITH NO DATA;
CREATE TABLE IF NOT EXISTS teller.cases (
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payee TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('foiled','released')),
  job_name TEXT NOT NULL,
  impersonated TEXT NOT NULL,
  pressure TEXT[] NOT NULL,
  cover TEXT NOT NULL,
  getaway TEXT NOT NULL,
  foiled_by TEXT NOT NULL,
  tip TEXT NOT NULL,
  seconds_to_stop INT NOT NULL,
  written_by TEXT NOT NULL,
  PRIMARY KEY (ts, id)
);
SELECT create_hypertable('teller.cases', 'ts', if_not_exists => TRUE, migrate_data => TRUE);
`;

// Typical payment = median of her daily medians over 12 months (the continuous
// aggregate); known payees = anyone she has paid before.
export const RISK_QUERY = `
SELECT
  (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY median_amount) FROM teller.daily_payments WHERE day > now() - INTERVAL '13 months') AS typical,
  EXISTS (SELECT 1 FROM teller.transactions WHERE lower(payee) = lower($1)) AS known`;

/** Local copy of the same seed, used when Tiger Data isn't configured or reachable (labeled "local"). */
const local = (() => {
  const history = seedTransactions();
  const byDay = new Map<string, number[]>();
  for (const t of history) { const day = t.ts.toISOString().slice(0, 10); byDay.set(day, [...(byDay.get(day) || []), t.amount]); }
  return { typical: median([...byDay.values()].map(median)), payees: history.map(t => t.payee) };
})();
export function localRisk(payee: string, amount: number, rail: Rail): RiskCheck {
  return riskRule({ payee, amount, rail, typical: local.typical, knownPayees: local.payees }, 'local');
}

export class Tiger {
  private pool: SqlClient | null;
  private ready: Promise<void> | null = null;
  state: 'unconfigured' | 'working' | 'degraded' = 'unconfigured';
  constructor(client?: SqlClient) {
    const url = tigerUrl();
    this.pool = client || (url ? new pg.Pool(tigerPoolConfig(url, process.env.TIGER_CA_CERT)) as unknown as SqlClient : null);
    if (this.pool) this.state = 'working';
  }
  get configured() { return !!this.pool; }
  private init() {
    if (!this.pool) return Promise.reject(new Error('Tiger Data is not configured.'));
    this.ready ??= this.pool.query(TIGER_SCHEMA).then(() => undefined).catch(error => { this.ready = null; throw error; });
    return this.ready;
  }
  /** One query on Send: is this payee new, and how many times her typical payment is this? */
  async check(payee: string, amount: number, rail: Rail): Promise<RiskCheck> {
    if (!this.pool) return localRisk(payee, amount, rail);
    try {
      await this.init();
      const { rows } = await this.pool.query(RISK_QUERY, [payee.trim()]);
      const typical = Number(rows[0]?.typical);
      if (!Number.isFinite(typical) || typical <= 0) throw new Error('No history seeded. Run npm run seed.');
      this.state = 'working';
      return riskRule({ payee, amount, rail, typical, knownPayees: rows[0]?.known ? [payee] : [] }, 'tiger');
    } catch (error) {
      this.state = 'degraded';
      console.warn(JSON.stringify({ provider: 'tiger', task: 'risk', error: (error as Error).message }));
      return localRisk(payee, amount, rail);
    }
  }
  async saveCase(file: CaseFile) {
    if (!this.pool) return false;
    try {
      await this.init();
      await this.pool.query(`INSERT INTO teller.cases (ts,id,amount,payee,outcome,job_name,impersonated,pressure,cover,getaway,foiled_by,tip,seconds_to_stop,written_by)
        VALUES (to_timestamp($1 / 1000.0),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
        [file.at, file.id, file.amount, file.payee, file.outcome, file.jobName, file.impersonated, file.pressure, file.cover, file.getaway, file.foiledBy, file.tip, file.secondsToStop, file.writtenBy]);
      this.state = 'working'; return true;
    } catch (error) {
      this.state = 'degraded';
      console.warn(JSON.stringify({ provider: 'tiger', task: 'case', error: (error as Error).message }));
      return false;
    }
  }
  async caseCount() {
    if (!this.pool) return 0;
    try { await this.init(); const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM teller.cases'); return Number(rows[0]?.n) || 0; } catch { return 0; }
  }
  /** Seeds Rosa's 12 months once (idempotent: replaces her history). */
  async seed(history: Transaction[] = seedTransactions()) {
    if (!this.pool) throw new Error('Set TIGER_DATABASE_URL (or DATABASE_URL) first.');
    await this.init();
    await this.pool.query('DELETE FROM teller.transactions');
    const values: unknown[] = [];
    const rows = history.map(t => { const o = values.length; values.push(t.ts, t.payee, t.amount, t.rail); return `($${o + 1},$${o + 2},$${o + 3},$${o + 4})`; });
    await this.pool.query(`INSERT INTO teller.transactions (ts,payee,amount,rail) VALUES ${rows.join(',')}`, values);
    await this.pool.query(`CALL refresh_continuous_aggregate('teller.daily_payments', NULL, NULL)`);
    return history.length;
  }
  async close() { await this.pool?.end(); }
}
