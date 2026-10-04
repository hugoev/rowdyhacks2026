# Tripwire demo runbook (2:40 at the expo table, repeatable)

“Every bank app asks ‘Are you sure?’ A great teller asks ‘What’s it for?’ and then calls your grandson.”

## The easy way: one page

Open **`/demo`** on the laptop (headset mic, speaker on) and press **Start the demo**. Everything happens on that one screen:

1. Rosa's phone rings ("Diego"). Answer. The scam caller is an AI (Gemini Live, stock voice) that asks for $2,500 bail and says don't tell Mom. Hang up.
2. Rosa's bank app is now on her phone panel: **Send money → Send $2,500**.
3. The teller speaks first. Tell it the story; say yes when it asks to call Diego.
4. Diego's phone rings in the middle panel. Answer and say "No, I'm fine!" into the same mic. (Backup button: "Diego says not me".)
5. The teller tells Rosa her money is safe; the right panel shows the case file. **Reset** for the next judge.

The right panel always shows the next step. Optional: put `/dashboard` on the big monitor.

## Before judging (once)

1. `.env` has `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `EL_AGENT_SCAMMER_ID`, `EL_AGENT_VERIFIER_ID`, `TIGER_DATABASE_URL`. Run `npm run seed` (prints 29x) and `npm run check:live` (prints PASS).
2. Deploy (HTTPS needed for phone mics). Open `/` for the dashboard and `/demo` for the complete demo. Saved call reviews appear in the dashboard and `/calls`; there is no separate Operator or Case Monitor page.
3. Rosa's phone: `/call?who=rosa`. Diego's phone: `/call?who=diego`. Tap **Ready** on both. Ringers and speakerphone on.
4. Headset or boom mic for Rosa on the laptop. Small speaker for the teller.

## Beats

| Time | Beat | Operator | What should happen |
|---|---|---|---|
| 0:00 | Hook | **START SCAM CALL** at the end | Narrator: “Swivel showed us this…” |
| 0:15 | Scam call | **RING ROSA** | Rosa's phone rings, caller ID “Diego”. Rosa answers on speaker; a teammate (off to the side) plays the scammer live: arrested, $2,500 bail, M. Ellis Legal, don't tell Mom. Rosa hangs up. |
| 0:50 | The teller | — | Rosa: Send money → (prefilled $2,500, M. Ellis Legal, instant) → **Send $2,500**. Screen softens; the teller speaks first: “about 29 times what you usually send… what's it for?” Rosa tells the story; the teller asks to call Diego; Rosa: “Yes, please.” Status: “Calling Diego…” |
| 1:35 | The call back | (FORCE RESULT · not me if the verifier fails) | Diego's phone rings: “Tripwire · Rosa's bank”. Verifier asks; Diego: “What? No! I'm fine.” Seconds later the teller tells Rosa he's safe. Screen: “Your $2,500 is safe.” |
| 2:05 | Case file | — | Dashboard: the completed call appears with its FOILED outcome and an expandable review. |
| 2:20 | Close | — | “Today a voice clone makes that call sound exactly like Diego. Tripwire doesn't care: it never tries to detect the voice. It calls the real Diego.” |
| after | “Want to be Grandma?” | **RESET** | Hand the judge the headset. RESET returns to Home in under a second. |

Flexes (only if rehearsed): **FORCE RESULT · it's me** (release path), **Language → Español** before Send (the teller starts in Spanish and follows Rosa), **Scammer coach mode** (the caller tells Rosa to say it's a car repair; the teller asks why a legal firm).

## Failure plan

- The scam call is always a teammate (ElevenLabs' safety review blocks scam-impersonation agents). If Rosa's phone page misbehaves, the teammate just speaks the lines in person.
- Verifier fails or Diego's phone is silent → **FORCE RESULT · not me**; Diego says his line out loud. The teller still delivers the result. If the teller doesn't respond within 12 s, Tripwire rules hold the payment and write the case file.
- Teller can't connect → Rosa's screen says her money stays put; **CALL DIEGO (manual)**, then FORCE RESULT. The session auto-reconnects twice and re-sends the conversation so far.
- Loud room → open Demo controls and turn on **Push-to-talk**; Rosa holds the big button while she talks.
- Wi-Fi → one phone hotspot for the laptop and both phones.
