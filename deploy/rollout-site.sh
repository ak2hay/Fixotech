#!/usr/bin/env bash
# Builds the new API image, applies pending Prisma migrations and swaps the running API container.
# The in.fixotec.global importer only runs when RUN_IMPORT=1 is set and import.tgz is present.
# One-time step on a database that was created with `db push`: BASELINE=1 marks 0_init as applied.
set -euo pipefail
cd /opt/fixotec
C="docker compose -f docker-compose.prod.yml"
M="$C --profile tools run --rm --no-deps -T migrate"

$C build api
$C --profile tools build migrate

if [ "${BACKUP:-1}" = "1" ]; then
  bash deploy/backup.sh
fi

if [ "${BASELINE:-0}" = "1" ]; then
  $M pnpm exec prisma migrate resolve --applied 0_init < /dev/null
fi

$M pnpm exec prisma migrate deploy < /dev/null

if [ "${RUN_IMPORT:-0}" = "1" ] && [ -f import.tgz ]; then
  gunzip -c import.tgz | $M sh -c 'mkdir -p /app/storage/import && tar -x -C /app/storage/import'
  rm -f import.tgz
  $M pnpm exec tsx prisma/import-fixotec.ts < /dev/null
fi

$C up -d --no-deps api < /dev/null

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4200/api/v1/health/ready >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:4200/api/v1/health/ready
echo
docker ps --format '{{.Names}} {{.Status}}' | grep fixotec
