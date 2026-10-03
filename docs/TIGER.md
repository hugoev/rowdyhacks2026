# Tiger Data risk analytics

Add your PostgreSQL connection string to the ignored local `.env`, then restart
your existing development server. Never commit it or use `NEXT_PUBLIC_`.

```dotenv
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/tsdb?sslmode=require
```

The server initializes only the dedicated `tripwire` schema. It creates a
`risk_events` hypertable, a `risk_minute` continuous aggregate with real-time
aggregation, and a minute refresh policy. Existing unrelated tables are untouched.
The database user needs permission to create those objects; TimescaleDB must be
installed. Initialization is serialized and idempotent.

These commands work across the team's supported operating systems:

```sh
npm run check:tiger
npm run setup:tiger
npm run check:tiger -- --smoke
```

The first command checks connectivity, encryption, the TimescaleDB extension, and
schema readiness without changing data. Setup initializes the schema. The smoke
test writes three synthetic events to an isolated random stream, checks raw and
aggregate results, and retries them to verify duplicate protection. Those test
rows remain in the database but never appear in the household's chart.

## Privacy and reliability

Only event identifiers, timestamps, scores, event categories, allowlisted scam
types, and call identifiers leave the server. No transcript, safe word, payment
amount, payee, screenshot, or guardian summary is uploaded to Tiger.

SQLite continues to enforce payment holds. An on-disk outbox retries cloud writes
with idempotent inserts; entries are removed only after successful writes.
Connection failures use a 30-second retry delay and the guardian chart falls back
to local events. The configured server normally syncs every five seconds.

The guardian can switch between the latest 60 individual events and up to 120
one-minute peak buckets from the last day. Chart totals cover the returned minute
buckets, not a lifetime total. Other roles receive no cloud risk history. Demo
reset starts a new stream; it does not delete historical cloud records. A cloud
retention/deletion policy and multi-household authentication remain future work.

## TLS

`sslmode=require` encrypts traffic but does not authenticate the server certificate.
For certificate verification, use `sslmode=verify-full` and, where necessary,
`TIGER_CA_CERT` containing your trusted CA certificate (escaped newlines supported).
Disabled TLS is rejected. Do not claim that encryption alone verifies the server.
See [node-postgres SSL configuration](https://node-postgres.com/features/ssl).

## Vultr

Local `.env` changes do not change production secrets. Add `DATABASE_URL` and any
`TIGER_CA_CERT` to the existing private Vultr environment configuration and GitHub
`VULTR_ENV` deployment secret, preserving the domain, provider keys, and paired
access codes. Do not overwrite that secret with an incomplete example file.
`npm run setup:vultr` copies these values when creating a new `.env.vultr`; it
refuses to replace an existing file. Deploy/restart after updating configuration.

After deployment, run `npm run check:vultr:e2e` to verify the live HTTPS app,
all three paired logins, secure cookies, guardian WebSocket delivery, payment
holds and denial permissions, guardian-only analytics, Tiger event persistence,
minute aggregation, and mobile views. Install Playwright Chromium first if needed.
This explicit live check creates and denies one synthetic mock payment; its case
and anonymized risk events remain as verification evidence. It does not reset the
household, change the family safe word, or start a call.
