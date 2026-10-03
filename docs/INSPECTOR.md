# Inspector demo checks

The Inspector preserves the frontend team's typography and design, adding picture
previews, inline errors, and a focused result heading. Results name warning signs and one next step;
they never confirm that a sender is safe. The same layout works for the protected
user and guardian. Keyboard users can choose pictures without dragging them.

Picture analysis requires Gemini on the server. If unavailable, the page offers
text checking and explicitly says that the picture was not checked. Text checks
can fall back to deterministic rules when Gemini fails. Scans are not saved by
Tripwire; Gemini receives submitted content when configured.

## Prepared screenshots

Generate the ten fictional screenshots without calling any provider:

```sh
node --import tsx scripts/create-inspector-samples.ts
```

Files `public/inspector-samples/01.png` through `10.png` follow the order of
`scanSamples` in `lib/scenarios.ts`: delivery phishing, two romance requests,
government impostor, fake job, safe account, tech support, family emergency,
library reminder, and dinner plans. All messages are synthetic. These screenshots
test a controlled demo and do not establish real-world accuracy.

## Verification

`npm run test:e2e` checks picture validation, preview, unavailable analysis,
loading, retry, focus, mobile layout, and a mocked Gemini result.
`npm test` checks provider validation and fallback behavior. Neither command
makes live Gemini requests. Only run `npm run eval:gemini` when explicitly
authorized to spend credits.
