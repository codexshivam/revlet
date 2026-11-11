#!/usr/bin/env bash
# ==============================================================================
# REVLET MAIL — AWS LIGHTSAIL + AWS SES v2 PROVISIONING SCRIPT
# Region: ap-southeast-2 (Sydney)
# Provisions:
#   1. AWS Lightsail Ubuntu 24.04 LTS Instance (revlet-mail-stalwart)
#   2. Dedicated Static IPv4 (revlet-mail-static-ip) attached to instance
#   3. Lightsail Firewall Rules (22, 25, 80, 443, 465, 587, 8080)
#   4. AWS SES v2 Configuration Set & Easy DKIM Identity (revlet.me)
# ==============================================================================
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
AVAILABILITY_ZONE="${AVAILABILITY_ZONE:-ap-southeast-2a}"
INSTANCE_NAME="${INSTANCE_NAME:-revlet-mail-stalwart}"
STATIC_IP_NAME="${STATIC_IP_NAME:-revlet-mail-static-ip}"
BUNDLE_ID="${BUNDLE_ID:-medium_3_2}"       # 2 vCPU, 4 GB RAM, 80 GB SSD ($24/mo)
BLUEPRINT_ID="${BLUEPRINT_ID:-ubuntu_24_04}"
SES_CONFIG_SET="${SES_CONFIG_SET:-revlet-ses-cfg-default}"
PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-revlet.me}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_DATA_FILE="${SCRIPT_DIR}/stalwart-cloud-init.sh"

echo "=================================================================="
echo " Revlet Mail — AWS Infrastructure Provisioner (${AWS_REGION})"
echo "=================================================================="

# 1. Verify AWS CLI authentication
echo "[1/5] Verifying AWS IAM credentials..."
CALLER_IDENTITY=$(aws sts get-caller-identity --region "${AWS_REGION}" --output json)
ACCOUNT_ID=$(echo "${CALLER_IDENTITY}" | grep -o '"Account": *"[^"]*"' | cut -d'"' -f4)
ARN=$(echo "${CALLER_IDENTITY}" | grep -o '"Arn": *"[^"]*"' | cut -d'"' -f4)
echo "  -> Authenticated as Account: ${ACCOUNT_ID} (${ARN})"

# 2. Provision AWS Lightsail Instance (Idempotent)
echo "[2/5] Checking AWS Lightsail instance '${INSTANCE_NAME}' in ${AVAILABILITY_ZONE}..."
if aws lightsail get-instance --region "${AWS_REGION}" --instance-name "${INSTANCE_NAME}" >/dev/null 2>&1; then
  echo "  -> Instance '${INSTANCE_NAME}' already exists."
else
  echo "  -> Creating Lightsail instance '${INSTANCE_NAME}' (${BLUEPRINT_ID}, ${BUNDLE_ID})..."
  aws lightsail create-instances \
    --region "${AWS_REGION}" \
    --instance-names "${INSTANCE_NAME}" \
    --availability-zone "${AVAILABILITY_ZONE}" \
    --blueprint-id "${BLUEPRINT_ID}" \
    --bundle-id "${BUNDLE_ID}" \
    --user-data "file://${USER_DATA_FILE}" \
    --tags key=Project,value=RevletMail key=Role,value=StalwartMX >/dev/null
  echo "  -> Waiting for instance '${INSTANCE_NAME}' to enter 'running' state..."
  for i in {1..30}; do
    STATE=$(aws lightsail get-instance-state --region "${AWS_REGION}" --instance-name "${INSTANCE_NAME}" --query "state.name" --output text || echo "pending")
    if [ "${STATE}" = "running" ]; then
      echo "  -> Instance is now running."
      break
    fi
    sleep 5
  done
fi

# 3. Allocate & Attach Static IPv4 (Idempotent)
echo "[3/5] Configuring dedicated Static IPv4 '${STATIC_IP_NAME}'..."
if ! aws lightsail get-static-ip --region "${AWS_REGION}" --static-ip-name "${STATIC_IP_NAME}" >/dev/null 2>&1; then
  aws lightsail allocate-static-ip --region "${AWS_REGION}" --static-ip-name "${STATIC_IP_NAME}" >/dev/null
  echo "  -> Allocated Static IP '${STATIC_IP_NAME}'."
fi

