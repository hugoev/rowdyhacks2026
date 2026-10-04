# Tiger Data - PRD v3 target

V3 uses Tiger Data for the payment anomaly gate and completed case files.
Session/call state lives in memory. This replaces the older risk-chart analytics;
the new schema and seed are **not implemented yet**.

## Target schema and seed

- `transactions(ts timestamptz, payee text, amount numeric, rail text)`, a
  hypertable on ts. One fictional user, Rosa; no multi-user account model.
- A daily/weekly typical-payment continuous aggregate. Choose a supported
  median/percentile implementation and define its rolling lookback. Do not
  silently substitute an unweighted median of bucket medians for a global median.
- Known payees come from distinct historical transaction payees.
- `cases(ts, amount, payee, outcome, job_name, impersonated, pressure text[],
  cover text, getaway text, foiled_by text, tip text, seconds_to_stop int)`.
  Add stable case ID/request uniqueness when implementing `/case/:id` and
  idempotent finish writes.

Planned `scripts/seed.ts`: ~12 months of utilities, pharmacy, groceries, church,
monthly $50 to Diego. Include City Electric; exclude M. Ellis Legal. Typical
near $86, so $2,500 is about 29x. Make the seed idempotent and fictional. It is
not the existing risk-event smoke test or an npm command that exists today.

One `/api/check` SQL query returns is_new_payee, typical, multiple, trigger.
Trigger: amount/typical > 5 AND (new payee OR instant/irreversible rail).
Use numeric arithmetic and defined behavior for missing/zero history; a DB
failure must surface explicitly and keep the risky payment unresolved.

`finish` saves exactly one case per completed session/payment, generated from
the teller conversation and actual verification result. No database reset is
needed between judges: RESET clears active UI/session, not historical case rows.
Retain a readable saved case after restart; do not invent successful persistence
when a write fails. Define retry/idempotency handling during implementation.

## Environment migration

Target server key: `TIGER_DATABASE_URL`; current runtime consumes `DATABASE_URL`.
Migrate adapter, templates, setup, and private deployment secrets together.
Use pg, encrypted connections, and a verified CA where needed. Never print the
connection string. Do not drop unrelated tables or old risk history during migration.

## Existing database (v2, historical)

Current adapter creates dedicated `tripwire.risk_events`, `tripwire.risk_minute`,
and `tripwire.eval_runs`. SQLite owns holds and an upload outbox. These do not
provide Rosa's v3 transaction history or v3 case persistence.

Existing commands: `npm run check:tiger`, `npm run setup:tiger`,
`npm run check:tiger -- --smoke`. They validate/initialize the **old** schema;
the smoke command writes synthetic risk events. Keep them labeled until replaced.
See [archived Tiger operations](archive/v2/docs/TIGER.md) for current details.
