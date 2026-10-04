# Tripwire

**“You can’t out-detect a perfect voice clone. You can out-verify it.”**

Tripwire listens for the con, not the voice, and stops the payment before the money moves. A Gemini Live session hears the caller, recognizes the con as it happens (trust, emotion, urgency, isolation, payment pressure), and when Rosa reaches for her bank app it already knows why. Instead of “Are you sure?”, the Teller pauses the payment, quotes the caller’s own words, and asks the one person who can settle it: the family member being impersonated.

Three surfaces, one shared state:

- **Rosa’s phone** (`/protected`): incoming call, quiet on-screen whispers, and her bank app (the Teller). Huge type, one action per screen.
- **Diego’s phone** (`/relative`): one push card, “Not me, block” or “It’s me, release”.
- **Mission Control** (`/guardian`): the Con Meter, caller transcript, the agent’s tool-call surveillance log with latencies, the Teller, the case file, and measured red-team results. `/stage` puts Rosa and Mission Control side by side for the big screen.

See the [demo runbook](docs/DEMO.md) for the 3:00 script and failure drills.

> Payments are simulated; no bank or phone network is connected. Voice clones are made only with recorded consent and are used only for the demo and red-teaming. Tripwire’s defense never depends on detecting them.

## Run locally

Requires **Node.js 22.5 or newer** (the server uses built-in `node:sqlite`). Node.js **22.22.0** is the team-recommended version and is recorded in `.node-version` and `.nvmrc`.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No API keys are needed for the typed-line demo, the rule spotter, payment holds, Diego’s loop, the family word, or browser voice.

The same npm commands work on **Windows, macOS, and Linux**. The minimum is **22.5.0**; the team version is **22.22.0**, recorded in `.node-version` and `.nvmrc`. Built-in SQLite does not need a separate SQLite install or C++ compiler. Run `node --version` if startup fails. On Windows, reopen PowerShell or Command Prompt after installing/upgrading Node, then run `npm ci` to install dependencies for that machine. Do not copy `node_modules` from another operating system.

An `.env` file is optional for the local demo. To configure providers, copy `.env.example` to `.env`:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```sh
# macOS / Linux / Git Bash
cp .env.example .env
```

In Windows Command Prompt, use `copy .env.example .env`. If PowerShell blocks `npm.ps1`, use `npm.cmd ci` and `npm.cmd run dev`. In a shared folder or network drive, if file watching fails, run `node --import tsx server/index.ts` and restart it manually after backend changes. If Next.js compilation specifically fails in Turbopack, use `npm run build` followed by `npm start` to run the verified Webpack build, and share the exact error so the development compiler can be diagnosed.

Development uses a portable Node launcher that watches `server/` and `lib/`, while Next.js handles frontend hot reload. Production startup sets `NODE_ENV` in a JavaScript launcher, and the test runner discovers files directly. These commands avoid shell-specific environment assignments, tsx watcher IPC, and wildcard expansion. CI checks the unit tests, production build, and TypeScript on Windows, macOS, and Linux.

The server prints an experimental SQLite warning on some Node 22 versions; this is expected. One development server should run per checkout. Browser tests use a separate build directory and port.

| View | Route | What it does |
| --- | --- | --- |
| Mission Control | `/` or `/guardian` | Con Meter, risk dial, caller transcript, tool-call surveillance log, the Teller, case file, eval card, demo reset |
| Rosa’s phone | `/protected` | Incoming call, whispers, family word, the Teller (bank app), Tripwire’s voice; Operator drawer for the demo |
| Diego’s phone | `/relative` | One push card: “Not me, block” / “It’s me, release”; receives no payments or transcript |
| Case files | `/cases` | Every case with the caller’s quotes, lever timestamps, and a lesson |
| Family settings | `/settings` | Family word, language, delayed co-sign limit, retention, provider status |
| Stage | `/stage` | Rosa and Mission Control side by side for the big screen |

## How it works

| Piece | Live / simulated | Where |
|---|---|---|
| Gemini Live call brain | **Live** with `GEMINI_API_KEY` (`gemini-3.8-live`). One session per call; hears caller audio only; never speaks; acts through 8 tools: `report_signal`, `update_risk`, `whisper`, `check_family_word`, `alert_guardian`, `hold_payment`, `speak_to_user`, `close_case`. | `lib/live-config.ts`, `lib/live-guard.ts`, `server/live-tools.ts` |
| Ephemeral tokens | **Live.** The server mints single-use tokens locked to the model and config; the API key never reaches the browser. | `server/gemini.ts` |
| Rule spotter | **Always on**, tagged `RULE`. Lights a lever only if the model hasn’t; prompts the family word when Gemini is absent. | `lib/levers.ts` |
| Family word | **Live.** Salted bcrypt hash. Gemini sends what it heard; only match / no match returns. A dodge counts as a failure. | `server/store.ts` |
| The Teller | **Simulated bank.** Deterministic rules score (new payee, amount, rail, active call) plus `PAYMENT_ATTEMPT` injected into the same live session. The model can hold, never release. | `lib/risk.ts`, `server/store.ts` |
| Diego’s loop | **Live** over Socket.IO. A held payment during a call always reaches Diego, even if the model is slow; his tap resolves the payment and is injected back as `GUARDIAN_REPLY`. | `server/store.ts`, `components/views.tsx` |
| Tripwire’s voice | **Live** ElevenLabs streaming TTS (English/Spanish) when `ELEVENLABS_API_KEY` is set; browser voice otherwise. Speaks once, only after Diego answers. | `server/elevenlabs.ts` |
| Scammer agent | **Live** ElevenLabs voice agent (consented clone) when `ELEVENLABS_AGENT_ID` is set. Its digital output is streamed to Gemini as PCM. Fallbacks: operator mic, typed lines. | `lib/scammer.ts`, `components/call-engine.ts` |
| Red-team harness | **Live**, opt-in: `npm run eval:live`. ElevenLabs voices speak 50 synthetic calls (6 scam types, EN/ES, 20 benign) into Gemini Live; writes measured numbers only. | `scripts/eval-live.ts`, `lib/eval-fixtures.ts` |
| Tiger Data | **Live** with `DATABASE_URL`: risk events, latency history, eval runs. | `server/tiger.ts` |
| Solana | Optional devnet escrow for payments made outside a call. | `server/solana.ts` |

