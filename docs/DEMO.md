# Tripwire demo runbook (2:40 at the expo table, repeatable)

“Every bank app asks ‘Are you sure?’ A great teller asks ‘What’s it for?’ and then calls your grandson.”

## Before judging (once)

1. `.env` has `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `EL_AGENT_SCAMMER_ID`, `EL_AGENT_VERIFIER_ID`, `TIGER_DATABASE_URL`. Run `npm run seed` (prints 29x) and `npm run check:live` (prints PASS).
2. Deploy (HTTPS needed for phone mics). Open on the laptop: `/` (Rosa's bank app, mirrored to the monitor) and `/operator` (hidden). On the big monitor: `/dashboard` (Mission Control follows the whole job live, ending in the case file) or `/case/latest` (the case file alone).
3. Rosa's phone: `/call?who=rosa`. Diego's phone: `/call?who=diego`. Tap **Ready** on both. Ringers and speakerphone on.
4. Headset or boom mic for Rosa on the laptop. Small speaker for the teller.

## Beats

| Time | Beat | Operator | What should happen |
|---|---|---|---|
| 0:00 | Hook | **START SCAM CALL** at the end | Narrator: “Swivel showed us this…” |
| 0:15 | Scam call | — | Rosa's phone rings, caller ID “Diego”. Cloned voice: arrested, $2,500 bail, M. Ellis Legal, don't tell Mom. Rosa hangs up. |
| 0:50 | The teller | — | Rosa: Send money → (prefilled $2,500, M. Ellis Legal, instant) → **Send $2,500**. Screen softens; the teller speaks first: “about 29 times what you usually send… what's it for?” Rosa tells the story; the teller asks to call Diego; Rosa: “Yes, please.” Status: “Calling Diego…” |
| 1:35 | The call back | (FORCE RESULT · not me if the verifier fails) | Diego's phone rings: “Tripwire · Rosa's bank”. Verifier asks; Diego: “What? No! I'm fine.” Seconds later the teller tells Rosa he's safe. Screen: “Your $2,500 is safe.” |
| 2:05 | Case file | — | Monitor: laser sweep, FILE 00N // THE BAIL JOB, FOILED stamp. |
| 2:20 | Reveal | — | “That first call was a live AI clone of Diego's voice, made with his permission…” |
| after | “Want to be Grandma?” | **RESET** | Hand the judge the headset. RESET returns to Home in under a second. |

Flexes (only if rehearsed): **FORCE RESULT · it's me** (release path), **Language → Español** before Send (the teller starts in Spanish and follows Rosa), **Scammer coach mode** (the caller tells Rosa to say it's a car repair; the teller asks why a legal firm).

## Failure plan

- Scam call doesn't connect → START SCAM CALL again; if ElevenLabs is down, a teammate reads the scammer lines on speaker.
- Verifier fails or Diego's phone is silent → **FORCE RESULT · not me**; Diego says his line out loud. The teller still delivers the result. If the teller doesn't respond within 12 s, Tripwire rules hold the payment and write the case file.
- Teller can't connect → Rosa's screen says her money stays put; **CALL DIEGO (manual)**, then FORCE RESULT. The session auto-reconnects twice and re-sends the conversation so far.
- Loud room → operator turns on **Push-to-talk**; Rosa holds the big button while she talks.
- Wi-Fi → one phone hotspot for the laptop and both phones.
