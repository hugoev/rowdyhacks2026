# Demo validation

## PRD v3 (October 4, 2026)

- Typecheck, production build: pass. Unit tests: 11 passing (risk rule incl. the $40 bill, seed gives $86 typical and 29x, demo state machine, rules case file, Tiger round-trip and outage fallback, keys stay server-side).
- Browser tests (no provider keys): 6 passing. Acceptance 1 ($40 sends with no Tripwire), Tripwire opens on $2,500, Diego's phone rings in under 2 s from CALL DIEGO, FORCE RESULT not_me shows "Your $2,500 is safe." and a FOILED case file, RESET returns Home in under 1 s (x3), START SCAM CALL rings Rosa's phone, origin and request checks.
- `npm run check:live` against real gemini-3.8-live (text mode, 4 runs incl. one Spanish): greeting with the 29x context, permission asked and answered before calling, the late `not_me` result delivered mid-session, `decide_payment` hold, `finish` with quotes from Rosa's words. First audio 1.4–3.2 s after token (the app pre-mints the token on the Send screen).
- Real browser, real Gemini, Rosa's lines spoken into a fake microphone: first teller caption 1.7 s after Send; the teller heard the story, asked permission, rang Diego after "Yes, please call him."; FORCE RESULT not_me → hold → case file "The Bail Job" (pressure "in jail", "needs bail money today"; cover "don't tell his mom"), 43 s to stop.
- Tiger Data live: `npm run seed` → typical $86, $2,500 to M. Ellis Legal is 29x and new (triggers), $40 to City Electric is known (sends); a finished case was stored in `teller.cases`.
- Live-tuning findings: answering `decide_payment` with SILENT scheduling made the teller stop talking (now WHEN_IDLE); the teller once dialed before hearing "yes" (prompt now forbids asking and calling in one turn; 3/3 clean since); it sometimes calls `finish` before speaking the good news, so the app now hangs up only after the teller stops speaking.
- Not yet verified: the two ElevenLabs agents in live calls on real phones (created by Xander; see below), and acceptance 3–4 with Diego's real voice.

### Two-agent setup (Xander, October 4, 2026)

Scammer created with the project user's consented clone; verifier created with the stock voice, dynamic variables, and the `report_result` client tool. Saved configuration and signed-session URL checks passed for both agents. V3 key aliases are populated locally and in the private deployment environment. These checks start no phone conversations and do not satisfy the real-phone acceptance gates.

## Earlier versions

## PRD v2 (October 4, 2026)

- Production build, strict TypeScript: pass.
- Unit tests: 51 passing, including Live tool validation, quote latency, dodged and
  wrong family words, the model's inability to release or speak first, invented
  close_case quotes being dropped, Diego's block/release, the $40 bill, benign calls
  staying quiet, and the Spanish script.
- Browser tests: 6 passing, including three consecutive hero flows across Rosa,
  Mission Control, and Diego (rule-spotter mode, no provider keys), role permissions,
  and the $40 bill.
- `npm run check:live` against the real Gemini API: ephemeral token minted in
  311 ms; one synthetic caller line produced five `report_signal` calls (all
  levers), a family-word `whisper`, and `update_risk` 99 within about 2.7 s.
- Real caller audio (macOS `say`, 16 kHz, ~3 s gaps between caller turns, as when
  Rosa answers) via `npm run check:live -- --audio=call.wav`: every lever reported
  0.3–1.2 s after the sentence that contained it, across three runs; the family-word
  whisper about 1 s after the first turn.
- Real browser, Chromium fake microphone, Operator-microphone channel, real Gemini:
  per-turn transcription, all five levers with Gemini quotes 366–672 ms after each
  transcribed line, risk 100, family-word whisper on Rosa's screen.
- Three synthetic normal calls (dinner, bank fraud alert, doctor reminder) over four
  runs: zero tool calls after the prompt fix below.
- Not yet verified live: the ElevenLabs scammer agent and streaming voice (no
  ElevenLabs key configured locally) and the eval harness. The eval card shows no
  numbers until `npm run eval:live` runs.

### Live-tuning findings (gemini-3.8-live)

- `proactivity` is rejected on the v1beta endpoint; the Live client uses v1alpha.
- With proactive audio on, the model held every tool call until the caller stopped
  entirely (~13 s on a 12 s monologue). Proactive audio is off; turn detection uses
  high end-of-speech sensitivity with 300 ms of silence. Text checkpoints mid-speech
  did not change timing; they remain only as an 8-second no-activity fallback.
