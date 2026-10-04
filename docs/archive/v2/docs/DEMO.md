# Tripwire demo runbook (3:00, fully live, no video)

“Tripwire listens for the con, not the voice, and stops the payment before the money moves.”

## Setup (once)

1. `npm ci`, `cp .env.example .env`, add `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`.
2. `npm run check:live` must print `PASS` (token mint, Live session, tool calls).
3. Record Diego’s written consent and voice sample; create the instant voice clone; set `ELEVENLABS_SCAMMER_VOICE_ID`; run `npm run setup:agent`; set `ELEVENLABS_AGENT_ID`.
4. Optional: `npm run eval:live` to fill the eval card with measured numbers (the card says “No measured run yet” until then).
5. `npm run build && npm start`. Set the family word in **Family settings** (for example “Marigold”).

## Screens

| Device | URL |
|---|---|
| Big screen | `/stage` (Rosa left, Mission Control right) |
| Rosa’s device (headset mic) | `/protected` (Operator drawer at the bottom is for the operator) |
| Diego’s phone | `/relative` |
| Operator laptop | `/guardian` and Rosa’s Operator drawer |

## Beats

| Time | Beat | What should happen |
|---|---|---|
| 0:00 | Hook | Narrator. |
| 0:15 | Operator: Caller channel = **ElevenLabs scammer agent (full arc)** → **Ring Rosa’s phone**. Rosa taps **Answer**. | Status shows “Gemini Live”. |
| | Clone: “Grandma, it’s me. I got arrested… don’t tell Mom.” | Con Meter tumblers click in with quotes and latencies; surveillance log scrolls; risk dial climbs. |
| | Whisper on Rosa’s screen: “Ask him for your family word.” Rosa asks out loud, then taps **I asked**. | Clone dodges → `check_family_word → no answer (dodged)`, Trust tumbler turns red. |
| 1:10 | Clone: “Send it from your bank app, as gift cards.” Rosa: **Open my bank app** → **Send money $2,500**. | “Paused. The caller asked you to keep this secret from your family and refused your family word. We’ve asked Diego.” Diego’s phone buzzes. |
| 1:45 | Diego reads the card aloud, taps **Not me, block**. | Laser sweep + HEIST FOILED on all screens; Tripwire voice: “Rosa, Diego just confirmed he’s safe and it wasn’t him…”; case file appears. |
| 2:15 | Reveal: the voice was a live, consented AI clone. | |
| 2:35 | Mission Control → **Proof points**. | Eval card (real numbers only). |

## Failure drills (rehearse every one)

- **Agent goes off-script:** hang up, choose **ElevenLabs scammer agent (short arc)**, ring again (30 s).
- **Agent or Wi-Fi fails:** choose **Operator microphone**; the operator speaks the lines. Same demo, minus the clone reveal.
- **Gemini slow or down:** the rule spotter keeps the Con Meter moving (tagged RULE) and prompts the family word; the Teller and Diego’s loop are deterministic.
- **No audio at all:** choose **Typed lines**, press **Next caller line**; lines go to the rules and, as text, to Gemini.
- **Network down:** phone hotspot; all surfaces run on one laptop as separate windows.
- **Reset between runs:** Operator drawer → **Clear activity**.

## Q&A anchors

- Why not detect deepfakes? Detection is an arms race. The con’s structure doesn’t change.
- Privacy? Listening starts only when Rosa answers with Tripwire on; only the caller is heard; audio isn’t stored; only flagged case files are kept; the family word never reaches the model.
- False positives? Normal payments see nothing; friction appears only with call context or strong anomalies; the family can always release.
