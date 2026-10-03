#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 || ! "$1" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]; then
  printf 'Usage: npm run deploy:vultr -- user@server-ip\n' >&2
  exit 1
fi
cd "$(dirname "$0")/.."
node --import tsx scripts/check-vultr.ts
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  printf 'Deploying committed HEAD only; local changes are not included.\n' >&2
fi
release="$(git rev-parse --short=12 HEAD)"
domain="$(node --import tsx scripts/check-vultr.ts --domain)"
archive="$(mktemp /tmp/tripwire-release.XXXXXX.tar)"
trap 'rm -f "$archive"' EXIT
git archive --format=tar HEAD > "$archive"
target="$1"
ssh "$target" 'command -v docker >/dev/null && docker compose version >/dev/null && mkdir -p "$HOME/tripwire/releases" && chmod 700 "$HOME/tripwire"'
scp "$archive" "$target:tripwire/releases/$release.tar"
scp .env.vultr "$target:tripwire/.env.vultr"
ssh "$target" bash -s -- "$release" <<'REMOTE'
set -euo pipefail
release="$1"
cd "$HOME/tripwire"
chmod 600 .env.vultr
mkdir -p "releases/$release"
tar -xf "releases/$release.tar" -C "releases/$release"
cd "releases/$release"
cp "$HOME/tripwire/.env.vultr" .env.vultr
chmod 600 .env.vultr
export TRIPWIRE_RELEASE="$release"
docker compose --env-file .env.vultr -f deploy/vultr/compose.yaml config --quiet
docker compose --env-file .env.vultr -f deploy/vultr/compose.yaml up --build -d --wait --wait-timeout 120
printf '%s\n' "$release" > "$HOME/tripwire/current-release"
printf 'Running release %s\n' "$release"
REMOTE
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors --max-time 10 "https://$domain/api/health"
printf '\nDeployed https://%s from commit %s\n' "$domain" "$release"
