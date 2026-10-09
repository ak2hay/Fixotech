#!/usr/bin/env bash
# Encrypted Postgres + storage backup. Schedule with cron, e.g.
#   15 2 * * * cd /opt/fixotec && bash deploy/backup.sh >> /var/log/fixotec-backup.log 2>&1
# Requires BACKUP_PASSPHRASE in .env. Copy /opt/fixotec/backups off the VM (rclone/S3) for real disaster recovery.
# Restore: gpg -d db-<ts>.sql.gz.gpg | gunzip | docker exec -i fixotec-postgres psql -U fixotec -d fixotec
set -euo pipefail
cd /opt/fixotec
set -a; . ./.env; set +a
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE in .env}"

DIR="${BACKUP_DIR:-/opt/fixotec/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DIR"
chmod 700 "$DIR"

docker exec fixotec-postgres pg_dump -U fixotec -d fixotec --no-owner \
  | gzip \
  | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$DIR/db-$TS.sql.gz.gpg"

docker run --rm -v fixotec_fixotec_storage:/data:ro alpine tar -cz -C /data . \
  | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$DIR/storage-$TS.tgz.gpg"

find "$DIR" -type f -name '*.gpg' -mtime "+$KEEP_DAYS" -delete
echo "Backup $TS written to $DIR"
