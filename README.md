# Tripwire

**“Every bank app asks ‘Are you sure?’ A great teller asks ‘What’s it for?’ and then calls your grandson.”**

*AI made this scam possible. Now AI calls your grandson.*

When a payment looks risky, Tripwire doesn’t show a warning. It starts a real-time voice conversation with a warm safety teller (**Gemini 3.8 Live**). If it hears the shape of a con (someone she loves in trouble, urgency, “don’t tell anyone”), it calls the person being impersonated on the number saved on the account (an **ElevenLabs** voice agent), and the money moves only if they confirm. Tripwire never tries to detect the deepfake. It verifies the person.

See [PRD v3](docs/PRD.md), the [demo runbook](docs/DEMO.md) (2:40 table demo and failure drills), and the [case-file design](docs/CASE-FILES.md). Earlier versions are [archived](docs/archive/v2/ARCHIVE.md).

> Payments are simulated; no bank is connected. The scam call is an AI voice (stock, not a clone of anyone). The “phone calls” are web pages on teammates’ phones, not telephony.

## Pages

| Page | What |
| --- | --- |
| `/` | Main dashboard: protection totals, recent saved call reviews, and the demo entry point |
| `/calls` | Saved call reviews with outcomes and expandable details; no audio recordings |
| `/demo` | Complete demo flow with vault entrance, Rosa's phone and bank, Diego's verification, reset and backup controls |
| `/bank` | Rosa's standalone bank app |
| `/call?who=rosa` | Rosa's phone on a separate device |
| `/call?who=diego` | Diego's phone on a separate device |

`/dashboard` remains a dashboard alias and `/dashboard/cases` redirects to `/calls`. The separate Operator and Case Monitor screens have been removed.

## How it works

| Piece | Live / simulated | Where |
|---|---|---|
| Risk trigger | **Live** on Tiger Data: Rosa’s 12 months of payments are a hypertable; a continuous aggregate keeps her daily medians. One query on Send: new payee? how many times her typical payment? Trigger if over 5× **and** (new payee **or** instant transfer). Falls back to the same seed locally, labeled. | `server/tiger.ts`, `lib/risk.ts` |
| Safety teller | **Live** Gemini 3.8 Live, native audio both ways, input+output transcription for captions, barge-in. Three tools: `call_trusted_contact` (non-blocking), `decide_payment`, `finish`. | `lib/teller-config.ts`, `lib/teller-session.ts` |
| Ephemeral tokens | **Live.** The server mints a single-use token with the model, the system instruction (Rosa’s payment context), and the tools locked in. No API key and no editable prompt in the browser. | `server/gemini.ts` |
| Scammer | **Live** ElevenLabs agent with a consented instant voice clone; dynamic variables; optional “coach mode” (“say it’s a car repair”). | `lib/phone-agents.ts`, `scripts/setup-agent.ts` |
| Verifier | **Live** ElevenLabs agent (stock voice) with dynamic variables and a `report_result` client tool that runs on Diego’s phone and posts to the server. The result is delivered into the still-open Gemini session. | `components/phone-call.tsx` |
| Case file | **Live**: Gemini writes it with `finish` from what Rosa actually said; stored as a row in Tiger Data. If the teller is offline, Tripwire rules write it from Rosa’s captions (labeled). | `components/case-file.tsx`, `server/state.ts` |
| Hosting | One long-running Node server on Vultr: every page, both agents, and the teller meet in the same process over SSE. It can’t be serverless. | `server/index.ts`, `docs/VULTR.md` |

## Run locally

Requires **Node.js 22.5+** (team version 22.22.0 in `.node-version`).

```sh
npm ci
cp .env.example .env     # GEMINI_API_KEY, ELEVENLABS_API_KEY, TIGER_DATABASE_URL
npm run seed             # Tiger Data schema + Rosa's 12 months (prints ~29x for $2,500)
npm run setup:agent      # verifier + scammer (needs the consented clone and docs/consent/voice-clone.md); saves EL_AGENT_* to .env
npm run check:live       # real Gemini teller conversation, text mode: story -> call Diego -> hold -> case file
npm run dev
```

Open `/` for the dashboard and choose Demo for the complete one-laptop flow. For separate phones, use `/bank`, `/call?who=rosa`, and `/call?who=diego`; HTTPS is required for phone mics. Tap Ready once on each phone.

Without keys the app still runs: the risk check uses local data, the teller shows as offline, and the backup result control in `/demo` drives the outcome and saves a call review.

## Verify

```sh
npm run typecheck
npm test          # risk rule, seed (~$86 typical, 29x), demo state machine, case-file fallback, Tiger, key handling
npm run build
npm run test:e2e  # PRD acceptance tests 1, 2 (opening), 3 (ring < 2 s), 5 (FORCE RESULT), 6 (RESET < 1 s)
npm run check:live
```

Acceptance tests 2–4 with real voices (the teller speaking first within 2 s, the grandson story, Diego saying “no, I’m fine”) need the live keys; `npm run check:live` covers them in text mode against the real model.

## How Swivel ships this

The teller is a drop-in step in any payment flow: the payment app calls the risk check on submit; if it triggers, it opens the teller instead of “Are you sure?”. The teller only ever calls a contact already saved on the account, never a number a caller gives, the same rule fraud teams use. In production the verifier is a normal outbound phone call; nothing else changes.

## Security notes

- Only risky payments open the teller; there is no call listening or recording.
- Out-of-band verification goes only to a saved contact.
- Gemini tokens are single-use, short-lived, and locked to the server-built config; ElevenLabs sessions use server-signed URLs. No API key reaches a browser.
- Operator actions (which ring teammates’ phones) can require `OPERATOR_KEY` on a hosted deployment; requests are origin-checked, schema-validated, and rate-limited.
- See [the threat model](docs/THREAT_MODEL.md).

## Production

`npm run build && npm start` serves Next.js and the API from one port. For Vultr with Caddy HTTPS, follow [the Vultr guide](docs/VULTR.md) (`npm run setup:vultr`, then `npm run deploy:vultr -- user@server-ip`). Use exactly one server instance: the demo session lives in memory.

The main endpoint `/` opens the dashboard. `/dashboard` remains available, `/bank` is Rosa's standalone bank app, and `/demo` opens the combined demo with the vault transition (skipped for reduced-motion preferences).
