# PRD v3 provider and environment setup

This is the next setup brief. Current code still implements v2. No new agents,
voice clones, keys, provider resources, or production secrets are created by
this documentation update.

## Target environment contract

| Variable | Purpose | Current migration status |
| --- | --- | --- |
| `GEMINI_API_KEY` | Server-side ephemeral-token minting | Already consumed |
| `ELEVENLABS_API_KEY` | Server-side agent session setup | Already consumed |
| `EL_AGENT_SCAMMER_ID` | ElevenLabs Agent A, consented clone | New; runtime not wired |
| `EL_AGENT_VERIFIER_ID` | ElevenLabs Agent B, stock voice | New; runtime not wired |
| `TIGER_DATABASE_URL` | Transaction and case PostgreSQL database | New name; current runtime uses DATABASE_URL |
| `PUBLIC_BASE_URL` | Canonical HTTPS origin for bank and call pages | New name; current runtime uses APP_ORIGIN |

Keep all keys and DB credentials server-side, in ignored `.env` locally and
`.env.vultr`/GitHub `VULTR_ENV` for deployment. PUBLIC_BASE_URL is a public origin,
not a credential. The target brief also permits an optional model selection
`GEMINI_LIVE_MODEL`; verify the requested primary/fallback before wiring it.
Use `TIGER_CA_CERT` only if the connection needs an explicit CA certificate.
Infrastructure still needs its domain, certificate email, host/port, and SSH
settings; these are not additional application services.

Do not rename existing private keys before runtime support lands. Current
`.env.example` and `deploy/vultr/env.example` describe the current implementation.
`ELEVENLABS_AGENT_ID` is the old single-agent key, not a verifier configuration.
Voice IDs select voices during agent setup; agent IDs identify configured agents.
Never put API keys in `NEXT_PUBLIC_` values, browser events, URLs, or logs.

## Next setup sequence

1. Confirm account keys and required scopes without printing them. Existing keys
   were smoke-tested for Gemini Live and ElevenLabs TTS; that does not prove two
   conversational agents are ready.
2. Diego supplies a recorded consent statement, written consent, and about one
   minute of his own sample. Record actual consent in the repo; keep private
   recordings out of Git. Do not fabricate a consent note or clone someone else.
3. Create Agent A and Agent B with the prompts below. Record returned IDs in the
   private environment. Provider setup is the next task, not completed here.
4. Configure verifier client tool and dynamic variables. Verify signing/session
   URLs and web-SDK permissions for the deployed origin; keys remain on server.
5. Implement runtime support for the two IDs, session/request correlation, SSE,
   and result handling; migrate local and deployed templates together.
6. Seed Tiger transactions, verify the ~29x query, then test on two physical
   phones over HTTPS. Confirm Ready unlocks audio and Answer grants microphone.
7. Synchronize the complete VULTR_ENV secret, preserving unrelated infrastructure
   values; deploy and run v3 acceptance three times. Do not upload a partial file.

Existing `npm run setup:agent` creates the old scammer using
ELEVENLABS_SCAMMER_VOICE_ID and prints ELEVENLABS_AGENT_ID. It does not create
Agent B or install the v3 prompts, tools, and key names. Do not use it as if it did.

## Agent A - scammer, demo only

Voice: instant clone of consenting teammate Diego.

```text
You are role-playing a scammer for a fraud-prevention demo. Pretend to be
Diego calling grandmother Rosa. You were arrested and need $2,500 bail today,
sent from her bank app to M. Ellis Legal. Beg her not to tell Mom. Be emotional
and rushed. Keep it under 40 seconds, then say you'll call back and end the call.
If asked anything personal you cannot know, dodge with urgency.
```

Optional coach-mode prompt variant: tell Rosa to say "car repair" if the bank
asks. Do not add this until the normal demo is reliable. No live victims or real
payment instructions. Runs on `/call?who=rosa` using `@elevenlabs/client`.

## Agent B - verifier

Voice: calm stock Tripwire voice, not the clone. Allow dynamic variables
`grandma_name`, `contact_name`, `amount`, `claim_summary`.

```text
You are Tripwire calling {{contact_name}} for their grandmother
{{grandma_name}}'s bank. Say someone using their name told her
{{claim_summary}} and asked for {{amount}}. Ask: are you safe, and did you
ask her for money? As soon as you know, call report_result, thank them,
ask them to call her, and end the call. Keep it under 30 seconds.
```

Client tool `report_result`: required `status` enum not_me|confirmed|no_answer
and `note` string. Browser posts it to `/api/result` with the pending verification
identifier. Ambiguous answers/timeouts are no_answer, never confirmed. Runs on
`/call?who=diego`; add Ana only through the saved-contact map.

## Gemini teller

Gemini supplies audible output in v3; the legacy client discards output audio.
Use the exact system instruction and three tools in [PRD v3](PRD.md). Input and
output transcription become captions. A pending contact call retains its tool
ID; the matching result returns to that same session while it stays open.

Requested model gemini-3.8-live; proposed fallback gemini-3.1-flash-live-preview.
The primary passed a typed-line smoke test in the previous implementation.
Native two-way teller audio, fallback availability, barge-in, exact PTT fields,
and non-blocking external verification still require verification during build.
No large live eval run is part of this documentation task.
