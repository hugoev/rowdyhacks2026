// Kept in a dedicated schema so setup cannot alter unrelated application tables.
export const TIGER_MIGRATION = `
SELECT pg_advisory_xact_lock(hashtext('tripwire_tiger_schema_v1'));
CREATE SCHEMA IF NOT EXISTS tripwire;
CREATE TABLE IF NOT EXISTS tripwire.risk_events (
  recorded_at TIMESTAMPTZ NOT NULL,
  event_id UUID NOT NULL,
  stream_id UUID NOT NULL,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  kind TEXT NOT NULL CHECK (kind IN ('call','payment','verification','system')),
  scam_type TEXT NOT NULL,
  call_id UUID,
  PRIMARY KEY (recorded_at, stream_id, event_id)
);
SELECT create_hypertable('tripwire.risk_events', 'recorded_at', if_not_exists => TRUE, migrate_data => TRUE);
CREATE INDEX IF NOT EXISTS risk_events_stream_time ON tripwire.risk_events (stream_id, recorded_at DESC);
CREATE MATERIALIZED VIEW IF NOT EXISTS tripwire.risk_minute
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT stream_id, time_bucket(INTERVAL '1 minute', recorded_at) AS bucket,
       max(score) AS peak_score, avg(score) AS average_score, count(*) AS samples
FROM tripwire.risk_events
GROUP BY stream_id, time_bucket(INTERVAL '1 minute', recorded_at)
WITH NO DATA;
SELECT add_continuous_aggregate_policy('tripwire.risk_minute',
  start_offset => INTERVAL '7 days', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);
CREATE TABLE IF NOT EXISTS tripwire.scam_weather_reports (
  reported_at TIMESTAMPTZ NOT NULL,
  market TEXT NOT NULL CHECK (market = 'San Antonio'),
  scam_type TEXT NOT NULL,
  report_count SMALLINT NOT NULL CHECK (report_count BETWEEN 1 AND 100),
  source TEXT NOT NULL CHECK (source = 'seeded-demo'),
  PRIMARY KEY (reported_at, market, scam_type, source)
);
SELECT create_hypertable('tripwire.scam_weather_reports', 'reported_at', if_not_exists => TRUE, migrate_data => TRUE);
CREATE MATERIALIZED VIEW IF NOT EXISTS tripwire.scam_weather_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT market, scam_type, source, time_bucket(INTERVAL '1 day', reported_at) AS bucket,
       sum(report_count)::INTEGER AS reports
FROM tripwire.scam_weather_reports
GROUP BY market, scam_type, source, time_bucket(INTERVAL '1 day', reported_at)
WITH NO DATA;
SELECT add_continuous_aggregate_policy('tripwire.scam_weather_daily',
  start_offset => INTERVAL '35 days', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);
`;
