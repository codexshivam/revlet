# `alerts@revlet.me` Setup Guide

Revlet sends automated 14-day retention & permanent deletion notifications from `Revlet Alerts <alerts@revlet.me>` using AWS SES v2 (`POST /v2/email/outbound-emails`).

## 1. Verify `revlet.me` Domain Identity in AWS SES
1. Open the **AWS SES Console** in your configured `AWS_REGION` (default `us-east-1`).
2. Navigate to **Verified identities -> Create identity -> Domain** and enter `revlet.me`.
3. Enable **Easy DKIM (RSA 2048-bit)** and publish the 3 generated `CNAME` records to your `revlet.me` DNS zone.
4. Ensure your `revlet.me` DNS zone also includes:
   - **SPF (`TXT` on `revlet.me`)**: `v=spf1 include:amazonses.com ~all` (or merged with your existing SPF record).
   - **DMARC (`TXT` on `_dmarc.revlet.me`)**: `v=DMARC1; p=quarantine; rua=mailto:alerts@revlet.me`
5. If your AWS SES account is still in Sandbox mode, request **Production Access** so `alerts@revlet.me` can deliver to any organization owner email address.

## 2. Configure IAM & Environment Variables
Ensure the Revlet Console runtime (Firebase App Hosting / `.env.local`) has:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-ses-iam-access-key
AWS_SECRET_ACCESS_KEY=your-ses-iam-secret-key
REVLET_ALERTS_FROM="Revlet Alerts <alerts@revlet.me>"
CRON_SECRET=your-long-random-cron-secret
```

The IAM user/role attached to `AWS_ACCESS_KEY_ID` must allow `ses:SendEmail` (and `ses:SendRawEmail` if needed) for the `revlet.me` identity.

## 3. Schedule the Daily 14-Day Retention Purge Job
Configure Google Cloud Scheduler (or any cron runner) to call the purge endpoint once per day:

- **URL**: `https://<your-console-host>/api/mail/v1/purge-expired`
- **Method**: `POST`
- **Schedule**: `0 2 * * *` (daily at 02:00 UTC)
- **Header**: `Authorization: Bearer <CRON_SECRET>` (falls back to `REVLET_MAIL_INTERNAL_SECRET` if `CRON_SECRET` is unset)

When triggered, the job:
1. Permanently deletes all mailboxes, aliases, groups, organizational units, and mail server principals for organizations whose Email Service has been deactivated for 14+ days.
2. Permanently deletes soft-deleted email accounts whose 14-day recovery window has expired.
3. Emails the organization owner from `alerts@revlet.me` using the branded Revlet template.
