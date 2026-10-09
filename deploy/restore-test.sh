#!/usr/bin/env bash
# Proves the latest encrypted backup can actually be restored: decrypts it into a throwaway Postgres
# container, checks core tables have rows and the migration history is intact, then removes the container.
# Schedule weekly after backup.sh, e.g.
#   45 3 * * 0 cd /opt/fixotec && bash deploy/restore-test.sh >> /var/log/fixotec-restore-test.log 2>&1
set -euo pipefail
cd /opt/fixotec
set -a; . ./.env; set +a
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE in .env}"

DIR="${BACKUP_DIR:-/opt/fixotec/backups}"
LATEST="$(ls -1t "$DIR"/db-*.sql.gz.gpg 2>/dev/null | head -n 1 || true)"
[ -n "$LATEST" ] || { echo "No database backup found in $DIR" >&2; exit 1; }

NAME="fixotec-restore-test-$$"
PASS="$(openssl rand -hex 16)"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_USER=fixotec -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_DB=fixotec postgres:16-alpine >/dev/null
for i in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U fixotec -d fixotec >/dev/null 2>&1 && break
  sleep 2
done

gpg --batch --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d "$LATEST" \
  | gunzip \
  | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U fixotec -d fixotec >/dev/null

q() { docker exec "$NAME" psql -tA -U fixotec -d fixotec -c "$1"; }
USERS="$(q 'SELECT count(*) FROM "User"')"
MIGRATIONS="$(q 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')"
[ "$USERS" -gt 0 ] || { echo "Restore check failed: no users in $LATEST" >&2; exit 1; }
[ "$MIGRATIONS" -gt 0 ] || { echo "Restore check failed: no applied migrations in $LATEST" >&2; exit 1; }
echo "Restore test passed for $(basename "$LATEST"): users=$USERS migrations=$MIGRATIONS"
