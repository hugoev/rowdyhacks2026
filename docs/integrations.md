# Integrations (PRD v3)

Only Gemini, ElevenLabs, Tiger Data, Vultr, and the domain. Keys live in `.env` on the server.

## Gemini 3.8 Live (the safety teller)

- `/api/token` runs the risk check and, if it triggers, mints a single-use ephemeral token (`v1alpha`) whose `liveConnectConstraints` lock the model, the system instruction with Rosa's payment context, and the three tools. The browser connects with `@google/genai` and can't change the prompt.
- Audio: mic 16 kHz PCM16 in (AudioWorklet), 24 kHz PCM out through a gapless queue that stops instantly on `interrupted` (barge-in). Input and output transcription drive the captions.
- Tools: `call_trusted_contact` is declared `NON_BLOCKING`; the app answers it later, with the same call id, when Diego's verifier reports (`scheduling: INTERRUPT`). `decide_payment` and `finish` are answered immediately with `WHEN_IDLE`, so the teller keeps talking. Measured: answering them `SILENT` made the teller go quiet after the hold.
- The teller speaks first: the app sends a bracketed opening cue as soon as the session opens. Measured first audio: 1.4–1.8 s after the token.
- Reconnect: up to two automatic reconnects with a fresh token, re-sending the conversation so far.
- Push-to-talk (operator toggle): automatic activity detection is disabled in the locked config and the client sends `activityStart` / `activityEnd` from a hold button.
- `npm run check:live` plays Rosa's side as text against the real model and checks the whole tool sequence.

## ElevenLabs (two phone agents)

- `npm run setup:agents` creates both agents and prints `EL_AGENT_SCAMMER_ID` / `EL_AGENT_VERIFIER_ID`. The scammer needs `ELEVENLABS_SCAMMER_VOICE_ID`, a consented instant clone ([consent form](CONSENT.md)).
- `/call?who=...` asks the server for a signed URL for the ringing agent and starts `VoiceConversation` with the ring's dynamic variables (`grandma_name`, `contact_name`, `amount`, `claim_summary`, `payee`, `coach_instructions`).
- The verifier's `report_result` is a client tool: it runs in the browser on Diego's phone and POSTs `/api/result`, which reaches Rosa's teller over SSE.

## Tiger Data

See [TIGER.md](TIGER.md).

## Vultr

One Node server holds the in-memory demo session and the SSE stream every page listens to, so it must be a single long-running process (not serverless). See [VULTR.md](VULTR.md).
