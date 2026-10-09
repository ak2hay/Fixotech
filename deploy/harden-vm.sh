#!/usr/bin/env bash
# One-time VM hardening. Run as root AFTER confirming the deploy user can log in with its SSH key,
# otherwise you will lock yourself out:
#   DEPLOY_USER=deploy DEPLOY_PUBKEY="ssh-ed25519 AAAA... fixotec-deploy" bash deploy/harden-vm.sh
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
: "${DEPLOY_PUBKEY:?Set DEPLOY_PUBKEY to the public key that will be used for SSH}"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban unattended-upgrades

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker,sudo "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
grep -qxF "$DEPLOY_PUBKEY" "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null || echo "$DEPLOY_PUBKEY" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown -R "$DEPLOY_USER:$DEPLOY_USER" /opt/fixotec

cat > /etc/ssh/sshd_config.d/10-fixotec-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
EOF
sshd -t
systemctl reload ssh

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban

dpkg-reconfigure -f noninteractive unattended-upgrades

echo "Hardening applied. Verify 'ssh $DEPLOY_USER@<host>' works in a NEW terminal before closing this session."
