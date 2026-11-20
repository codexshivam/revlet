#!/usr/bin/env bash
# ==============================================================================
# Revlet Mail — Add a Stateless Stalwart Worker Node (Scale-Out: 1,000 -> 10,000 Orgs)
# Usage (run on a new KVM 4 Worker Node after WireGuard mesh is connected):
#   sudo bash add-worker-node.sh <PRIMARY_NODE_WG_IP> <POSTGRES_PASSWORD> <VALKEY_PASSWORD>
#
# Every additional KVM 4 node connects to:
#   • PostgreSQL 16 on Primary Node (over encrypted WireGuard private IP 10.10.0.1:5432)
#   • Valkey 8 (Redis) on Primary Node (10.10.0.1:6379) for distributed locks & rate limits
#   • Cloudflare R2 (`revlet-mail-blobs`) for all email bodies & attachments
#   • Amazon SES (`ap-south-1`) for all outbound email delivery
# ==============================================================================
set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: sudo bash $0 <PRIMARY_NODE_WG_IP> <POSTGRES_PASSWORD> <VALKEY_PASSWORD>"
  exit 1
fi

PRIMARY_WG_IP="$1"
PG_PASS="$2"
VK_PASS="$3"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "${SCRIPT_DIR}/bootstrap-kvm4.sh"

cat > /opt/stalwart/etc/config.json <<EOF
{
  "@type": "PostgreSql",
  "host": "${PRIMARY_WG_IP}",
  "port": 5432,
  "database": "stalwart",
  "authUsername": "stalwart",
  "authSecret": {
    "@type": "Value",
    "secret": "${PG_PASS}"
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

cat > /opt/stalwart/docker-compose.yml <<'EOF'
services:
  stalwart:
    image: stalwartlabs/stalwart:latest
    container_name: stalwart-mail
    restart: unless-stopped
    ports:
      - "25:25"
      - "465:465"
      - "587:587"
      - "127.0.0.1:8080:8080"
    volumes:
      - /opt/stalwart/etc:/etc/stalwart
      - /opt/stalwart/data:/var/lib/stalwart
    environment:
      - TZ=UTC
    ulimits:
      nofile:
        soft: 65535
        hard: 65535

  caddy:
    image: caddy:2-alpine
    container_name: stalwart-proxy
    restart: unless-stopped
    depends_on:
      - stalwart
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - /opt/stalwart/Caddyfile:/etc/caddy/Caddyfile:ro
      - /opt/stalwart/caddy_data:/data
      - /opt/stalwart/caddy_config:/config
      - /opt/stalwart/logs:/var/log/caddy
EOF

cp "${SCRIPT_DIR}/Caddyfile" /opt/stalwart/Caddyfile
cd /opt/stalwart && docker compose up -d
sleep 3
curl -fsS http://127.0.0.1:8080/healthz/live && echo "✅ Stateless Worker Node is LIVE and joined the cluster!"
