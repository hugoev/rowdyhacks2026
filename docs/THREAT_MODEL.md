# Tripwire threat model (PRD v3)

Social engineering is a security problem: the attacker doesn't break in, they convince the account holder to open the vault. Tripwire's control is out-of-band verification with the person being impersonated, at the moment money moves.

## Assets and boundary

Rosa's money (simulated here) and her trust. The bank's risk check and the teller run on the bank's side; the attacker controls the phone call, the story, and possibly a perfect voice clone. They do not control Rosa's saved contacts or the bank's server.

## Threats and controls

| Threat | Control | Limit |
|---|---|---|
| Perfect voice clone of a relative | Never detect the voice; verify the person by calling the contact saved on the account | Saved contacts must be kept current |
| Caller supplies a “callback number” | The teller can only call `diego` or `ana` from the account; `call_trusted_contact` has no number parameter | Account takeover that edits contacts is out of scope |
| Coached cover story (“say it's a car repair”) | The teller asks open questions about purpose and notices mismatches (a legal firm for a car repair); it still offers the call | A fully consistent story plus an unreachable contact leaves the money on hold, not blocked forever |
| API key theft from the browser | Gemini: single-use ephemeral tokens (2-minute start window, 15-minute life) with the model, prompt, and tools locked server-side. ElevenLabs: server-signed session URLs | A token can be used once within its window by whoever holds it |
| Prompt injection via Rosa's speech | The teller's tools only ring a saved contact, hold or release, and write a case file; Diego's answer, not the model, decides. Case-file text is length-capped and control characters stripped | A manipulated teller could release a payment the rules flagged; production should require the contact's confirmation for release |
| Abuse of the hosted demo | Origin checks, a custom header on every mutation, Zod validation, rate limits, optional `OPERATOR_KEY` for actions that ring phones | Single shared demo session; not multi-tenant |
| Privacy | No call listening or recording; only risky payments open the teller; case rows store the summary, not audio | Rosa's teller conversation is processed by Gemini |
