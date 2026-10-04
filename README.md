# Tripwire

Every bank app asks "Are you sure?" A great teller asks "What's it for?" and then calls your grandson.

Tripwire's active direction is **PRD v3: demo-first, minimal**. On a risky payment,
Gemini Live becomes Rosa's warm safety teller. With her permission, an ElevenLabs
verifier calls the saved trusted contact. The teller receives the result in the
same conversation, holds or releases the mock payment, and creates a heist case file.

**Tagline:** AI made this scam possible. Now AI calls your grandson.

## Active brief

- [PRD v3](docs/PRD.md): product, architecture, tools, acceptance gates, priorities.
- [Demo runbook](docs/DEMO.md): the 2:40 story, devices, repeat runs, failure drills.
- [Provider and environment setup](docs/integrations.md): two ElevenLabs agents and key migration.
- [Tiger Data](docs/TIGER.md): transaction history, anomaly query, case persistence.
- [Case files](docs/CASE-FILES.md): the family-facing design centerpiece.
- [Threat model](docs/THREAT_MODEL.md): trusted verification and demo limitations.
- [Validation](docs/VALIDATION.md): measured existing checks versus pending v3 acceptance.
- [Vultr operations](docs/VULTR.md): current deployment and migration requirements.

## Implementation status

The brief has changed; the running app has **not yet been rebuilt for v3**.
Current code still uses SQLite, Socket.IO, paired roles, caller listening,
family words, Mission Control, and optional Solana devnet escrow. The two-agent
`setup:agent` now creates the v3 scammer and verifier. The v3 bank app, speaking
teller, verifier agent flow, SSE routes, transaction seed, and new case schema
remain to be implemented. Earlier docs are [archived](docs/archive/v2/ARCHIVE.md).

The consented clone and both agent configurations are prepared. The next build
work is the v3 phone pages and the speaking teller/result loop. V3 key aliases are supported; the new routes are not implemented yet.

## Run the current checkout

Use Node **22.22.0** (recorded in `.node-version`) and npm compatible with the
committed lockfile. The current server needs Node 22.5+ for built-in SQLite;
the PRD's Node 20 setup note is not a runtime downgrade instruction.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Copy `.env.example` to an ignored `.env` for current
provider configuration. The v3 key contract is documented in
[environment setup](docs/integrations.md); templates and server adapters now support the new names with legacy fallbacks. Never commit credentials or use public-prefixed API keys.

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

These commands validate the existing implementation. They do not prove v3
acceptance. Builds currently use Webpack and production starts with `npm start`,
not `next start`, because the custom server must remain running.

## V3 surfaces and scope

| Surface | Planned route | Purpose |
| --- | --- | --- |
| Rosa's bank app | `/` | Home, Send, speaking teller, Outcome; phone-sized frame |
| Call app | `/call?who=rosa` | Incoming scammer call and ElevenLabs session |
| Call app | `/call?who=diego` | Incoming trusted verification and result tool |
| Operator | `/operator` | Start, reset, forced result, language, event log |
| Family case | `/case/:id` | Generated kraft-paper heist file |

One fictional user, payee, and trusted-contact set. Session state is in memory;
Tiger Data stores transaction history and completed cases. No dashboards, meters,
call listening, family words, auth, blockchain, camera, or video in the v3 target.
Payments are simulated. Calls ring in our web app, not through a telephone network.
A voice clone requires the teammate's recorded and written consent; never claim
consent or a live integration before it is verified.