### Provider setup

```sh
cp .env.example .env            # add GEMINI_API_KEY, ELEVENLABS_API_KEY
npm run check:live              # hour-0 gate: token + Live session + tool calls
npm run setup:agent             # needs ELEVENLABS_SCAMMER_VOICE_ID (consented clone); prints ELEVENLABS_AGENT_ID
npm run eval:live               # optional; ~50 calls in real time, a few minutes
```

## State and privacy

- SQLite stores the household, mock payments, case labels, risk events, bcrypt hash, and a generated session-signing secret in `data/tripwire.sqlite`. `data/` is gitignored. Keep it on a persistent disk and protect backups.
- Transcript text is live in server memory and shared with the guardian while the protected user runs the guard. It is not persisted by default. The protected user may opt in to retaining the latest flagged transcript. Disabling that preference removes saved text; ending a session clears unsaved text.
- Audio is not stored by Tripwire. Only the caller’s audio is streamed to Gemini Live, after Rosa answers with Tripwire listening (consent on the answer screen). The family word is never sent to the model. ElevenLabs receives Tripwire’s resolution text when its voice is used. Only flagged case files are kept.
- Role-specific signed HttpOnly, SameSite cookies expire after 12 hours. Diego’s snapshot contains only his question and the outcome: no payments, transcript, or signals. Inputs use Zod validation, requests are origin checked, mutation calls require a custom header, and sensitive operations are rate limited.
- `DEMO_MODE=true` intentionally allows anyone to select any role. This is for a local, fictional household. For shared hosting, set `DEMO_MODE=false` and configure three different, random access codes of at least 16 characters. This remains a single-household pairing mechanism, not production identity management.
- Payment decisions, expiry, and writes happen on the server. Timers shown in the browser have no authority. Holds survive restarts. Release rechecks newly arrived call evidence. Co-sign-limit changes become effective only after 24 hours.
- The model can add evidence, pause money, and ask family; it can never release a hold. Every tool call is validated with Zod on the server.
- A family-word match is not proof of identity. A compromised guardian or device is outside this prototype’s protection. See [the threat model](docs/THREAT_MODEL.md).

## Verification

```sh
npm run typecheck
npm test          # store, tools, levers, risk thresholds, Tiger, Solana
npm run build
npm run test:e2e  # hero flow x3 across Rosa, Diego, and Mission Control; $40 bill; roles
```


## Production build / self-hosting

```sh
npm run build
npm start
```

Build uses Webpack for predictable compatibility with this custom-server setup. The custom Node server serves both Next.js and Socket.IO on one port. It is not compatible with a static-only host or `next start` alone.

For a Vultr VM or another Node/Docker host:

For the automated Vultr deployment with Caddy HTTPS, persistent storage, and private role codes, follow [the Vultr guide](docs/VULTR.md). Start with `npm run setup:vultr`, configure the domain and email in `.env.vultr`, then use `npm run deploy:vultr -- user@server-ip` after committing the release.

1. Copy `.env.example` to `.env`. Set `APP_ORIGIN=https://your-domain`, `DEMO_MODE=false`, distinct role access codes, and `COOKIE_SECURE=true`.
2. Run `docker compose up --build -d`. Docker’s named volume preserves SQLite data. The port is bound to localhost.
3. Put Caddy or another HTTPS reverse proxy in front of port 3000. See [the Caddy example](docs/Caddyfile.example); WebSocket upgrades must be supported.
4. Open `/api/health` to check availability. Share each role’s code only with its intended person.

To test on phones on your own network without Docker, set `HOST=0.0.0.0` and `APP_ORIGIN` to the exact reachable origin. All devices must use that origin. Microphone access generally requires HTTPS or localhost.

The demo is deployed at https://tripwire.64.177.46.134.sslip.io using a temporary hostname. Use one server instance with a persistent SQLite volume; horizontal scaling needs shared storage, transactional coordination, and a Socket.IO adapter.

## Code map

```text
app/                     Next.js routes, design tokens (mission.css)
components/protected.tsx Rosa's phone: incoming call, whispers, the Teller
components/call-engine.ts Caller channel -> Gemini Live, app events -> same session
components/views.tsx     Diego's push card, family settings
components/tripwire.tsx  Mission Control, case files, stage view
components/heist.tsx     Con Meter, surveillance log, case file, laser
lib/live-config.ts       System instruction and the 8 tool declarations
lib/live-guard.ts        Browser Gemini Live client (tokens, tools, transcription, resumption)
lib/levers.ts            Rule spotter and lever score
lib/risk.ts              Deterministic payment scoring and friction boundaries
server/live-tools.ts     Validated tool executor
server/store.ts          Call, payment, alert, and case state machine
server/gemini.ts         Ephemeral Live token minting
server/elevenlabs.ts     Streaming voice and agent sessions
scripts/eval-live.ts     Red-team harness
```

No video anywhere: Presage is excluded. Payments are simulated. The eval card shows only numbers measured by `npm run eval:live`. Sponsor integrations should only be claimed after their real integrations are implemented and demonstrated.
