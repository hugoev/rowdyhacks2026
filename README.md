# Tripwire

**Every scam is a heist. Tripwire trips the alarm before the money moves.**

A working RowdyHacks XII P0 prototype: a calm payment and call screen for a protected family member, a case-file command center for their guardian, and a separate callback screen for a trusted relative. Built with Next.js, TypeScript, Socket.IO, and SQLite.

> All payments are simulated. No bank, wallet, escrow program, telephone network, or real funds are connected. This is a single-household hackathon prototype, not a production fraud-prevention service.

## Run locally

Requires **Node.js 22.22 or newer** (the ElevenLabs dependency requires it; the server also uses built-in `node:sqlite`).

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No API keys are needed for the scripted demo, payment holds, callbacks, family safe word, text scanner, or browser voice.

The same npm commands work on **Windows, macOS, and Linux**. The team version is **22.22.0**, recorded in `.node-version` and `.nvmrc`; newer supported Node versions also work. Built-in SQLite does not need a separate SQLite install or C++ compiler. Run `node --version` if startup fails. On Windows, reopen PowerShell or Command Prompt after installing/upgrading Node, then run `npm ci` to install dependencies for that machine. Do not copy `node_modules` from another operating system.

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
| Guardian command center | `/` or `/guardian` | Risk dial, live chart, signals, transcript, payment decisions, demo reset |
| Rosa’s shield | `/protected` | Consent-based call guard, scripted, ElevenLabs, and browser transcripts, safe word, callback, mock payments |
| Alex’s callback | `/relative` | Answer whether the caller is really Alex; receives no payments or transcript |
| Inspector | `/inspector` | Text/link inspection, optional Gemini screenshot analysis, 10 prepared samples |
| Case files | `/cases` | Explain attempted scams and guardian outcomes |
| Family settings | `/settings` | Safe word, delayed co-sign limit changes, transcript retention |

## Two-minute demo

1. Open `/guardian`, `/protected`, and `/relative` in separate tabs/windows. The role cookies are separate so all three can coexist in one browser. Use the same host (`localhost`, not a mixture of hostnames).
2. In Family settings, agree on and save a family safe word. Only its salted bcrypt hash is stored. Do not include it in a transcript.
3. In Rosa’s shield, choose **The Grandson Job**, then **Start scripted demo**. Click **Next scripted line** twice. The guardian sees the risk and detected tells update immediately. Browser voice reads the critical warning where supported; the speaker button replays it.
4. Enter a wrong caller answer in **The Vault Code**. Then click **Check with Alex**. In Alex’s view, choose **No, that’s not me**. Rosa sees his answer.
5. Use the prefilled **$2,500 gift-card payment**, then **Check & send demo payment**. Its hold is enforced by the server. The guardian chooses **Deny payment** and confirms. Both views update; the case file is marked **HEIST FOILED**.
6. Inspect a prepared romance or phishing message in `/inspector`. With a Gemini key, upload a screenshot instead.
7. For the normal-payment contrast, use **Reset demo** in the guardian view, then choose **Try a $40 bill** in Rosa’s view. It completes without friction. Reset preserves the safe word but clears demo activity and preferences.

The demo uses **manual next-line controls**, so venue noise and timing cannot break the presentation. Scripted mode never turns on the microphone. The browser cannot hang up a telephone call; the hang-up control explicitly tells the user to end the call on their phone and stops Tripwire’s guard.

## Live, fallback, and not connected

| Capability | This build |
| --- | --- |
| Teller risk and friction ladder | Working deterministic server rules. $500 is a disclosed demo baseline, not learned transaction history. |
| Lookout | Working scripted/manual input, ElevenLabs Scribe Realtime when configured, and explicit browser SpeechRecognition fallback. Immediate rules evaluation and optional asynchronous Gemini enrichment. |
| Voice warning | Optional ElevenLabs text-to-speech, browser speech synthesis fallback, visible warning always available. |
| Vault Code | Working salted bcrypt hash, rate-limited verification, sticky Critical risk after a wrong answer. A later correct guess cannot erase it. |
| Callback | Working Socket.IO request/reply across paired views. No SMS or actual phone call. |
| Two-Key Rule | Working durable SQLite **mock-payment** hold. Guardian approval or a server-clock 24-hour deadline releases it; denial is terminal. |
| Guardian summary | Optional Gemini summary with an explainable rules-based fallback. |
| Inspector | Rules-based text/link checks. Gemini image understanding and richer text checks when configured. Image-only scans explicitly fail when image analysis is unavailable. |
| Cases / risk chart | Working local events and payment case files, not seeded outcome metrics. |
| Tiger Data | PostgreSQL risk-event hypertable, minute continuous aggregate, and cloud-backed guardian chart. Durable local retry queue and local chart fallback. See [Tiger setup](docs/TIGER.md). |
| Vultr | Deployed with Caddy HTTPS, Socket.IO, paired role access, and persistent SQLite storage. See [deployment details](docs/VULTR.md). |
| Solana / Presage | Not integrated. Payment enforcement remains local SQLite; Tiger does not move or hold money. |
| Heist Drill / Scam Weather | Not implemented. |
| PWA | App manifest, standalone display, custom icon. No offline service worker; connected family flows require the server. |

