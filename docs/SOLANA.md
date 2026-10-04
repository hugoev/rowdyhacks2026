> **Not used in PRD v3.** The app no longer integrates Solana; this documents the earlier devnet escrow prototype in `chain/`.

# Production website, devnet escrow

The live Vultr website uses Solana **devnet**, not mainnet. Displayed dollar
payments remain simulations. Each chain-backed hold deposits exactly 0.001 devnet
SOL, plus rent and fees. This native Rust program is a hackathon prototype, not
an audited financial product. No real SOL, bank payment, or gift card is involved.

The current hosted deployment is activated: the program is executable on devnet,
the guardian public key is configured in GitHub Actions, and the persistent server
fee payer has devnet SOL. `/api/health` has reported `solana: working`. A public
devnet RPC can still be rate-limited, and a complete live Phantom decision should
be rehearsed before presenting. The program is not configured for mainnet.

## Implemented and verified

- Native Rust program: `chain/src/lib.rs`; client wire format: `lib/solana-wire.ts`.
- The vault PDA binds the program, depositor, and hashed payment UUID.
- Guardian, recipient, refund destination, amount, and deadline are fixed at creation.
- Before the deadline, release requires the guardian's actual Solana signature.
- Refund always requires the guardian; refund destination is the depositor.
- After at least 24 hours, release can be submitted without a guardian signature.
- Terminal accounts stay on chain to reject repeated settlement. Rent stays locked.
- The server reconciles confirmed account state before changing the mock payment.
- Attached escrows cannot use the old Web2 decision endpoint, local expiry, or demo reset.
- Wallet rejection, RPC failure, and ambiguous confirmations keep the payment held.

The compiled program and backend adapter passed fifteen isolated-validator assertions covering deposits,
early-release rejection, unauthorized refund, wrong destination, signed refund,
replay rejection, signed release, exact balances, pre-funded PDA handling, and the
production adapter's deposit/prepare/sign/submit/reconciliation flow. Host Rust tests cover the
deadline boundary. These tests do **not** prove production devnet activation.

## Keys and program deployment

Install the [official Solana tools](https://solana.com/docs/intro/installation).
Windows program builds require WSL; the web app's npm commands remain portable.

```sh
npm run setup:solana
npm run build:solana
```

Setup creates private `.solana-private/deployer.json`, never overwriting a key.
Build creates `chain/target/deploy/tripwire_vault.so` and its program keypair.
Both private directories are gitignored. Keep the deployer/upgrade authority
**off Vultr**, back it up securely, and never share its recovery material.

Request free SOL at the [official devnet faucet](https://faucet.solana.com/) using
the public deployer address. Do not buy or transfer mainnet SOL. Then:

```sh
solana balance --url devnet --keypair .solana-private/deployer.json
solana program deploy --url devnet --keypair .solana-private/deployer.json --program-id chain/target/deploy/tripwire_vault-keypair.json chain/target/deploy/tripwire_vault.so
```

Record the returned **public** program ID. Preserve both keypairs for future
upgrades; deleting the generated program keypair makes the next build generate
a different program identity. Program deployment must happen before activation.

## Activate Vultr through the existing CI deployment

Keep the complete `VULTR_ENV` secret intact. GitHub Actions overlays these optional
repository variables, so new settings do not overwrite Tiger/provider keys or
family access codes:

```sh
gh variable set SOLANA_PROGRAM_ID --repo hugoev/rowdyhacks2026 --body PUBLIC_PROGRAM_ID
gh variable set SOLANA_GUARDIAN_PUBLIC_KEY --repo hugoev/rowdyhacks2026 --body PUBLIC_GUARDIAN_ADDRESS
```

Use a separate devnet-only guardian wallet that you control in the browser.
Never store that wallet's private key on Vultr or in GitHub. Optional variable:
`SOLANA_RECIPIENT_PUBLIC_KEY`, a different devnet demo recipient. Otherwise the
server generates and persists a demo recipient address; it discards that key.
Released demo tokens sent there cannot be recovered. Refunds return to the payer.

Optional private `SOLANA_RPC_URL` GitHub secret can provide a dedicated devnet RPC.
The public endpoint is the fallback and is rate limited. The backend checks the
actual genesis hash before enabling transactions and refuses mainnet. Push a
stable commit after setting variables to trigger the normal verified deployment.

For a fresh deployment, the backend creates a devnet-only fee/deposit payer in
persistent SQLite. Its key never goes to the browser. The public payer address
appears in `/api/config` under `solana.payer`. Fund it with free devnet SOL; do
not fund it with real SOL:

```sh
solana transfer PUBLIC_RUNTIME_PAYER 0.05 --url devnet --keypair .solana-private/deployer.json --allow-unfunded-recipient
```

This payer is not the program upgrade authority and cannot bypass the guardian
before the deadline. SQLite remains sensitive: secure the volume and backups.
An optional `SOLANA_KEYPAIR_PATH` can load an externally mounted private payer
file instead; never bake a key into the Docker image. Defaults require no mount.

Do not change the configured guardian, depositor, or recipient while escrows are
pending: existing vaults bind those identities permanently. Do not destroy the
SQLite volume; it retains payment mappings and the runtime payer.

## Verify on the production site

1. Check `/api/health` and Settings for the Solana state. A configured executable
   program does not by itself prove the payer is funded; deposit confirmation does.
2. Log in as protected and create a synthetic $2,500 gift-card payment.
3. Wait for `SOLANA DEVNET · HELD`; follow the account/deposit explorer links.
4. Open the guardian view in Phantom's browser or an extension-enabled desktop
   browser. Choose Deny, connect the configured wallet, and sign the transaction.
5. Wait for confirmed refund and `HEIST FOILED`. Repeat with Approve on a new
   synthetic payment and check its release transaction and recipient balance.

The browser signs an exact transaction prepared by the server. Modified
destinations, unsigned requests, wrong wallets, and expired requests are rejected.
Use the intended guardian device for signing; automated tests must not impersonate
its wallet. Ordinary browsers without a wallet show actionable instructions.

Optional program-level devnet smoke verification uses a throwaway test guardian,
not your production guardian, and spends only free devnet funds:

```sh
SOLANA_PROGRAM_ID=PUBLIC_PROGRAM_ID npm run check:solana -- --smoke
```

The assignment syntax above is POSIX; on Windows set the variable in `.env` or use
PowerShell's `$env:SOLANA_PROGRAM_ID`. With no `--smoke`, the check is read-only.

Without program/guardian configuration, Web2 holds remain explicitly local.
Once a payment has a chain escrow, an outage never downgrades it to a bypassable
local hold. Funding/configuration outages may leave a deposit pending until fixed.
