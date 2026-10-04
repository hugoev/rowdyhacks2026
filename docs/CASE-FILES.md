# V3 family case files

Planned route `/case/:id`. Gemini's finish tool fills the case from Rosa's real
teller conversation and the verifier result; the server persists it in Tiger
Data. This replaces the current SQLite `/cases` view and is not implemented yet.

The heist theme lives here: kraft paper, typewriter/slab headings, red Tripwire
laser motif and a decisive FOILED stamp. Rosa's bank, captions, and outcome stay
calm and legible. White/cream and brown from the established design remain the
base; red marks the intervention. Motion should support the story and respect
reduced-motion preferences.

```text
FILE 001 // THE BAIL JOB                         [FOILED]
The mark ........ Rosa, 74
The inside man .. someone posing as grandson Diego
The pressure .... "arrested", "bail today"
The cover ....... "don't tell Mom"
The getaway ..... $2,500 instant transfer to M. Ellis Legal
                  new payee, about 29x her usual
Foiled by ....... called real Diego on his saved contact
Time to stop .... actual elapsed time (not a fixed 0:47)
```

Quotes must come from the actual session, not fabricated model evidence.
Outcome and foiled_by must match the recorded result; distinguish confirmed,
not_me, unanswered, and operator-forced fallback. Store pressure quotes, cover,
getaway, tip, amount/payee, outcome, and measured seconds_to_stop. The demo's
0:47 is illustrative only; define the timing start/end during implementation.

Show three plain explanations and a next-time tip to Rosa. Case rows are the
family record; Ana delivery is a pitch concept, not an implemented notification.
No extra dashboard, scoring meter, or risk chart is needed.
