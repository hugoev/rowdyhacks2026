# Deploy Tripwire on Vultr

Vultr runs the Node/Next.js server, Socket.IO hub, and SQLite holds. Caddy provides
HTTPS so family phones can use the microphone. Only Caddy publishes ports; the
app and its database remain on Docker's private network. One VM runs one household.

## Current demo and updates

The demo runs at https://tripwire.64.177.46.134.sslip.io on Vultr. HTTPS, all three
role logins, secure cookies, and WebSocket state delivery can be checked with
`npm run check:vultr:e2e`. Gemini and ElevenLabs require their server-side keys;
the ElevenLabs caller additionally requires `ELEVENLABS_AGENT_ID`. Role
access codes are in the local private `.env.vultr` file.

Every push to `main` runs GitHub Actions validation across Linux, Windows, and
macOS, plus browser tests on Linux. If all checks pass, Actions runs deployment
automatically. Pull requests run checks only. Main releases are serialized so
another push cannot interrupt an active deployment. Failed checks leave the
current live release running.

Repository Actions Secrets contain `VULTR_SSH_KEY` (a dedicated deployment key),
`VULTR_KNOWN_HOSTS` (the verified server identity), and `VULTR_ENV` (the complete
private deployment configuration). To change the domain, API keys, or role codes,
update `.env.vultr` locally and synchronize it without printing credentials:

```sh
gh secret set VULTR_ENV --repo hugoev/rowdyhacks2026 < .env.vultr
```

The next push deploys the new configuration. For a manual release, ensure your
local `main` contains the desired commit, then run:

```sh
npm run deploy:vultr -- root@64.177.46.134
```

The script deploys local committed HEAD, builds on Vultr, replaces containers,
preserves named volumes, and checks HTTPS health. It does not pull GitHub changes
automatically when invoked manually; manual deployment bypasses CI checks.

Deployments retain the active image and last successful release, remove obsolete
Tripwire images, and bound Docker build cache before building. A disk-space check
requires 5 GiB free before replacing containers. Cleanup never removes volumes.

## Create the instance

Use Cloud Compute, Ubuntu 24.04 LTS, a nearby region, and approximately two vCPUs
with 4 GB RAM for on-server Next.js builds. Add your SSH public key and name the
instance `tripwire`. The Docker Marketplace image is another option if offered.
Sponsor credits cover eligible usage according to your account; review the price
shown before creating the instance. No Vultr API key is needed for SSH deployment.

Point the domain's DNS A record at the server's IPv4 address. Add an AAAA record
only if IPv6 is configured correctly. Allow inbound TCP 80 and 443, optional UDP
443 for HTTP/3, and SSH 22 from the team's IPs in Vultr's firewall and the VM
firewall. Do not expose port 3000. HTTP 80 must remain reachable for certificate
issuance and redirects. Check for existing web servers using those ports.

On a fresh Ubuntu VM, install Docker Engine and the Compose plugin using
[Docker's Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/).
The SSH deployment user needs Docker access. Reconnect after adding that user
to the Docker group. Verify `docker info` and `docker compose version` on the VM.
Vultr documents its [Docker Marketplace setup](https://docs.vultr.com/how-to-use-vultrs-docker-marketplace-application).

## Configure secrets locally

From the repository root:

```sh
npm run setup:vultr
```

This creates private, gitignored `.env.vultr`, generates three different role
access codes, and copies any saved local Gemini/ElevenLabs keys. Existing files
are never overwritten. Set `TRIPWIRE_DOMAIN` and `ACME_EMAIL` in that file; confirm
provider keys and model choices. Leave `GEMINI_API_KEY` empty until you want live
Gemini requests. Creating/deploying the file does not call either provider.

```sh
npm run check:vultr
npm run deploy:vultr -- ubuntu@SERVER_IP
```

Use the actual SSH username shown by Vultr; some images use `root` or `docker`.
SSH must work with your key, including initial host-key verification. The script
uploads a committed Git archive and secrets over SSH, builds on the VM, waits for
the app health check, and checks the public HTTPS endpoint. Uncommitted changes
are excluded. Access codes and keys are never printed. Do not paste `.env.vultr`
into chat or commit it. Send each role its own access code privately.

## Verify and operate

Visit `https://YOUR_DOMAIN/api/health`: expect `ok: true`, `mode: paired`,
`hosting: vultr`, and the deployed commit's release ID. Log in on `/protected`,
`/guardian`, and `/relative` with their respective codes. Rehearse a scripted
call, family check, held payment, and denial across phones. The automated
`npm run check:vultr:e2e` starts a synthetic rules call, creates a mock payment,
blocks it through Diego's browser, and verifies Tiger persistence and mobile
views. It requires no existing active call and leaves the resulting case for
audit. This does not verify live microphone audio or the ElevenLabs caller.

The server stores deployments at `~/tripwire/releases/COMMIT`. From that release:

```sh
docker compose --env-file .env.vultr -f deploy/vultr/compose.yaml ps
docker compose --env-file .env.vultr -f deploy/vultr/compose.yaml logs --tail=100
```

Named volumes preserve SQLite data and Caddy certificates across releases. Never
use `down -v` unless you intend to delete them. Back up the SQLite database with
SQLite's online backup API before risky changes; copying only a live `.sqlite`
file can miss WAL transactions.

To roll back, enter an earlier release directory, copy the current private
`~/tripwire/.env.vultr` into it, and run the following with that release's commit:

```sh
TRIPWIRE_RELEASE=PREVIOUS_COMMIT docker compose --env-file .env.vultr -f deploy/vultr/compose.yaml up -d --no-build --wait
```

This reuses the earlier image and existing volumes. After schema changes, confirm
backward compatibility before rollback. Certificate setup requires DNS propagation
and reachable ports; a failed HTTPS check reports deployment failure instead of
claiming the app is live. Neither this guide nor committed infrastructure files
mean a Vultr instance has already been provisioned or deployed.
