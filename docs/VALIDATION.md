# Validation status

PRD v3 is the active target. The docs update does not implement or validate it.
Previous checks are historical evidence for v2, not v3 readiness.

## Last verified existing implementation - October 4, 2026

- 51 unit tests, six browser tests including three complete rules-mode hero runs;
  production build and TypeScript passed. CI passed Linux, Windows, macOS, Rust.
- Vultr release 067d5f2cf102: paired logins, secure cookies, WebSocket delivery,
  held mock payment and Diego blocking, Tiger raw/aggregate persistence, privacy,
  three mobile views passed using the old flow.
- Gemini Live on Vultr: synthetic typed caller sentence produced six tool calls
  in about 1.8 s; this was the silent call-guard prompt, not an audible teller.
- ElevenLabs streaming TTS returned audio; conversational scammer/verifier agents
  were not verified. No ELEVENLABS_AGENT_ID was configured at that point.
- Live demo activity was cleared with a SQLite backup; settings/credentials kept.
- Stage-link fix 3f08e93 reached Vultr and was checked in a browser. These hashes
  identify historical checks, not a promise about the latest deployed revision.

`npm run check:vultr:e2e` still exercises v2 and creates synthetic records.
Do not run it to prove v3 or immediately after clearing demo activity.
Earlier detailed findings are [archived](archive/v2/docs/VALIDATION.md).

## V3 acceptance - all pending

Run each three times, record actual timings and provider/fallback used:

| Check | Target |
| --- | --- |
| $40 known City Electric bill | Sends; no teller session |
| $2,500 new M. Ellis Legal transfer | ~29x query; teller opens and speaks within 2 s |
| Story + permission to verify | Diego's app rings within 2 s |
| Diego: no, safe, did not ask | Result enters same Live session; Outcome holds $2,500 |
| Verifier failure | FORCE RESULT works, visibly logged as forced |
| RESET | Home within 1 s; prior callbacks rejected |

Also verify: two physical phones, Ready/audio unlock, Answer/microphone, captions,
24 kHz playback and barge-in, Gemini token constraints, verifier client tool,
no_answer hold, saved-contact-only routing, idempotent Tiger case persistence.

Optional only after core passes: confirmed release, Spanish, coach mode, Ana
retry, reconnect/context recovery, PTT. Do not claim cooling-off release until
its duration and behavior are specified and tested. Target five clean runs and
15+ rehearsals with strangers before aiming for 30+ expo repetitions.

## Two-agent setup - October 4, 2026

Scammer created with the project user's consented clone; verifier created with
stock voice, dynamic variables, and report_result client tool. Saved configuration
and signed-session URL checks passed for both agents. V3 key aliases are populated
locally and in the private deployment environment. These checks start no phone
conversations and do not satisfy the v3 real-phone acceptance gates.
