# Tripwire PRD v3 - demo-first, minimal

Active specification, October 4, 2026. Replaces v2. This document describes the
**target**, not a claim that the current deployment implements it.

> Every bank app asks "Are you sure?" A great teller asks "What's it for?" and then calls your grandson.

## Product and users

A grandparent believes a family-emergency call and tries to pay. Tripwire puts a
kind bank teller inside the payment moment: ask what it is for, recognize the
story, ask permission to call the saved contact, verify directly, and explain
what happened. It never needs to classify a voice as a deepfake.

Primary user: Rosa, 74. Trusted contacts: Diego, her grandson, and Ana, her
daughter. Demo payee: M. Ellis Legal. One fictional household and one demo session.

The teller is Gemini Live. ElevenLabs powers both phone agents: a consented Diego
clone role-playing the scammer, and a stock-voice verifier calling the real Diego.
Only Gemini, ElevenLabs, Tiger Data, Vultr, and the domain are in the active stack.

No dashboards, Con Meter, caller listening, family words, auth, blockchain,
camera, or video. Preserve calm, readable Rosa screens; put the heist drama into
case files and visual identity. The scammer call ends before the teller starts.

## Surfaces

1. `/`: centered bank app, max width 420 px, large type and high contrast.
   Home (balance, Send) -> editable prefilled Send -> Tripwire -> Outcome.
2. Tripwire state: soft orb pulsing with output audio, last two caption lines,
   one status line such as "Calling Diego...". No scoring UI.
3. Outcome: "Your $2,500 is safe" for the held demo payment, or "Sent" for a
   confirmed payment; three plain explanations and one next-time tip. This is
   copy about the simulated payment remaining in the demo, not general safety.
4. `/case/:id`: family-facing generated heist file, shown on the big monitor.
5. `/call?who=rosa|diego`: Ready, ringing, Answer, agent conversation, Hang up.
6. `/operator`: hidden control page with START SCAM CALL, RESET, FORCE RESULT
   not_me/confirmed, LANGUAGE en/es, and server-event log. Coach mode is optional.

The phone calls are browser sessions using ElevenLabs's web SDK. Ready unlocks
sound; an incoming event plays a ringtone; Answer starts the assigned agent.
There is no telephony API or PSTN call. In a production concept, verification
would call the independently saved number; the hackathon maps it to Diego's page.

## Payment anomaly gate

Use Tiger Data transaction history, not model risk scoring. Seed about 12 months
of realistic payments: utilities, pharmacy, groceries, church, monthly $50 to
Diego. Aim for a typical payment near $86; M. Ellis Legal has no history.

On Send, a single SQL query returns `{is_new_payee, typical, multiple, trigger}`:

`trigger = multiple > 5 AND (is_new_payee OR instant_or_irreversible_rail)`

$2,500 to M. Ellis Legal should be about 29x typical and open the teller. A $40
City Electric bill to a known payee sends without the teller. Define the typical
statistic and lookback consistently with the seed; an unweighted median of daily
medians is not automatically the median of all transactions.

Session state stays in one server process. Tiger Data persists transactions and
completed case rows. The brief's "no database" and "no persistence" shortcuts
refer to avoiding additional storage/auth complexity; they do not remove the
explicit Tiger Data requirement. Existing SQLite is legacy, not the v3 target.

## Architecture and API contract

Next.js App Router, strict TypeScript, Tailwind, custom long-running Node server
on Vultr behind Caddy HTTPS. Keep the supported Node 22 runtime during migration.
Rosa's bank connects directly to Gemini Live using a server-minted ephemeral
token. The two call pages connect to ElevenLabs agents. All pages receive SSE
from the same Node process. Do not deploy this session coordinator as separate
serverless functions or multiple unsynchronized replicas.

| Target endpoint | Contract |
| --- | --- |
| `/api/token` | Mint a short-lived Gemini token; never return the server key |
| `/api/check` | Query Tiger history and return the anomaly gate |
| `/api/ring` | Ring an allowlisted saved contact/call page with agent and variables |
| `/api/result` | Receive verifier result for the matching pending request |
| `/api/events` | SSE events: ring, result, reset, lang |

These routes replace the older role/call endpoints during implementation; they
are not aliases already supported today. Use a session/request identifier so
late callbacks cannot affect a reset or a newer payment. Capture decision,
finish, and case persistence through validated server actions/routes; their
transport details are an implementation task.

## Gemini safety teller

Requested primary model: `gemini-3.8-live`; requested fallback:
`gemini-3.1-flash-live-preview`. Verify availability, audio settings, asynchronous
tool behavior, and exact SDK fields before claiming fallback support.

Browser uses `@google/genai`: 16 kHz PCM16 microphone input, 24 kHz PCM output,
input/output transcription, queued playback, and barge-in that stops playback
when Rosa starts talking. Preconnect from Send; open within 1.5 seconds and
speak first within 2 seconds. These are acceptance targets, not measured results.
Use a headset; optional push-to-talk needs explicit activity start/end with
automatic activity detection disabled, after checking SDK field names.

System instruction:

