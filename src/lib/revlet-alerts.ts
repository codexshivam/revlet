import crypto from 'crypto';
import { adminAuth, adminDb } from '@/firebase/admin';

function awsHmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function awsSha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export async function callAwsSesV2Api(
  method: 'POST' | 'GET',
  path: string,
  bodyObj?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: any }> {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const region = (process.env.AWS_REGION || 'ap-southeast-2').trim();

  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, status: 0, data: null };
  }

  const host = `email.${region}.amazonaws.com`;
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = awsSha256Hex(bodyStr);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    awsSha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = awsHmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = awsHmac(kDate, region);
  const kService = awsHmac(kRegion, 'ses');
  const kSigning = awsHmac(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const res = await fetch(`https://${host}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
      body: method === 'POST' ? bodyStr : undefined,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 503, data: null };
  }
}

export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function resolveOrganizationOwnerEmail(
  orgData: Record<string, any>
): Promise<string | null> {
  const candidates = [orgData.contactEmail, orgData.currentEmail, orgData.ownerEmail]
    .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter((v) => v.includes('@'));
  if (candidates.length > 0) return candidates[0];

  if (orgData.ownerId) {
    try {
      const ownerRecord = await adminAuth.getUser(orgData.ownerId);
      if (ownerRecord.email) return ownerRecord.email.toLowerCase().trim();
    } catch {
      // Fallback to users collection
    }
    try {
      const userSnap = await adminDb.collection('users').doc(orgData.ownerId).get();
      const userEmail = userSnap.data()?.email;
      if (typeof userEmail === 'string' && userEmail.includes('@')) {
        return userEmail.toLowerCase().trim();
      }
    } catch {
      // Ignore
    }
  }
  return null;
}

export interface RevletEmailPayload {
  to: string | string[];
  subject: string;
  title: string;
  subtitle?: string;
  summaryLines: string[];
  details?: Array<{ label: string; value: string }>;
  otpCode?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  footerNote?: string;
}

function buildInstitutionalEmailContent(
  params: RevletEmailPayload,
  senderBadge: string,
  defaultCta?: { url: string; label: string }
): { html: string; text: string } {
  const ctaUrl = params.ctaUrl || defaultCta?.url || '';
  const ctaLabel = params.ctaLabel || defaultCta?.label || '';

  const detailRowsHtml = (params.details || [])
    .map(
      (d) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;font-weight:600;width:38%;">${escapeHtml(d.label)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#0f172a;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(d.value)}</td>
      </tr>`
    )
    .join('');

  const summaryHtml = params.summaryLines
    .map(
      (line) =>
        `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.65;color:#334155;">${escapeHtml(line)}</p>`
    )
    .join('');

  const otpHtml = params.otpCode
    ? `
      <div style="margin:20px 0;padding:18px 20px;background-color:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;text-align:center;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin-bottom:6px;">
          One-Time Verification Code
        </div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.24em;color:#0f172a;">
          ${escapeHtml(params.otpCode)}
        </div>
      </div>`
    : '';

  const ctaHtml =
    ctaUrl && ctaLabel
      ? `
      <div style="margin-top:24px;">
        <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
        <p style="margin:12px 0 0;color:#64748b;font-size:11px;line-height:1.5;word-break:break-all;">
          If the button above does not open, copy and paste this URL into your browser:<br />
          <a href="${escapeHtml(ctaUrl)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(ctaUrl)}</a>
        </p>
      </div>`
      : '';

  const footerNote =
    params.footerNote ||
    `Automated security & platform notification from Revlet (${senderBadge}).`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>${escapeHtml(params.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#0f172a;padding:22px 28px;border-bottom:3px solid #2563eb;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">Revlet</td>
                  <td align="right" style="font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#94a3b8;">${escapeHtml(senderBadge)}</td>
                </tr>
              </table>
              ${
                params.subtitle
                  ? `<div style="margin-top:6px;font-size:12px;color:#cbd5e1;line-height:1.5;">${escapeHtml(params.subtitle)}</div>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">${escapeHtml(params.title)}</h1>
              ${summaryHtml}
              ${otpHtml}
              ${
                detailRowsHtml
                  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background-color:#f8fafc;">
                      ${detailRowsHtml}
                    </table>`
                  : ''
              }
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;font-size:11px;color:#64748b;line-height:1.6;">
              ${escapeHtml(footerNote)}
              <div style="margin-top:6px;color:#94a3b8;">
                <a href="https://app.revlet.me" style="color:#64748b;text-decoration:none;font-weight:600;">app.revlet.me</a>
                &nbsp;&middot;&nbsp;
                <a href="https://mail.revlet.me" style="color:#64748b;text-decoration:none;font-weight:600;">mail.revlet.me</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Revlet — ${params.title}`,
    params.subtitle ? params.subtitle : '',
    '',
    ...params.summaryLines,
    ...(params.otpCode ? ['', `Verification Code: ${params.otpCode}`] : []),
    '',
    ...(params.details || []).map((d) => `${d.label}: ${d.value}`),
    ...(ctaUrl && ctaLabel ? ['', `${ctaLabel}: ${ctaUrl}`] : []),
    '',
    '---',
    footerNote,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

/**
 * Sends a branded Revlet operational/governance alert email from `alerts@revlet.me` via AWS SES v2.
 */
export async function sendRevletAlertEmail(params: {
  to: string;
  subject: string;
  title: string;
  subtitle: string;
  summaryLines: string[];
  details: Array<{ label: string; value: string }>;
  ctaUrl?: string;
  ctaLabel?: string;
}): Promise<boolean> {
  const to = (params.to || '').trim().toLowerCase();
  if (!to || !to.includes('@')) return false;

  const fromAddress = (
    process.env.REVLET_ALERTS_FROM || 'Revlet Alerts <alerts@revlet.me>'
  ).trim();
  const replyToAddress = (
    process.env.REVLET_SUPPORT_EMAIL || 'support@revlet.me'
  ).trim();

  const { html, text } = buildInstitutionalEmailContent(params, 'alerts@revlet.me', {
    url: 'https://app.revlet.me/services/email',
    label: 'Open Revlet Console',
  });

  const res = await callAwsSesV2Api('POST', '/v2/email/outbound-emails', {
    FromEmailAddress: fromAddress,
    ReplyToAddresses: [replyToAddress],
    Destination: {
      ToAddresses: [to],
    },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    },
  });

  return res.ok;
}

/**
 * Sends a branded Revlet Authentication / MFA Security email from `accounts@revlet.me` via AWS SES v2.
 */
export async function sendRevletAccountEmail(
  params: RevletEmailPayload
): Promise<{ sent: boolean; status: number }> {
  const recipients = (Array.isArray(params.to) ? params.to : [params.to])
    .map((addr) => addr.trim().toLowerCase())
    .filter((addr) => addr.includes('@'));

  if (recipients.length === 0) {
    return { sent: false, status: 400 };
  }

  const fromAddress = (
    process.env.REVLET_ACCOUNTS_FROM || 'Revlet Accounts <accounts@revlet.me>'
  ).trim();
  const replyToAddress = (
    process.env.REVLET_SUPPORT_EMAIL || 'support@revlet.me'
  ).trim();

  const { html, text } = buildInstitutionalEmailContent(params, 'accounts@revlet.me');

  const res = await callAwsSesV2Api('POST', '/v2/email/outbound-emails', {
    FromEmailAddress: fromAddress,
    ReplyToAddresses: [replyToAddress],
    Destination: {
      ToAddresses: recipients,
    },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    },
  });

  return { sent: res.ok, status: res.status };
}

/**
 * Sends a Delivery Status Notification (DSN) / bounce report from `mailer-daemon@revlet.me` via AWS SES v2.
 */
export async function sendRevletMailerDaemonEmail(
  params: RevletEmailPayload
): Promise<{ sent: boolean; status: number }> {
  const recipients = (Array.isArray(params.to) ? params.to : [params.to])
    .map((addr) => addr.trim().toLowerCase())
    .filter((addr) => addr.includes('@'));

  if (recipients.length === 0) {
    return { sent: false, status: 400 };
  }

  const fromAddress = (
    process.env.REVLET_MAILER_DAEMON_FROM ||
    'Mail Delivery Subsystem <mailer-daemon@revlet.me>'
  ).trim();
  const replyToAddress = (
    process.env.REVLET_SUPPORT_EMAIL || 'support@revlet.me'
  ).trim();

  const { html, text } = buildInstitutionalEmailContent(
    params,
    'mailer-daemon@revlet.me',
    {
      url: 'https://mail.revlet.me',
      label: 'Open RevletMail',
    }
  );

  const res = await callAwsSesV2Api('POST', '/v2/email/outbound-emails', {
    FromEmailAddress: fromAddress,
    ReplyToAddresses: [replyToAddress],
    Destination: {
      ToAddresses: recipients,
    },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    },
  });

  return { sent: res.ok, status: res.status };
}

