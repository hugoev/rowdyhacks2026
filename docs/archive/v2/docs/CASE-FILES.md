# Post-payment case files

When a guardian denies a flagged demo payment, Tripwire saves a short lesson
in the same SQLite case record. It appears immediately below the result on
`/protected` and in the matching file on `/cases`.

The lesson explains the suspected pattern, up to three warning signs, the
recorded family checks, and one next step using an independent contact number.
Denial alone is not evidence of fraud. Approval and timer release do not create
a scam lesson.

With `GEMINI_API_KEY` configured, one background summary request can rewrite
the explanation in plain language. Recorded warning signs, verification results,
payment outcome, and next action remain controlled by the application. A timeout,
quota error, or invalid response keeps the complete rules explanation; provider
status shows failures in Family settings. Payment denial never waits for AI.
Historical cases are not automatically rewritten by Gemini on server restart.

Only warning labels and the existing explanation go to Gemini for this task.
No transcript quotes, safe words, payment amount, or payee are sent. Case records
remain local; Tiger Data continues receiving risk metadata. Relative sessions
cannot see case files. Verification belongs to the original call, even if another
call starts before the guardian decides.

Verify with `npm test` and `npm run test:e2e`. The three-view demo checks denial,
the protected user's next step, and the guardian's case after a page reload.
These tests use synthetic input and mocked providers, without paid API calls.
