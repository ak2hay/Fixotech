#!/usr/bin/env bash
# Restricted command for the GitHub Actions deploy key.
# SSH_ORIGINAL_COMMAND must be a 40-character commit SHA.
# stdin must be a git archive (tar.gz) of that commit.
set -euo pipefail

log() { echo "[fixotec-deploy $(TZ=Asia/Calcutta date '+%Y-%m-%d %H:%M:%S IST')] $*"; }

raw="${SSH_ORIGINAL_COMMAND:-${1:-}}"
raw="${raw#deploy }"
sha="$(printf '%s' "$raw" | tr -d '[:space:]')"
if [[ ! "$sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  log "rejected: command is not a 40-character commit SHA"
  exit 1
fi
sha="$(printf '%s' "$sha" | tr 'A-F' 'a-f')"

ROOT=/opt/fixotec
COMPOSE=(docker compose -p fixotec -f "$ROOT/docker-compose.prod.yml")
HEALTH_URL=https://api.rkyves.com/api/v1/health/ready
LOCAL_HEALTH=http://127.0.0.1:4300/api/v1/health/ready

if [ -t 0 ]; then
  log "rejected: no git archive on stdin"
  exit 1
fi

stage="$(mktemp -d /tmp/fixotec-src.XXXXXX)"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT

tar -xzf - -C "$stage"
if [ ! -f "$stage/apps/api/Dockerfile" ] || [ ! -f "$stage/docker-compose.prod.yml" ]; then
  log "rejected: archive is missing the API build files"
  exit 1
fi

log "syncing $sha into $ROOT"
rsync -a --delete \
  --exclude '.env' \
  --exclude '.env.bak-*' \
  --exclude 'backups/' \
  --exclude 'fixotec.tgz' \
  --exclude 'DEPLOYED_COMMIT' \
  --exclude 'build.log' \
  --exclude '.git/' \
  "$stage"/ "$ROOT/"

cd "$ROOT"

if docker image inspect fixotec-api:current >/dev/null 2>&1; then
  docker tag fixotec-api:current fixotec-api:previous
  log "tagged fixotec-api:previous"
fi
if docker image inspect fixotec-api:migrate >/dev/null 2>&1; then
  docker tag fixotec-api:migrate fixotec-api:migrate-previous || true
fi

log "building api and migrate images"
"${COMPOSE[@]}" build api
"${COMPOSE[@]}" --profile tools build migrate

log "running prisma migrate deploy"
"${COMPOSE[@]}" --profile tools run --rm --no-deps -T migrate

health() {
  curl -fsS --max-time 10 "$1" >/dev/null 2>&1
}

wait_health() {
  local url="$1" i
  for i in $(seq 1 30); do
    if health "$url"; then return 0; fi
    sleep 2
  done
  return 1
}

rollback() {
  log "rolling back API image to fixotec-api:previous"
  if ! docker image inspect fixotec-api:previous >/dev/null 2>&1; then
    log "no previous image to roll back to"
    return 1
  fi
  docker tag fixotec-api:previous fixotec-api:current
  "${COMPOSE[@]}" up -d --no-deps api </dev/null
  if wait_health "$LOCAL_HEALTH" && wait_health "$HEALTH_URL"; then
    log "rollback healthy"
    return 0
  fi
  log "rollback health check failed"
  return 1
}

log "restarting fixotec-api only"
"${COMPOSE[@]}" up -d --no-deps api </dev/null

if wait_health "$LOCAL_HEALTH" && wait_health "$HEALTH_URL"; then
  printf '%s\n' "$sha" > "$ROOT/DEPLOYED_COMMIT"
  log "deploy $sha ok; health ready"
  docker ps --format '{{.Names}} {{.Status}}' | grep '^fixotec-' || true
  exit 0
fi

log "new API failed health checks; rolling back"
if rollback; then
  log "deploy $sha failed; previous image restored"
  exit 1
fi
log "deploy $sha failed; rollback also failed"
exit 1