- The voice agent sends audio only while speaking, so the browser fills gaps with
  real-time silence; without it Gemini cannot detect the caller's turn ending.
- The model sometimes called `check_family_word("")` before Rosa asked, which would
  have recorded a false dodge. The server now rejects that call until Rosa taps
  "I asked".
- The model reported "This is an automated alert from your bank" as a Trust lever.
  The prompt now states that introductions alone are never a lever and that
  `update_risk` is only for scores of 30 or more.

## Earlier P0 validation (v1 features, some since removed)

Local verification on Node.js 22.22.0 (the team-recommended version):

- Production build: passes (`next build --webpack`).
- Strict TypeScript check: passes.
- Unit tests: 54 passing, including escrow wire/signature enforcement, local-hold bypass prevention, mocked provider failures, microphone lifecycle checks, Tiger retries/privacy/reset, and Vultr configuration validation.
- Browser tests: 19 passing, including image-check recovery, guardian-only analytics permissions, mocked ElevenLabs Scribe streaming, Heist Drill, Scam Weather, and three consecutive complete grandson demos across the protected, guardian, and relative views.
- Prepared text samples: 10/10 meet the expected risk classification, including two romance messages and two benign messages. This measures only the committed fixtures, not unseen messages or screenshots.
- Desktop and mobile screenshots are generated by the browser suite. All six views fit a 390-pixel viewport without horizontal overflow.
- Scripted Critical signal propagation is asserted under 10 seconds. Callback reply propagation is asserted under 5 seconds. These timings cover local browser/server events, not microphone transcription or a remote SMS network.
- Server timer tests use an injected clock: payments remain held immediately before the 24-hour boundary and release at the boundary; denied payments never release.
- Permission tests reject unauthenticated state requests, protected-role guardian approvals, and foreign-origin mutations.

The regression suite uses no live provider credentials. Live Gemini calls were deliberately skipped to preserve credits. Scribe streaming was tested with a mocked WebSocket and synthetic microphone; real Gemini image understanding, ElevenLabs transcription/voice delivery, and Docker execution remain outside these checks. The GitHub workflow runs the build, unit tests, typecheck, and browser suite on future pushes.

Separate live Tiger Data verification on October 3, 2026 connected over encrypted
PostgreSQL to TimescaleDB 2.30.2, initialized the dedicated schema, inserted three
synthetic events, read a one-minute continuous aggregate with peak risk 100,
and confirmed repeat uploads leave exactly three rows. Synthetic rows use an
isolated test stream.

Live Vultr verification on October 3, 2026 also passed against release
`5893ce7054cc` at `https://tripwire.64.177.46.134.sslip.io` after configuring the
database URL in the private deployment environment. The complete GitHub Actions
deployment secret was synchronized so future releases keep the connection.
Public health reports `hosting: vultr`, `mode: paired`, and `analytics: working`.

- All three paired roles log in with secure HttpOnly cookies.
- A protected user's synthetic gift-card payment is held and delivered to the
  guardian over a real WebSocket; protected-role approval is rejected and the
  guardian can deny it.
- Creation and denial events appear in the guardian's Tiger chart, exist exactly
  once in Tiger Data, and are included in the minute aggregate. The local outbox
  drains to zero. Protected and relative roles cannot read cloud analytics.
- All three live role views render at 390 by 844 without horizontal overflow or
  browser runtime errors.
- `npm run check:vultr:e2e` repeats these live checks. Verification creates mock
  payments that are denied, leaving synthetic cases and anonymized risk events;
  it does not reset household data or change safe words or active calls.

The local 14-test browser suite passes on rerun, alongside strict TypeScript and
the unit-test suite. An earlier browser run completed its demo assertions but
failed while closing a trace archive; the clean rerun passed every test.

Solana program compilation and one Rust authorization test pass. Fifteen program
instruction/balance/backend-adapter assertions passed on an isolated validator. Devnet deployment
and production wallet-signing verification remain pending a funded deployment
wallet and the real guardian's public address/signature.

The Solana SDK's transitive RPC client is pinned to patched Jayson 5.0.0 (Node 20+
compatible); the SDK import path, real validator RPC calls, and browser build were
verified. `npm audit --omit=dev` reports zero vulnerabilities with this override.
