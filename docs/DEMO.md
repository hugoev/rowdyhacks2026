# Tripwire: Project Overview and Demo Guide

This is the team's single handoff guide: what we are building, what works, and how to demonstrate it.

## What we are building

Tripwire is a family scam-protection app. It helps someone recognize a suspicious call or message, check with a real relative, and involve a trusted guardian before sending money. Rosa is our older-adult demo user; Elena is her guardian and Alex is her grandson. These are fictional characters.

Today it is one mobile-friendly website with connected family views. The product direction is a standalone family companion plus protection that a bank or payment provider could embed at checkout. **The payment screen demonstrates that future integration. Tripwire cannot stop transfers through an unrelated banking app.**

One-liner: "Tripwire asks whether the account holder should really be making this payment, then replaces a generic confirmation with a warning, trusted verification, and a family second key."

## Screens and responsibilities

| Screen | Route | Purpose |
| --- | --- | --- |
| Rosa's shield | `/protected` | Check a call, family word, callback, and simulated payment |
| Elena's command center | `/guardian` | See risk signals, payment details, and approve or deny |
| Alex's reply | `/relative` | Confirm whether Alex is calling; no payment or transcript access |
| Inspector | `/inspector` | Check suspicious text or screenshots |
| Case files | `/cases` | Review warning signs and payment outcomes |
| Family settings | `/settings` | Safe word, consent, co-sign limit, and provider status |

Optional extras: `/student` adapts the shield to fake-job scams; `/drill` offers scripted scam practice; `/weather` shows explicitly synthetic San Antonio scam trends.

## How the technology fits

The browser sends actions to our Node server. Socket.IO sends updates to the family views. Next.js and React provide the interface.

| Technology | Job in Tripwire |
| --- | --- |
| Deterministic rules | Immediately score warning signs and enforce payment holds |
| Gemini | Add call analysis, inspect screenshots, explain held payments, and simplify denied-payment lessons |
| ElevenLabs | Transcribe microphone audio with Scribe and speak warnings using a stock voice |
| SQLite | Persist settings, payment holds, case records, and pending analytics events |
| Tiger Data | Store risk metadata and power the guardian's historical chart |
| Solana | Optional native devnet escrow with a guardian signature or cooling-off deadline |
| Vultr | Host the app and backend; Caddy supplies HTTPS |

Risk levels are Low (0-29), Medium (30-59), High (60-84), and Critical (85-100). Critical payments, or payments above the family's co-sign limit, are held. AI cannot erase existing call risk or approve payments. Rules and local explanations remain available during AI failures.

## Start locally or use the hosted app

Hosted address: <https://tripwire.64.177.46.134.sslip.io>. Use role access codes shared privately by the team; never commit them here.

Locally, use the team-recommended Node.js **22.22 or newer**:

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. Run `npm ci` after pulling dependency changes; this fixes missing-package errors such as `Cannot find package '@solana/web3.js'`.

The scripted demo works without API keys. For integrations, copy `.env.example` to `.env`, add your own credentials, save, and restart. On PowerShell use `Copy-Item .env.example .env`; on macOS/Linux use `cp .env.example .env`. Keep secrets private.

For the simplest local presentation, set `DEMO_MODE=true` and leave `SOLANA_PROGRAM_ID` and `SOLANA_GUARDIAN_PUBLIC_KEY` empty. This uses SQLite holds without a wallet. Do not change hosted configuration just for rehearsal.

## Prepare the presentation

1. Open `/protected`, `/guardian`, and `/relative` on the **same hostname**. Three tabs work; three devices show the family interaction better. Check each live-connection indicator. On phones, use the hosted URL; `localhost` refers to the phone itself.
2. Check Family settings for provider and Solana status. If Solana is enabled, Elena needs the configured guardian wallet in a wallet-enabled browser such as Phantom. Arrange this with the wallet owner first.
3. Use **Reset demo** in the guardian view if available. It requires demo mode and refuses while chain-backed escrows remain unsettled. Never reset mid-story. Otherwise create a fresh payment and use its newest queue entry.
4. Optionally configure the family safe word in `/settings`. Only the guardian can replace an existing word. Never put the actual word in a transcript.
5. In Rosa's **Check a call** screen, turn off **Read critical warnings aloud** for a quiet presentation, or test the speaker control first.

## Main demo: about three minutes

### 1. Introduce the problem

