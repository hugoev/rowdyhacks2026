import pg, { type PoolConfig } from 'pg';
import type { AnalyticsEvent, AnalyticsStatus, RiskHistory, Role } from '../lib/types';
import { Store } from './store';
import { TIGER_MIGRATION } from './tiger-schema';

export type SqlClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; end: () => Promise<void> };
const timestamp = (value: unknown) => value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
export function tigerPoolConfig(connectionString: string, ca?: string): PoolConfig {
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error('DATABASE_URL is not a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use postgres:// or postgresql://.');
  const mode = url.searchParams.get('sslmode') || 'verify-full';
  if (!['require', 'verify-ca', 'verify-full'].includes(mode)) throw new Error('Tiger Data requires an encrypted PostgreSQL connection.');
  // Honor the supplied libpq mode. "require" encrypts without authenticating
  // the certificate, which supports Tiger's self-signed free-tier certificates.
  // A supplied CA or verify-full/verify-ca enables certificate verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: mode !== 'require' || !!ca, ...(ca ? { ca: ca.replace(/\\n/g, '\n') } : {}) }, max: 3, connectionTimeoutMillis: 5000, query_timeout: 10000, statement_timeout: 10000, application_name: 'tripwire-risk-analytics' };
}
function category(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === '28P01' || code === '28000') return 'authentication failed';
  if (code === '42501') return 'database permissions missing';
  if (code?.includes('CERT') || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return 'TLS certificate verification failed';
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') return 'database unreachable';
  return 'database temporarily unavailable';
}

export class TigerAnalytics {
  private client: SqlClient | null;
  private initialized = false;
  private busy = false;
  private retryAt = 0;
  private cached: RiskHistory | undefined;
  private cachedStream: string | undefined;
  private statusValue: AnalyticsStatus;
  onChange: () => void = () => {};
  constructor(private store: Store, connectionString = '', client?: SqlClient, private now: () => number = Date.now) {
    this.statusValue = { state: connectionString || client ? 'configured' : 'unconfigured', source: 'local', lastSuccessAt: null, pendingEvents: 0 };
    this.client = client || null;
    if (!client && connectionString) {
      try {
        const pool = new pg.Pool(tigerPoolConfig(connectionString, process.env.TIGER_CA_CERT));
        pool.on('error', error => { this.degraded(error); this.onChange(); });
        this.client = pool;
      } catch { this.statusValue = { ...this.statusValue, state: 'degraded', error: 'invalid database configuration' }; }
    }
    if (connectionString || client) store.enableAnalytics();
  }
  status(): AnalyticsStatus { return { ...this.statusValue, pendingEvents: this.store.pendingRiskCount() }; }
  history(role: Role): RiskHistory | undefined {
    if (role !== 'guardian') return undefined;
    if (this.statusValue.state === 'working' && this.cachedStream === this.store.analyticsStream() && this.cached) return structuredClone(this.cached);
    const points = this.store.state.events.slice(-60);
    return { source: 'local', points, minutes: [], peak: Math.max(0, ...points.map(p => p.score)), total: points.length };
  }
  private degraded(error: unknown) {
    this.statusValue = { ...this.statusValue, state: 'degraded', source: 'local', error: category(error) };
    this.retryAt = this.now() + 30000;
  }
  async flush(): Promise<void> {
    if (!this.client || this.busy || this.now() < this.retryAt) return;
    this.busy = true;
    try {
      if (!this.initialized) {
        const extension = await this.client.query("SELECT extversion FROM pg_extension WHERE extname='timescaledb'");
        if (!extension.rows.length) throw new Error('TimescaleDB extension is unavailable');
        await this.client.query(TIGER_MIGRATION); this.initialized = true;
      }
      // Bound each flush so an offline backlog cannot monopolize the server.
      for (let batch = 0; batch < 5; batch++) {
        const events = this.store.pendingRiskEvents(100); if (!events.length) break;
        await this.insert(events);
        // Ack only after the remote statement succeeds. A crash before ack is
        // retried with ON CONFLICT DO NOTHING, never duplicating a risk event.
        this.store.acknowledgeRiskEvents(events.map(event => event.id));
      }
      const stream = this.store.analyticsStream();
      const points = await this.client.query(`SELECT recorded_at, event_id, score, kind FROM tripwire.risk_events WHERE stream_id=$1 AND recorded_at > now() - INTERVAL '1 day' ORDER BY recorded_at DESC, event_id DESC LIMIT 60`, [stream]);
      const minutes = await this.client.query(`SELECT bucket, peak_score, average_score, samples FROM tripwire.risk_minute WHERE stream_id=$1 AND bucket > now() - INTERVAL '1 day' ORDER BY bucket DESC LIMIT 120`, [stream]);
      const buckets = minutes.rows.reverse().map(row => ({ at: timestamp(row.bucket), peak: Number(row.peak_score), average: Number(row.average_score), samples: Number(row.samples) }));
      this.cached = { source: 'tiger', points: points.rows.reverse().map(row => ({ id: String(row.event_id), at: timestamp(row.recorded_at), score: Number(row.score), kind: row.kind as AnalyticsEvent['kind'], label: 'Persisted risk event' })), minutes: buckets, peak: Math.max(0, ...buckets.map(row => row.peak)), total: buckets.reduce((sum, row) => sum + row.samples, 0) };
      this.cachedStream = stream;
      this.statusValue = { state: 'working', source: 'tiger', lastSuccessAt: this.now(), pendingEvents: this.store.pendingRiskCount() };
    } catch (error) { this.degraded(error); }
    finally { this.busy = false; this.onChange(); }
  }
  private async insert(events: AnalyticsEvent[]) {
    const values: unknown[] = [];
    const rows = events.map(event => {
      const offset = values.length; values.push(new Date(event.at), event.id, event.streamId, event.score, event.kind, event.scamType, event.callId);
      return '(' + Array.from({ length: 7 }, (_, i) => '$' + (offset + i + 1)).join(',') + ')';
    });
    await this.client!.query(`INSERT INTO tripwire.risk_events(recorded_at,event_id,stream_id,score,kind,scam_type,call_id) VALUES ${rows.join(',')} ON CONFLICT (recorded_at,stream_id,event_id) DO NOTHING`, values);
  }
  async close() { await this.client?.end(); }
}