The initial household names are fictional demo fixtures. Dashboard totals reflect actual demo holds/denials, not invented dollars saved. The prepared scanner examples are fixtures, not independently sampled accuracy evidence.

## Optional providers

See [integration setup](docs/integrations.md) for per-developer secrets, provider status, quota controls, and opt-in evaluation. Live Gemini evaluation is deferred to preserve credits.

Set these in `.env`, then restart the server:

```dotenv
GEMINI_API_KEY=your-key
GEMINI_CALL_MODEL=gemini-3.5-flash-lite
GEMINI_SCAN_MODEL=gemini-3.8-flash
GEMINI_SUMMARY_MODEL=gemini-3.5-flash-lite
ELEVENLABS_API_KEY=your-key
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
```

Keys stay on the server. Gemini output is schema-constrained and validated. Call analysis is coalesced every six seconds with a four-second timeout; scans and summaries have ten-second timeouts. Rules continue protecting payments during provider failures, and AI cannot lower an existing call score. Images may be PNG, JPEG, or WebP, up to 5 MB. The configured stock ElevenLabs voice can be changed. No voice cloning is used.

Without Gemini, uploaded images are **not analyzed**. If text is supplied alongside an image, the fallback clearly says it examined only that text. Links are never fetched; this avoids server-side request forgery and accidental navigation to suspicious content. Textual URL checks are not a reputation service.

Provider interfaces follow [Gemini content generation](https://ai.google.dev/api/generate-content) and [ElevenLabs text-to-speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert). The custom server follows [Next.js custom-server guidance](https://nextjs.org/docs/app/guides/custom-server).

## State and privacy

- SQLite stores the household, mock payments, case labels, risk events, bcrypt hash, and a generated session-signing secret in `data/tripwire.sqlite`. `data/` is gitignored. Keep it on a persistent disk and protect backups.
- Transcript text is live in server memory and shared with the guardian while the protected user runs the guard. It is not persisted by default. The protected user may opt in to retaining the latest flagged transcript. Disabling that preference removes saved text; ending a session clears unsaved text.
- Audio is not stored by Tripwire. ElevenLabs microphone mode sends audio directly to that provider; browser fallback may send audio to the browser vendor. Consent copy explains this. If Gemini is configured, submitted transcripts/images go to that provider. ElevenLabs receives warning copy when its voice is used.
- Role-specific signed HttpOnly, SameSite cookies expire after 12 hours. Relative snapshots exclude financial records and conversation text. Inputs use Zod validation, requests are origin checked, mutation calls require a custom header, and sensitive operations are rate limited.
- `DEMO_MODE=true` intentionally allows anyone to select any role. This is for a local, fictional household. For shared hosting, set `DEMO_MODE=false` and configure three different, random access codes of at least 16 characters. This remains a single-household pairing mechanism, not production identity management.
- Payment decisions, expiry, and writes happen on the server. Timers shown in the browser have no authority. Holds survive restarts. Release rechecks newly arrived call evidence. Co-sign-limit changes become effective only after 24 hours.
- A safe-word match is not proof of identity. A compromised guardian or device is outside this prototype’s protection. See [the threat model](docs/THREAT_MODEL.md).

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests cover scoring boundaries, no-friction normal payments, all ten prepared text samples (including two romance messages), hold/approval/denial invariants, exact timer boundaries, delayed policy changes, callback privacy, safe-word hashing, transcript retention, persistence, and session signatures.

Browser tests launch their **own server on port 3101** with separate database and build directories. They cover three consecutive full family demos, role/origin enforcement, normal payment, failed safe word, Inspector, and mobile layouts. They do not reset your running app on port 3000. Test results are gitignored.

The local rules recognize the ten prepared examples; this is a regression check, **not a real-world accuracy claim**. There is no camera-based stress measurement or independently measured live-speech accuracy yet.

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
app/                 Next.js routes, metadata, manifest, design tokens
components/          Family views, shared session/realtime context, UI
lib/risk.ts          Deterministic scoring and friction boundaries
lib/scenarios.ts     Scripted calls and prepared scanner examples
lib/types.ts         Shared domain model
server/index.ts      HTTP API, permissions, rate limiting, Socket.IO
server/store.ts      Durable household state and payment state machine
server/providers.ts  Compatibility exports for provider adapters
server/auth.ts       Signed, expiring, role-bound session cookies
tests/               Unit and browser regression tests
docs/                Threat model, demo handoff, hosting example
```

The PRD’s P1/P2 integrations are next steps after this P0 demo is stable. Sponsor features should only be claimed after their real integrations are implemented and demonstrated.