IS_ATTACHED=$(aws lightsail get-static-ip --region "${AWS_REGION}" --static-ip-name "${STATIC_IP_NAME}" --query "staticIp.isAttached" --output text)
if [ "${IS_ATTACHED}" != "True" ] && [ "${IS_ATTACHED}" != "true" ]; then
  aws lightsail attach-static-ip \
    --region "${AWS_REGION}" \
    --static-ip-name "${STATIC_IP_NAME}" \
    --instance-name "${INSTANCE_NAME}" >/dev/null
  echo "  -> Attached Static IP '${STATIC_IP_NAME}' to '${INSTANCE_NAME}'."
fi

STATIC_IP_ADDRESS=$(aws lightsail get-static-ip --region "${AWS_REGION}" --static-ip-name "${STATIC_IP_NAME}" --query "staticIp.ipAddress" --output text)
echo "  -> Dedicated MX Static IPv4: ${STATIC_IP_ADDRESS}"

# 4. Open Lightsail Firewall Ports for SMTP MX, Submissions, HTTPS & JMAP
echo "[4/5] Applying Lightsail public firewall rules on '${INSTANCE_NAME}'..."
aws lightsail put-instance-public-ports \
  --region "${AWS_REGION}" \
  --instance-name "${INSTANCE_NAME}" \
  --port-infos \
    "fromPort=22,toPort=22,protocol=tcp" \
    "fromPort=25,toPort=25,protocol=tcp" \
    "fromPort=80,toPort=80,protocol=tcp" \
    "fromPort=443,toPort=443,protocol=tcp" \
    "fromPort=465,toPort=465,protocol=tcp" \
    "fromPort=587,toPort=587,protocol=tcp" \
    "fromPort=8080,toPort=8080,protocol=tcp" >/dev/null
echo "  -> Opened TCP ports: 22 (SSH), 25 (SMTP MX), 80/443 (HTTPS/JMAP), 465/587 (Submissions), 8080 (Admin API)."

# 5. Configure AWS SES v2 in ap-southeast-2
echo "[5/5] Configuring AWS SES v2 Outbound Relay (${AWS_REGION})..."
if ! aws sesv2 get-configuration-set --region "${AWS_REGION}" --configuration-set-name "${SES_CONFIG_SET}" >/dev/null 2>&1; then
  aws sesv2 create-configuration-set \
    --region "${AWS_REGION}" \
    --configuration-set-name "${SES_CONFIG_SET}" \
    --sending-options SendingEnabled=true \
    --reputation-options ReputationMetricsEnabled=true >/dev/null
  echo "  -> Created SES v2 Configuration Set: ${SES_CONFIG_SET}"
else
  echo "  -> SES v2 Configuration Set '${SES_CONFIG_SET}' already exists."
fi

if ! aws sesv2 get-email-identity --region "${AWS_REGION}" --email-identity "${PRIMARY_DOMAIN}" >/dev/null 2>&1; then
  aws sesv2 create-email-identity \
    --region "${AWS_REGION}" \
    --email-identity "${PRIMARY_DOMAIN}" \
    --configuration-set-name "${SES_CONFIG_SET}" \
    --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT >/dev/null
  echo "  -> Created SES v2 Email Identity for ${PRIMARY_DOMAIN} (2048-bit Easy DKIM)."
else
  echo "  -> SES v2 Email Identity '${PRIMARY_DOMAIN}' already exists."
fi

DKIM_TOKENS=$(aws sesv2 get-email-identity \
  --region "${AWS_REGION}" \
  --email-identity "${PRIMARY_DOMAIN}" \
  --query "DkimAttributes.Tokens[]" \
  --output text)

echo ""
echo "=================================================================="
echo " PROVISIONING COMPLETE — DNS & ENVIRONMENT SUMMARY"
echo "=================================================================="
echo "1. Stalwart Mail Server Host (mx.revlet.me):"
echo "   - Instance Name : ${INSTANCE_NAME}"
echo "   - Region / AZ   : ${AVAILABILITY_ZONE}"
echo "   - Static IPv4   : ${STATIC_IP_ADDRESS}"
echo "   - JMAP / Admin  : http://${STATIC_IP_ADDRESS}:8080 (or https://mx.revlet.me)"
echo ""
echo "2. Required Cloudflare DNS Records on 'revlet.me':"
echo "   - A     mx.revlet.me       -> ${STATIC_IP_ADDRESS} (DNS Only / Grey Cloud)"
echo "   - TXT   _spf.mx.revlet.me  -> v=spf1 ip4:${STATIC_IP_ADDRESS} include:amazonses.com ~all"
for token in ${DKIM_TOKENS}; do
  echo "   - CNAME ${token}._domainkey.${PRIMARY_DOMAIN} -> ${token}.dkim.amazonses.com"
done
echo "=================================================================="
