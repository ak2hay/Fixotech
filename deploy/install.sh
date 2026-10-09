#!/usr/bin/env bash
# Unpacks the uploaded source into /opt/fixotec and creates .env with fresh secrets on first install.
set -euo pipefail
cd /opt/fixotec
tar -xzf fixotec.tgz
rm fixotec.tgz
if [ ! -f .env ]; then
  cp deploy/vm.env.example .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 48)|" .env
  sed -i "s|^MFA_ENCRYPTION_KEY=.*|MFA_ENCRYPTION_KEY=$(openssl rand -hex 48)|" .env
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^BACKUP_PASSPHRASE=.*|BACKUP_PASSPHRASE=$(openssl rand -hex 32)|" .env
  sed -i "s|^PROXY_SHARED_SECRET=.*|PROXY_SHARED_SECRET=$(openssl rand -hex 48)|" .env
  chmod 600 .env
  echo "Generated secrets in .env. Copy BACKUP_PASSPHRASE somewhere off this VM now."
fi
grep -c replace-with .env || true
ls