```text
You are Tripwire, a warm, calm safety teller inside Rosa's bank app.
Rosa is 74. She just tried to send {amount} by instant transfer to a new
payee, "{payee}". This is {multiple}x her typical payment of {typical}
from her history. Saved trusted contacts: Diego (grandson), Ana (daughter).
Find out kindly what the payment is for. Never accuse, lecture, or say
"scam" first. Use short sentences. Reply in the language Rosa speaks.
If she describes a loved one in trouble, urgency, or secrecy, gently explain
that calls like this sometimes come from people pretending to be family.
Ask permission to call that person on the saved number. When she agrees,
call call_trusted_contact, say one short comforting line, then stay quiet
until the result arrives.
If they did not ask for money, explain kindly, decide_payment("hold"),
then finish. If they did, decide_payment("release"), then finish.
If clearly ordinary, decide_payment("release"). If unanswered or uncertain,
keep the payment held; do not infer confirmation.
```

Exactly three tools:

| Tool | Arguments and effect |
| --- | --- |
| `call_trusted_contact` | `contact: diego|ana, claim_summary: string`; non-blocking external verification |
| `decide_payment` | `decision: hold|release, reason: string`; server enforces result and state |
| `finish` | `job_name, impersonated, pressure_quotes[], cover_quote, getaway, foiled_by, tip`; Outcome and Tiger case row |

Keep the verification tool call ID while ringing. When SSE delivers the matching
result, send `{status: not_me|confirmed|no_answer, note}` as that function's
response in the still-open Live session. Do not return invented confirmation or
prematurely close the conversation. Report the result naturally, then decide
and finish. Release requires actual matched confirmation or a clearly ordinary
payment, not a model assertion that a contact confirmed.

## ElevenLabs phone agents

Agent A: consented teammate clone; pretend to be Diego, arrested and needing
$2,500 today to M. Ellis Legal; "don't tell Mom"; emotional/rushed; under 40 s;
end with "I'll call you right back". Dodge unknown personal details with urgency.
Runs on Rosa's `/call` page. Optional coach mode asks Rosa to describe the payment
as car repair, testing whether the teller notices the legal-firm mismatch.

Agent B: calm stock brand voice. Dynamic variables: `grandma_name`,
`contact_name`, `amount`, `claim_summary`. Ask whether Diego is safe and requested
money. Once known, invoke client tool `report_result(status, note)`, thank him,
ask him to call Rosa, and end within 30 s. Tool statuses: not_me, confirmed,
no_answer. Diego's browser POSTs the result to `/api/result`.

Only contact IDs from the saved account map may ring. Never use a destination
provided by the scammer or model. A consent note must be real, supplied by the
voice owner; do not generate or imply their consent. [Setup](integrations.md).

## Acceptance and failure gates

Run every acceptance test three times:

1. $40 to City Electric sends without Tripwire.
2. $2,500 to M. Ellis Legal opens Tripwire; first teller speech within 2 s.
3. Grandson story -> permission -> Diego's app rings within 2 s of agreement.
4. Diego says "no, I'm fine" -> teller explains -> held Outcome copy.
5. Operator FORCE RESULT works if verifier fails and is visibly operator-driven
   in the event log; do not present forced results as live verification.
6. RESET clears session UI to Home within 1 s and rejects old callbacks.

Rehearse five clean runs, then at least 15 runs including strangers as Rosa;
the expo target is 30+ repeatable runs. Spanish, confirmed release, and coached
cover story are optional only after the core path works.

Scammer failure: re-ring, then teammate reads lines. Verifier failure: forced
not_me with Diego speaking aloud. Gemini drop: reconnect with payment and pending
verification context; worst case reset and restart Send. Noise: headset then PTT.
Network: one tested hotspot for laptop and both phones.

No-answer behavior: hold and try saved Ana. Cooling-off release is a Q&A/product
extension; duration and UX are not specified by v3 and must be chosen and tested
before claiming it works. Never inherit a legacy timer silently.

## Team, timeline, and prizes

Four roles: bank/teller UI and audio; Node/SSE/Tiger; ElevenLabs/consented clone;
design, pitch, operator, rehearsal. Work in parallel as a team.

| Hours | Gate |
| --- | --- |
| 0-2 | Both phone apps ring and connect; Gemini speaks in browser; seed/query works |
| 2-6 | Acceptance 1-4 pass once |
| 6-10 | Prompt/timing tuning; five clean runs |
| 10-14 | Orb, captions, outcome, call screens, case-file polish; optional flexes |
| 14-20 | At least 15 rehearsals with strangers; fix failures |
| 20-24 | Devpost, domain, final rehearsals, sleep shifts; freeze 2 h before judging |

Prize priority, subject to organizer confirmation of any per-team cap:
Best Overall, Best Heist Theme, Best Design, Swivel; then ElevenLabs and Gemini;
then Tiger Data, Vultr, CyberJedis, domain. Select Investment Society without
extra features. Do not enter Best Beginner, Hardware, Solana, or Presage.
Prize values and event requirements are team-supplied planning context, not
independently verified here. Check prize cap and required submission video.

Swivel story: detect payment anomalies and what Rosa says; interrupt with a
conversation; protect through saved-contact verification; educate with a short
explanation and case file. Devpost leads with the five-beat story and real
screenshots. Explain how Swivel embeds a risk check plus teller into its flow.
Only claim live integrations and timings actually demonstrated.

Judge answers: practical payment-only intervention, no scam-call recording;
real emergency can release after confirmation; IRS/romance use trusted-contact
verification as an extension; deepfake detection is unnecessary to this path.
Avoid promising that any verification system "always works"; unreachable or
compromised contacts are limitations. See the [threat model](THREAT_MODEL.md).
