# Vultr deployment and v3 migration

Vultr remains the host: one long-running Node server behind Caddy HTTPS. The
v3 browser calls and microphone need HTTPS; SSE coordinates the two call apps
and bank app in the same process. Horizontal replicas/serverless functions are
outside the one-session design.

## Current deployment (v2)

URL: https://tripwire.64.177.46.134.sslip.io. This is a temporary hostname, not a
confirmed GoDaddy Registry domain. Current runtime uses Docker, Node 22, Caddy,
SQLite, Socket.IO, and paired access codes until the v3 code (on main since
the safety-teller commit) deploys; v3 needs no SQLite, Socket.IO, or access codes.
Keep Node 22.22+; the PRD's Node 20 note does not supersede the current runtime.

Main pushes run checks across Linux/Windows/macOS plus browser and chain tests.
After checks pass, Actions deploys the committed release. Until CI is changed,
docs-only pushes also deploy. `/api/health` identifies the actual live release.
Deployment preserves named volumes, retains active/previous images, bounds build
cache, and requires at least 5 GiB free. Do not use `down -v`.

Secrets: VULTR_SSH_KEY, VULTR_KNOWN_HOSTS, and VULTR_ENV. Local `.env.vultr` holds
private deployment config; never print or commit it. Existing Solana variables
are overlaid by CI; do not assume rewriting the env file disables that overlay.

```sh
npm run check:vultr
npm run deploy:vultr -- root@64.177.46.134
```

Manual deployment uploads committed HEAD and bypasses CI checks. From a release
at `~/tripwire/releases/COMMIT`, current operations are:

```sh
docker compose --env-file .env.vultr -f deploy/vultr/compose.yaml ps
docker compose --env-file .env.vultr -f deploy/vultr/compose.yaml logs --tail=100
```

Back up SQLite using its online backup API before risky data migration. Resetting
legacy activity must preserve settings, family hash, access/session keys, provider
configuration, and unresolved chain mappings; historical Tiger rows need not be
removed to clear the UI. Never deploy an empty volume as a casual reset.

## V3 migration tasks

1. ~~Implement bank `/`, phone `/call`, hidden `/operator`, `/case/:id`, and SSE.~~ Done.
2. Templates done (`.env.example`, `deploy/vultr/env.example`). **Still to do:** add
   `EL_AGENT_SCAMMER_ID`, `EL_AGENT_VERIFIER_ID`, `TIGER_DATABASE_URL` (or keep
   `DATABASE_URL`), and an `OPERATOR_KEY` to the private `VULTR_ENV` secret. The
   server also accepts the existing `APP_ORIGIN` as its public origin.
3. ~~Initialize and seed the new Tiger schema without dropping older history.~~
   Done with `npm run seed` (new `teller` schema; older `tripwire` tables untouched).
4. ~~Replace role auth and SQLite session flow for the fictional no-auth demo.~~
   Done; money is simulated. The old SQLite volume is left in place, unread.
5. Remove obsolete Solana overlays/services only after accounting for existing
   records. The docs update does not disable the live program.
6. ~~Replace v2 CI/E2E checks with the v3 acceptance path~~ (done); keep appropriate Node
   compatibility, build/type checks, deployment health, and data preservation.
7. Test real phone sessions over HTTPS, then point the chosen Registry domain
   to the VM and configure Caddy after the domain is available.

To synchronize a complete verified private config (during the setup task):

```sh
gh secret set VULTR_ENV --repo hugoev/rowdyhacks2026 < .env.vultr
```

Do not run this with a partial template. Changing local `.env` does not change
production. RESET in v3 clears in-memory demo state while retaining completed
Tiger cases and seeded transactions. Forced results remain distinguishable.
See [environment setup](integrations.md) and [v3 validation](VALIDATION.md).

Detailed legacy provisioning and rollback instructions are
[archived](archive/v2/docs/VULTR.md).
