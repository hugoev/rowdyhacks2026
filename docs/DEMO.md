# Tripwire v3 demo runbook - 2:40

Target runbook; current v2 screens do not yet support this flow.

## Table setup

Laptop: Rosa's bank app `/`, phone-sized frame, mirrored to the judge monitor.
Small speaker for Gemini's teller; headset/boom microphone for Rosa. Two physical
phones face up, speaker ready: `/call?who=rosa` and `/call?who=diego`. Each taps
Ready once to unlock audio. Operator uses hidden `/operator`; never touch the
main screen while presenting. Narrator, Rosa/judge, Diego, operator are the roles.

Confirm both agents, actual clone consent, keys, Tiger seed, HTTPS, and a tested
hotspot. Payment and calls remain simulated bank/app calls; no telephone network.

## Five-beat story

| Time | Beat | Action |
| --- | --- | --- |
| 0:00-0:15 | Hook | "Swivel asks Are you sure? Grandma says yes because she believes it." Operator starts scam call. |
| 0:15-0:50 | Scam | Rosa answers. Diego clone: arrested, $2,500 bail today, M. Ellis Legal, don't tell Mom; call ends. |
| 0:50-1:35 | Teller | Rosa sends $2,500 instant/new payee. Gemini notes ~29x usual, asks what for, empathizes, asks permission to call saved Diego. Rosa agrees. Status: Calling Diego... |
| 1:35-2:05 | Callback | Diego answers verifier: "No, I'm fine, I'm literally right here." Result returns mid-session. Teller explains impersonation and holds money kindly. |
| 2:05-2:20 | Case file | Monitor shows generated FILE 001 // THE BAIL JOB with FOILED stamp and real quotes. |
| 2:20-2:40 | Reveal | First call was a live consented clone. "AI made this scam possible. Now AI calls your grandson." |

Outcome: "Your $2,500 is safe" for the held mock transfer. Three plain lines:
they pretended to be Diego; they said it was urgent; they asked for secrecy.
Tip: "Next time, hang up and call Diego yourself."

Then offer "Want to be Grandma?" Run again with the judge; the conversations
should adapt to their answers. Reset between judges; target 30+ repeatable runs.
Never announce hardcoded/sample data as a measured real customer's history.

## Optional rehearsed flexes

- Confirmed emergency: Diego says it is him; teller releases the mock payment.
- Spanish: Rosa switches language; Gemini follows.
- Coached cover story: scammer says car repair; teller probes kindly why the
  payee is a legal firm and verifies with Diego.

## Failure drills

- Scammer does not connect: re-ring; if unavailable, teammate reads scam lines.
  Omit the clone reveal when the fallback was used.
- Verifier fails: operator forces not_me; Diego says his line aloud. Event log
  identifies the forced result; do not call this a live verifier success.
- Gemini disconnects: reconnect with session context and pending result;
  otherwise reset and restart Send (about 20 seconds).
- Noise: headset, then push-to-talk after that control is implemented.
- Wi-Fi: tested shared hotspot for laptop and both phones.
- Reset: Home in under 1 s; stale results cannot affect the next judge.

Rehearse five clean runs, then at least 15 with strangers. Freeze code two hours
before judging. Check prize cap and whether submission requires a demo video.
