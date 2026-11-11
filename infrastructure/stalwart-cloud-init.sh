#!/usr/bin/env bash
# ==============================================================================
# REVLET MAIL — STALWART MAIL SERVER CLOUD-INIT BOOTSTRAP (UBUNTU 24.04 LTS)
# Target Hostname: mx.revlet.me
# Engine: Stalwart Mail Server (JMAP + SMTP + RocksDB + Cloudflare R2 + AWS SES)
# ==============================================================================
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

# 1. Set system hostname to mx.revlet.me for SMTP EHLO banner alignment
hostnamectl set-hostname mx.revlet.me
if ! grep -q "mx.revlet.me" /etc/hosts; then
  echo "127.0.1.1 mx.revlet.me mx" >> /etc/hosts
fi

# 2. Install system dependencies & Docker Engine
apt-get update -y
apt-get install -y ca-certificates curl gnupg jq ufw fail2ban

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

# 3. Prepare Stalwart directories on local NVMe SSD
mkdir -p /opt/stalwart/etc /opt/stalwart/data/index /opt/stalwart/logs

# 4. Write Stalwart configuration template
cat <<'EOF' > /opt/stalwart/etc/config.toml
[server]
hostname = "mx.revlet.me"

[server.listener."smtp"]
bind = ["[::]:25"]
protocol = "smtp"

[server.listener."submission"]
bind = ["[::]:587"]
protocol = "smtp"

[server.listener."submissions"]
bind = ["[::]:465"]
protocol = "smtp"
tls.implicit = true

[server.listener."http"]
bind = ["[::]:8080"]
protocol = "http"

[store."rocksdb"]
type = "rocksdb"
path = "/opt/stalwart/data/index"
compression = "lz4"

[storage]
data = "rocksdb"
fts = "rocksdb"
blob = "rocksdb"
lookup = "rocksdb"
directory = "internal"

[session.rcpt]
subaddressing = true
catch-all = true

[certificate."default"]
acme = "letsencrypt"
domains = ["mx.revlet.me"]
default = true

[acme."letsencrypt"]
directory = "https://acme-v02.api.letsencrypt.org/directory"
contact = ["postmaster@revlet.me"]
challenge = "http-01"
EOF

# 5. Create Docker Compose stack for Stalwart Mail Server
cat <<'EOF' > /opt/stalwart/docker-compose.yml
services:
  stalwart-mail:
    image: stalwartlabs/mail-server:latest
    container_name: revlet-stalwart-mail
    hostname: mx.revlet.me
    restart: unless-stopped
    ports:
      - "25:25"
      - "465:465"
      - "587:587"
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - /opt/stalwart/data:/opt/stalwart-mail
    environment:
      - TZ=UTC
EOF

cd /opt/stalwart
docker compose up -d

# 6. Configure UFW host firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 25/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 465/tcp
ufw allow 587/tcp
ufw allow 8080/tcp
ufw --force enable
