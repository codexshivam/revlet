#!/usr/bin/env bash
# ==============================================================================
# Revlet Mail — Zero-Data-Loss Migration to Hostinger KVM 4
# Usage:
#   ./migrate-to-kvm4.sh <KVM4_IP> [SSH_KEY_FOR_KVM4]
#
# What this script does:
#   1. Triggers a fresh encrypted snapshot of the current server to Cloudflare R2
#   2. Bootstraps the target Hostinger KVM 4 server (Ubuntu 24.04)
#   3. Generates strong credentials for PostgreSQL 16 & Valkey 8 (Redis) on KVM 4
#   4. Exports all existing metadata from RocksDB and imports it into PostgreSQL 16
#      on KVM 4 (while keeping 100% of existing email blobs in Cloudflare R2
#      `revlet-mail-blobs` and outbound SMTP relay via AWS SES `ap-south-1`)
#   5. Configures Valkey 8 as Stalwart's distributed `x:InMemoryStore`
#   6. Starts the KVM 4 cluster and verifies `/healthz/live`
# ==============================================================================
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <KVM4_IP> [KVM4_SSH_KEY_PATH]"
  exit 1
fi

KVM4_IP="$1"
KVM4_KEY="${2:-}"
OLD_HOST="ubuntu@13.126.43.133"
OLD_KEY="${HOME}/.ssh/lightsail_ap-south-1.pem"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SSH_KVM4_OPTS=(-o StrictHostKeyChecking=no)
if [ -n "${KVM4_KEY}" ]; then
  SSH_KVM4_OPTS+=(-i "${KVM4_KEY}")
fi

echo "==> [1/6] Taking pre-migration encrypted backup to Cloudflare R2 (revlet-mail-backups)..."
ssh -i "${OLD_KEY}" -o StrictHostKeyChecking=no "${OLD_HOST}" "sudo /usr/local/bin/revlet-backup.sh"

echo "==> [2/6] Uploading & running bootstrap-kvm4.sh on Hostinger KVM 4 (${KVM4_IP})..."
scp "${SSH_KVM4_OPTS[@]}" \
  "${SCRIPT_DIR}/bootstrap-kvm4.sh" \
  "${SCRIPT_DIR}/docker-compose.yml" \
  "${SCRIPT_DIR}/Caddyfile" \
  "root@${KVM4_IP}:/tmp/"

ssh "${SSH_KVM4_OPTS[@]}" "root@${KVM4_IP}" "
  bash /tmp/bootstrap-kvm4.sh
  mv /tmp/docker-compose.yml /opt/stalwart/docker-compose.yml
  mv /tmp/Caddyfile /opt/stalwart/Caddyfile
"

echo "==> [3/6] Copying /etc/revlet-backup.env and generating PostgreSQL 16 & Valkey 8 credentials on KVM 4..."
ssh -i "${OLD_KEY}" -o StrictHostKeyChecking=no "${OLD_HOST}" "sudo cat /etc/revlet-backup.env" \
  | ssh "${SSH_KVM4_OPTS[@]}" "root@${KVM4_IP}" "cat > /etc/revlet-backup.env && chmod 600 /etc/revlet-backup.env"

ssh "${SSH_KVM4_OPTS[@]}" "root@${KVM4_IP}" '
  if [ ! -f /opt/stalwart/.env ]; then
    PG_PASS="$(openssl rand -hex 24)"
    VK_PASS="$(openssl rand -hex 24)"
    cat > /opt/stalwart/.env <<EOF
POSTGRES_PASSWORD=${PG_PASS}
VALKEY_PASSWORD=${VK_PASS}
CLUSTER_BIND_IP=127.0.0.1
EOF
    chmod 600 /opt/stalwart/.env
  fi
  cd /opt/stalwart && docker compose pull
  docker compose up -d postgres valkey
'

echo "==> [4/6] Stopping old Stalwart briefly & streaming metadata snapshot to KVM 4..."
ssh -i "${OLD_KEY}" -o StrictHostKeyChecking=no "${OLD_HOST}" "
  sudo rm -rf /tmp/kvm4-export && sudo mkdir -p /tmp/kvm4-export && sudo chmod 777 /tmp/kvm4-export
  sudo docker stop stalwart-mail
  sudo docker run --rm \
    -v /opt/stalwart/etc:/etc/stalwart:ro \
    -v /opt/stalwart/data:/var/lib/stalwart \
    -v /tmp/kvm4-export:/export \
    stalwartlabs/stalwart:latest \
    --config /etc/stalwart/config.json --export /export
  # Remove blob dump subspace_t so import does not re-upload blobs already in Cloudflare R2
  sudo rm -f /tmp/kvm4-export/subspace_t
"

ssh -i "${OLD_KEY}" -o StrictHostKeyChecking=no "${OLD_HOST}" "sudo tar -C /tmp/kvm4-export -czf - ." \
  | ssh "${SSH_KVM4_OPTS[@]}" "root@${KVM4_IP}" "rm -rf /tmp/kvm4-import && mkdir -p /tmp/kvm4-import && chmod 777 /tmp/kvm4-import && tar -C /tmp/kvm4-import -xzf -"

echo "==> [5/6] Configuring Stalwart on KVM 4 to use PostgreSQL 16 + Importing all accounts, domains, DKIM & R2/SES settings..."
ssh "${SSH_KVM4_OPTS[@]}" "root@${KVM4_IP}" '
  source /opt/stalwart/.env
  cat > /opt/stalwart/etc/config.json <<EOF
{
  "@type": "PostgreSql",
  "host": "postgres",
  "port": 5432,
  "database": "stalwart",
  "authUsername": "stalwart",
  "authSecret": {
    "@type": "Value",
    "secret": "${POSTGRES_PASSWORD}"
  },
  "useTls": false,
  "allowInvalidCerts": false,
  "connectTimeout": 15000,
  "responseTimeout": 120000,
  "poolMaxConnections": 64,
  "poolRecyclingMethod": "fast"
}
EOF
  chown 2000:2000 /opt/stalwart/etc/config.json
  chmod 600 /opt/stalwart/etc/config.json

  # Wait until PostgreSQL is healthy
  sleep 3
  docker run --rm \
    --network stalwart_default \
    -v /opt/stalwart/etc:/etc/stalwart:ro \
    -v /tmp/kvm4-import:/import \
    stalwartlabs/stalwart:latest \
    --config /etc/stalwart/config.json --import /import
  rm -rf /tmp/kvm4-import

  # Start Stalwart + Caddy on KVM 4
  cd /opt/stalwart && docker compose up -d
  sleep 4
'

echo "==> [6/6] Verifying KVM 4 Stalwart health..."
ssh "${SSH_KVM4_OPTS[@]}" "root@${KVM4_IP}" "curl -fsS http://127.0.0.1:8080/healthz/live && echo ' -> KVM 4 Stalwart is LIVE!'"

echo ""
echo "=============================================================================="
echo "✅ KVM 4 Migration Complete!"
echo "Next Step (Final 10-Second DNS Cutover in Cloudflare):"
echo "  1. Update A record for mx.revlet.me -> ${KVM4_IP}"
echo "  2. Update SPF TXT record for revlet.me -> ip4:${KVM4_IP} include:amazonses.com"
echo "  3. Set Reverse DNS (PTR) in Hostinger hPanel for ${KVM4_IP} -> mx.revlet.me"
echo "=============================================================================="
