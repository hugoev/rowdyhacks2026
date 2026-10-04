# Tripwire v3 threat model

Scope: one fictional household, simulated payment, public demo browser calls.
No auth is planned for v3; hidden `/operator` is not an access-control boundary.
The target must not be described as ready to protect real accounts or money.
Current paired-role security is legacy and remains until implementation replaces it.

The scammer controls the story, urgency, secrecy, coached cover story, and a
convincing cloned voice. A caller-supplied number or payee is not a trusted
verification destination. The server's saved contact map selects Diego/Ana;
the model can choose only those IDs. Verification reaches their separate app
session; it does not detect a deepfake.

| Threat | Target control / limitation |
| --- | --- |
| Perfect clone convinces Rosa | Ask the real saved contact; do not score voice authenticity |
| "Tell the bank it is car repair" | Open questions and payee/context mismatch; coached-cover rehearsal |
| Scammer supplies callback number | Server contact allowlist; never accept arbitrary number/agent destination |
| Late/replayed result after RESET | Match session/request/tool ID; terminal-state and duplicate-result checks |
| Model claims confirmation without callback | Server records verification; release policy checks actual matched result |
| No answer or provider outage | Keep held; try Ana or explicitly logged operator fallback |
| Duplicate finish / case insert | Stable case/payment ID and idempotent writes |
| API-key exposure | Server keys; short-lived Gemini tokens and signed ElevenLabs sessions |
| Public operator/result abuse | No-auth demo cannot provide real authorization; forced results are marked |
| Compromised contact/device | Outside demonstrated protection; calling back is not an absolute guarantee |

Rosa consents before contact verification and microphone use. Tripwire does not
listen to or record the earlier scam call for detection. The teller conversation
and verifier answer go to their respective AI providers; case quotes and payment
context persist in Tiger Data. Do not claim that v3 uploads only risk metadata.
The voice owner must supply real consent for cloning; use the stock brand voice
for verification. No real customer data or payment credentials in the demo.

No-answer cooling-off is not yet specified or tested. Before real deployment:
proper authorization, enrollment/contact integrity, household isolation, audit
and retention rules, transactional payment integration, replay protection, and
independent security/privacy evaluation. These are limitations, not extra demo scope.
