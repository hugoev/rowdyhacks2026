# Live provider setup

Keep API keys in `.env` or the hosting provider's server-side secret settings.
Never use `NEXT_PUBLIC_` for keys. Restart the server after changing configuration.

Each teammate copies `.env.example` to an untracked local `.env` and adds their
own provider keys. Prefer separate keys per developer so one can be revoked
without affecting teammates. If sharing sponsor credentials, use a password
manager's shared vault, not Git, issue comments, PRs, or screenshots. The deployed
server has its own protected `.env` or secret settings. `.env.example` contains
variable names and placeholders only; `.gitignore` excludes local secret files.

## Gemini

Create a Gemini Developer API key in Google AI Studio. Start with the free tier;
Tripwire never activates billing. Set `GEMINI_API_KEY` and keep the task-specific
defaults in `.env.example`: Flash-Lite for rolling call analysis and guardian
summaries, Flash for screenshot inspection. `GEMINI_MODEL` is an optional legacy
override; task-specific values take precedence.

Tripwire uses one Gemini Live session per call (`GEMINI_LIVE_MODEL`, default
`gemini-3.8-live`). The server mints a single-use ephemeral token locked to the
model, system instruction, and tool declarations; the browser connects with it.
Only the caller's audio is streamed (16 kHz PCM). The model's audio output is
discarded; it acts only through the eight tools in `lib/live-config.ts`, which the
server validates and executes in `server/live-tools.ts`. Input transcription feeds
the caller transcript and the deterministic rule spotter. Proactive audio is off
and turn detection ends a caller turn after 300 ms of silence; the browser fills
gaps in the agent's audio with silence so turns can end (see VALIDATION.md for the
measurements). A text `CHECKPOINT` is sent only if the caller talks for 8 seconds
with no tool activity, and session resumption reconnects up to three times. Run
`npm run check:live` (typed line) and `npm run check:live -- --audio=call.wav`
(real speech) as the hour-0 gate.

Use synthetic calls on the free tier: Google may use submitted content to improve
its products.

Run `npm run eval:live` explicitly for the red-team numbers: ElevenLabs voices
speak 22 synthetic scripts (6 scam types and benign calls, English and Spanish)
for about 50 calls, streamed in real time into Gemini Live. A call counts as
flagged at risk 60+ or two distinct levers. Results go to
`data/eval-results.json` (and Tiger Data when configured); the eval card shows
only those measured numbers.

## ElevenLabs

- **Tripwire's voice:** `ELEVENLABS_VOICE_ID` (and optional `ELEVENLABS_VOICE_ID_ES`)
  with `eleven_flash_v2_5` streaming TTS. It speaks once per call, only after
  Diego replies. Browser speech is the fallback.
- **Scammer agent:** record written consent, create an instant voice clone, set
  `ELEVENLABS_SCAMMER_VOICE_ID`, then `npm run setup:agent` and copy the printed
  `ELEVENLABS_AGENT_ID`. The protected-role endpoint returns a signed URL; the
  agent's PCM output streams to Gemini, so venue noise never reaches the model.
  The "short arc" option overrides the prompt per session.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` before
merging. Automated tests use mocks or no-key fallbacks and do not consume credits.
For a live smoke test, run `npm run check:live`, then ring Rosa's phone with the
agent and confirm GEMINI-tagged tumblers in Mission Control.
Rehearse all three family views three times and confirm provider failures cannot
release payments or erase critical warnings.

## Tiger Data

Set server-only `DATABASE_URL` in your ignored `.env`. Follow [Tiger setup](TIGER.md)
for schema initialization, connection checks, TLS options, and deployment secrets.
Only risk metadata is uploaded; payment holds still work without the database.

## Solana

See [production Solana setup](SOLANA.md). The devnet escrow program and guardian
wallet-signing flow are implemented; activation requires program deployment,
independent guardian configuration, and a funded runtime payer. No mainnet funds
are supported. Without configuration the UI retains its explicit Web2 fallback.

Mock dollar payments, SQLite holds, and scripted calls remain simulated.
Presage and SMS are not connected. Live provider accuracy and microphone
latency must be measured with your account before claiming those demo metrics.
