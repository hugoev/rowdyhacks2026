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

Use synthetic examples on the free tier: Google may use submitted content to
improve its products. Review actual project quotas in AI Studio and lower
`GEMINI_MAX_REQUESTS_PER_MINUTE` if needed. This limit is per model and shared by
calls, scans, and summaries. Call analysis is coalesced to one request every six
seconds. Quota errors pause that model for at least a minute; rules and holds
continue operating. Provider settings distinguish configured keys from successful
requests and degraded service.

Run `npm run eval:gemini` explicitly to compare three models using ten generated
synthetic screenshots (including two romance examples) and three call scripts.
It requires a Playwright Chromium installation. It makes up to 39 API requests;
quota errors are reported as incomplete evaluations, not successful detections.
No model is switched automatically: record results, then change task-specific
environment settings if the selected model fails accuracy or latency targets.

## ElevenLabs

Set `ELEVENLABS_API_KEY`, select a stock `ELEVENLABS_VOICE_ID`, and keep
`ELEVENLABS_TTS_MODEL=eleven_flash_v2_5` for prompt warnings. Confirm your account
includes Scribe Realtime and enough credits in the ElevenLabs dashboard; 130,000
credits do not imply a fixed number of transcription minutes across plans.

Choose Use microphone on Rosa's screen. The protected-role endpoint issues a
single-use token only after a consented call starts. The browser SDK sends audio
directly to ElevenLabs; committed text goes to Tripwire and, when configured,
Gemini. Partial text stays in the browser. Capture ends on call end or navigation
and is muted during spoken warnings. HTTPS or localhost is required. If Scribe
fails, choose browser transcription, resume the microphone, or paste text; no
other recording service starts automatically. Browser audio is the voice fallback.

Token issuance is only configuration evidence. A connected session or committed
transcript marks live transcription working. Warning audio marks voice working.
Settings show last success and degraded service separately for each capability.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` before
merging. Automated tests use mocks or no-key fallbacks and do not consume credits.
For a live smoke test, scan a synthetic screenshot and confirm `GEMINI` provenance,
start a prepared scam call, and inspect the guardian's held-payment summary.
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