Say: "A scammer can convince the real account holder to send money. Tripwire gives Rosa a second set of ears and her family a second key. The payment screen simulates a banking integration."

### 2. Show the suspicious call

On Rosa's `/protected`, choose **Check a call**, expand **Presenter controls**, select **The Grandson Job**, and click **Start scripted demo**. Click **Next scripted line** twice to reach the secrecy and gift-card request.

Show Elena's risk dial and signals. Say: "Tripwire names the pressure tactics: a family emergency, urgency, and a request to keep the money secret."

**Scripted mode uses submitted text, not the microphone.** The microphone-off message is expected. Rules react immediately; Gemini enrichment follows asynchronously when configured.

### 3. Verify identity through family

Optional: open **Check the family word**, enter an incorrect caller answer, and click **Check their answer**. Show the failed check.

Open **Ask Alex**, then click **Check with Alex**. On `/relative`, Alex clicks **No, that's not me**. Return to Rosa and show his reply.

Say: "A familiar voice isn't proof. The real Alex replies through a separate family screen. This is a browser callback, not an SMS or phone call."

### 4. Hold the payment

Switch Rosa to **Send money**. Use **Try $2,500 in gift cards** in **Presenter controls** if needed, then click **Check & send demo payment**. The guard stays active while Rosa changes tasks.

Show **Your money can wait.** Say: "The check combines call warning signs with a new recipient and a risky payment method. The request waits for a family check rather than another 'Are you sure?' button."

### 5. Have Elena deny it

On `/guardian`, expand **Payment details** for the newest request. Click **Deny payment** and confirm.

- **Local hold:** denial immediately updates both screens.
- **Solana hold:** wait for the devnet **HELD** status, then connect the configured guardian wallet and sign the denial transaction. Pending deposits disable decision buttons. Show the explorer link and wait for confirmed refund.

Each Solana hold uses **0.001 devnet SOL**, plus rent and fees, regardless of the displayed $2,500. Those dollars never become a bank transfer. Attached escrows cannot bypass signing through the local approval endpoint.

Show **Elena stopped this payment** and **HEIST FOILED**. A rejected signature or RPC failure leaves the payment held; do not claim a refund until confirmed.

### 6. Show the lesson

After a local denial, Rosa's result includes **What happened**, **What gave us pause**, **How your family helped**, and **Your next step**. Show the matching case on `/cases`. Gemini may simplify the explanation; recorded checks and next actions remain controlled by the app.

The chain refund path records the outcome but currently may show the warning-label case view rather than that expanded lesson. Show the recorded signals and trusted-number next step instead.

Say: "We explain the pattern without blaming Rosa, so she can recognize the next attempt. You did nothing wrong by taking time to check."

### 7. Inspect a message and close

Open `/inspector`, choose **Romance · plane ticket**, and click **Inspect this message**. Show its warning signs and next action. For an image demonstration, upload a prepared screenshot from `public/inspector-samples/`; images require working Gemini configuration.

Close: "Tripwire detects, interrupts, protects, and educates. AI helps identify the pattern; trusted family verification makes the next step clear."

## Optional contrasts and recovery

- **Normal payment:** reset demo risk or start an ordinary-call scenario, then choose **Try a $40 bill** and submit. Stopping a Critical call alone does not clear its sticky risk. If an old result is showing, choose **Check another payment**.
- **Live voice:** choose **Use microphone**, grant permission, and have a teammate speak nearby or on speakerphone. This does not access ordinary telephone calls directly. Use scripted or pasted text if transcription fails.
- **Image unavailable:** demonstrate a pasted-text sample instead; never claim the fallback inspected a picture.
- **Solana pending:** ask the Solana teammate to check funding, wallet identity, and RPC status. Rehearse the local fallback separately; do not disable or delete an attached escrow.
- **No connection:** ensure devices use the same running server and correct role codes. Save changed `.env` settings and restart locally.

## Honest boundaries

Dollar payments and practice dialogue are simulated; Scam Weather is synthetic. Solana uses devnet only. Presage was dropped. Tripwire cannot hang up a real call, send a real SMS, freeze another app's transfer, or guarantee a request is legitimate. Its least alarming verdict is **no red flags found**.

Transcript retention is off by default. Live text is shared with the guardian, microphone/provider processing is external when enabled, and screenshot checks send the supplied image to Gemini. Use only synthetic personal information during public demonstrations.
