#!/usr/bin/env bash
# ==============================================================================
# Revlet Mail — Hostinger KVM 4 Node Bootstrap Script (Ubuntu 24.04 LTS)
# Specs: 4 vCPU / 16 GB RAM / 200 GB NVMe / 16 TB Bandwidth
# Built for 1,000 Organizations today, ready to scale to 10,000+ Organizations.
# ==============================================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash bootstrap-kvm4.sh"
  exit 1
fi

echo "==> [1/7] Updating Ubuntu packages & installing dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  ca-certificates curl gnupg ufw fail2ban wireguard-tools \
  rsync openssl jq lz4 b3sum cron

echo "==> [2/7] Applying Linux kernel sysctl tuning for 50,000+ concurrent sockets..."
cat > /etc/sysctl.d/99-revlet-mail.conf <<'EOF'
fs.file-max = 1048576
net.core.somaxconn = 32768
net.ipv4.tcp_max_syn_backlog = 16384
net.ipv4.ip_local_port_range = 10240 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
vm.swappiness = 10
vm.overcommit_memory = 1
EOF
sysctl --system >/dev/null

echo "==> [3/7] Installing Docker Engine & Compose plugin..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> [4/7] Creating /opt/stalwart directories with uid:gid 2000:2000..."
mkdir -p /opt/stalwart/{etc,data,pgdata,valkeydata,logs,caddy_data,caddy_config}
mkdir -p /var/backups/revlet-stalwart
chown -R 2000:2000 /opt/stalwart/etc /opt/stalwart/data
touch /opt/stalwart/logs/access.log

echo "==> [5/7] Configuring UFW firewall (SSH, SMTP 25/465/587, HTTP/HTTPS 80/443, WireGuard 51820)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 25/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 465/tcp
ufw allow 587/tcp
ufw allow 51820/udp
ufw --force enable

echo "==> [6/7] Configuring Fail2Ban (sshd + caddy-auth JMAP/API brute-force protection)..."
cat > /etc/fail2ban/filter.d/caddy-stalwart-auth.conf <<'EOF'
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"status":(401|403).*$
ignoreregex =
EOF

cat > /etc/fail2ban/jail.d/revlet-mail.conf <<'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 5
findtime = 10m
bantime = 1h

[caddy-auth]
enabled = true
backend = auto
port = http,https
filter = caddy-stalwart-auth
logpath = /opt/stalwart/logs/access.log
maxretry = 12
findtime = 5m
bantime = 30m
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> [7/7] Installing nightly 03:00 UTC encrypted PostgreSQL + RocksDB + Config backup to Cloudflare R2..."
cat > /usr/local/bin/revlet-backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

set -a
source /etc/revlet-backup.env
set +a

BACKUP_DIR="/var/backups/revlet-stalwart"
TS="$(date -u +%Y%m%d-%H%M%S)"
ARCHIVE="${BACKUP_DIR}/stalwart-${TS}.tar.gz.enc"
STAGE_DIR="$(mktemp -d)"

mkdir -p "${BACKUP_DIR}"

# 1. If PostgreSQL container is running, include a consistent pg_dumpall / pg_dump
if docker ps --format '{{.Names}}' | grep -q '^stalwart-postgres$'; then
  docker exec stalwart-postgres pg_dump -U stalwart -Fc stalwart > "${STAGE_DIR}/stalwart.pgdump"
fi

# 2. Copy Stalwart config & local RocksDB directory
cp -a /opt/stalwart/etc "${STAGE_DIR}/etc"
if [ -d /opt/stalwart/data ]; then
  cp -a /opt/stalwart/data "${STAGE_DIR}/data"
fi

# 3. Compress & AES-256-CBC encrypt
tar -C "${STAGE_DIR}" -czf - . \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_SECRET -out "${ARCHIVE}"

rm -rf "${STAGE_DIR}"

# 4. Upload encrypted snapshot to Cloudflare R2 (revlet-mail-backups)
HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "X-Backup-Name: stalwart-${TS}.tar.gz.enc" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@${ARCHIVE}" \
  "${WORKER_BACKUP_URL}")"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "[$(date -u)] ERROR: R2 backup upload returned HTTP ${HTTP_CODE}" >&2
  exit 1
fi

find "${BACKUP_DIR}" -name 'stalwart-*.tar.gz.enc' -mtime +7 -delete
echo "[$(date -u)] Backup ${ARCHIVE} uploaded to R2 (HTTP ${HTTP_CODE})"
EOF
chmod 755 /usr/local/bin/revlet-backup.sh

cat > /etc/cron.d/revlet-stalwart-backup <<'EOF'
0 3 * * * root /usr/local/bin/revlet-backup.sh >> /var/log/revlet-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/revlet-stalwart-backup

echo "✅ Hostinger KVM 4 node bootstrapped successfully!"
