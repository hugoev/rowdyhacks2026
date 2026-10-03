# Live provider setup

Keep API keys in `.env` or the hosting provider's server-side secret settings.
Never use `NEXT_PUBLIC_` for keys. Restart the server after changing configuration.

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

## Verification

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` before
merging. Automated tests use mocks or no-key fallbacks and do not consume credits.
For a live smoke test, scan a synthetic screenshot and confirm `GEMINI` provenance,
start a prepared scam call, and inspect the guardian's held-payment summary.
Rehearse all three family views three times and confirm provider failures cannot
release payments or erase critical warnings.

Mock payments, SQLite holds, and scripted calls remain simulated. Solana, Tiger
Data, Presage, and SMS are not connected. Live provider accuracy and microphone
latency must be measured with your account before claiming those demo metrics.
