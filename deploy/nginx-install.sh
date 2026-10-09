#!/usr/bin/env bash
# Adds only the Fixotec nginx site and certificate; other sites are left as they are.
set -euo pipefail
# Set API_DOMAIN to the production hostname (e.g. api.fixotec.com); sslip.io is only a bootstrap fallback.
TEMPLATE_DOMAIN=fixotec-api.95-135-254-46.sslip.io
DOMAIN="${API_DOMAIN:-$TEMPLATE_DOMAIN}"
SITE=/etc/nginx/sites-available/fixotec-api.conf
LINK=/etc/nginx/sites-enabled/fixotec-api.conf

if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  # The full site references the certificate, so serve the ACME challenge over plain HTTP first.
  mkdir -p /var/www/html
  cat > "$SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 404; }
}
EOF
  ln -sf "$SITE" "$LINK"
  nginx -t && systemctl reload nginx
  if [ -n "${CERTBOT_EMAIL:-}" ]; then ACCOUNT=(--email "$CERTBOT_EMAIL"); else ACCOUNT=(--register-unsafely-without-email); fi
  certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive --agree-tos "${ACCOUNT[@]}"
fi

sed "s/${TEMPLATE_DOMAIN//./\\.}/$DOMAIN/g" /opt/fixotec/deploy/nginx-fixotec-api.conf > "$SITE"
ln -sf "$SITE" "$LINK"
if ! nginx -t; then
  rm -f "$LINK"
  echo "nginx test failed; Fixotec site removed"
  exit 1
fi
systemctl reload nginx
curl -fsS "https://$DOMAIN/api/v1/health"
echo
