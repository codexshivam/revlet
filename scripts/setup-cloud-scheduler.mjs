#!/usr/bin/env node
/**
 * Google Cloud Scheduler Provisioning Script for Revlet Platform & RevletMail
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/Users/shivamyadav/Projects/firebase-adminsdk.json node scripts/setup-cloud-scheduler.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'revlet';
const LOCATION = process.env.GCP_SCHEDULER_LOCATION || 'asia-south1';
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.revlet.me').replace(/\/$/, '');
const WEBMAIL_URL = (process.env.NEXT_PUBLIC_WEBMAIL_URL || 'https://mail.revlet.me').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET || process.env.MAIL_INTERNAL_API_SECRET;

if (!CRON_SECRET) {
  console.error('Error: CRON_SECRET or MAIL_INTERNAL_API_SECRET must be set in .env.local');
  process.exit(1);
}

const JOBS = [
  {
    id: 'revlet-schedule-run',
    description: 'Unified Revlet scheduled maintenance run (retention purge, quota verification, and ephemeral cleanup)',
    schedule: '0 */6 * * *',
    timeZone: 'UTC',
    uri: `${APP_URL}/api/cron/schedule-run`,
    httpMethod: 'POST',
  },
  {
    id: 'revlet-mail-purge-expired',
    description: 'Nightly 30-day retention purge for deactivated Revlet Mail organizations',
    schedule: '0 2 * * *',
    timeZone: 'UTC',
    uri: `${APP_URL}/api/mail/v1/purge-expired`,
    httpMethod: 'POST',
  },
  {
    id: 'revlet-mail-quota-reset',
    description: 'Daily UTC midnight reset for organization and mailbox outbound email quotas',
    schedule: '5 0 * * *',
    timeZone: 'UTC',
    uri: `${APP_URL}/api/mail/v1/quota/reset`,
    httpMethod: 'POST',
  },
  {
    id: 'revletmail-ephemeral-purge',
    description: 'Periodic cleanup of expired ephemeral attachments and undo-send buffers in RevletMail',
    schedule: '*/15 * * * *',
    timeZone: 'UTC',
    uri: `${WEBMAIL_URL}/api/cron/ephemeral-purge`,
    httpMethod: 'GET',
  },
];

async function main() {
  const keyFile =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (fs.existsSync('/Users/shivamyadav/Projects/firebase-adminsdk.json')
      ? '/Users/shivamyadav/Projects/firebase-adminsdk.json'
      : undefined);

  const auth = new GoogleAuth({
    ...(keyFile ? { keyFile } : {}),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  if (!token) {
    throw new Error('Failed to acquire Google Cloud access token');
  }

  const parent = `projects/${PROJECT_ID}/locations/${LOCATION}`;

  for (const job of JOBS) {
    const jobName = `${parent}/jobs/${job.id}`;
    const payload = {
      name: jobName,
      description: job.description,
      schedule: job.schedule,
      timeZone: job.timeZone,
      httpTarget: {
        uri: job.uri,
        httpMethod: job.httpMethod,
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json',
        },
      },
    };

    const getRes = await fetch(`https://cloudscheduler.googleapis.com/v1/${jobName}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (getRes.status === 200) {
      const updateRes = await fetch(`https://cloudscheduler.googleapis.com/v1/${jobName}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await updateRes.json();
      console.log(`[UPDATED] ${job.id}:`, updateRes.status, data.error?.message || 'OK');
    } else {
      const createRes = await fetch(`https://cloudscheduler.googleapis.com/v1/${parent}/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await createRes.json();
      console.log(`[CREATED] ${job.id}:`, createRes.status, data.error?.message || 'OK');
    }
  }
}

main().catch((err) => {
  console.error('Cloud Scheduler setup failed:', err.message);
  process.exit(1);
});
