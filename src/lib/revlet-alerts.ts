import crypto from 'crypto';
import net from 'net';
import tls from 'tls';
import { adminAuth, adminDb } from '@/firebase/admin';

function awsHmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function awsSha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export async function callAwsSesV2Api(
  method: 'POST' | 'GET' | 'PUT',
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
      body: method === 'POST' || method === 'PUT' ? bodyStr : undefined,
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

function escapeHtmlNeutralizingAutoLinks(str: string): string {
  return escapeHtml(str)
    .replace(/@/g, '&#8204;@')
    .replace(/\./g, '&#8204;.');
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
  regards?: string;
  securityNote?: string;
  footerNote?: string;
}

const BADGE_DETAIL_LABELS = new Set([
  'action type',
  'status',
  'trigger',
  'bounce type',
  'severity',
]);

function buildInstitutionalEmailContent(
  params: RevletEmailPayload,
  senderBadge: string,
  defaultCta?: { url: string; label: string }
): { html: string; text: string } {
  const ctaUrl = params.ctaUrl || defaultCta?.url || '';
  const ctaLabel = params.ctaLabel || defaultCta?.label || '';
  const supportEmail = (
    process.env.REVLET_SUPPORT_EMAIL || 'hello@revlet.me'
  ).trim();

  const detailRows = params.details || [];
  const detailRowsHtml = detailRows
    .map((d, idx) => {
      const isLast = idx === detailRows.length - 1;
      const borderBottom = isLast ? 'none' : '1px solid #e4e4e7';
      const labelLower = (d.label || '').trim().toLowerCase();
      const isBadge = BADGE_DETAIL_LABELS.has(labelLower);
      const isEmailOrDomain =
        d.value.includes('@') ||
        /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d.value.trim());

      const renderedValue = isBadge
        ? `<span style="display:inline-block;background-color:#f4f4f5;color:#18181b;border:1px solid #e4e4e7;font-size:12px;font-weight:600;padding:4px 11px;border-radius:999px;line-height:1.3;">${escapeHtml(d.value)}</span>`
        : `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;color:${isEmailOrDomain ? '#09090b' : '#18181b'};text-decoration:none;word-break:break-word;">${isEmailOrDomain ? escapeHtmlNeutralizingAutoLinks(d.value) : escapeHtml(d.value)}</span>`;

      return `
      <tr>
        <td class="detail-label" style="padding:12px 16px;border-bottom:${borderBottom};font-size:13px;color:#71717a;font-weight:500;text-align:left;vertical-align:middle;width:40%;">${escapeHtml(d.label)}</td>
        <td class="detail-value" style="padding:12px 16px;border-bottom:${borderBottom};text-align:right;vertical-align:middle;width:60%;">${renderedValue}</td>
      </tr>`;
    })
    .join('');

  const summaryHtml = params.summaryLines
    .map(
      (line) =>
        `<p style="margin:0 0 12px 0;font-size:14px;line-height:1.65;color:#3f3f46;">${escapeHtml(line)}</p>`
    )
    .join('');

  const otpHtml = params.otpCode
    ? `
      <div style="margin:20px 0;padding:18px 20px;background-color:#fafafa;border:1px solid #e4e4e7;border-radius:12px;text-align:center;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#71717a;margin-bottom:8px;">
          One-Time Verification Code
        </div>
        <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.22em;color:#09090b;">
          ${escapeHtml(params.otpCode)}
        </div>
      </div>`
    : '';

  const ctaHtml =
    ctaUrl && ctaLabel
      ? `
      <div style="margin-top:22px;">
        <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" class="cta-btn" style="display:inline-block;background-color:#09090b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;line-height:1.3;border:1px solid #27272a;">${escapeHtml(ctaLabel)}</a>
      </div>
      <div style="margin-top:20px;">
        <p style="margin:0 0 8px 0;color:#71717a;font-size:12px;line-height:1.5;">
          If the button above does not open, copy and paste this URL into your browser:
        </p>
        <div style="background-color:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.55;color:#27272a;word-break:break-all;">
          <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="color:#27272a;text-decoration:none;word-break:break-all;">${escapeHtml(ctaUrl)}</a>
        </div>
      </div>`
      : '';

  const regardsText = (params.regards || '').trim();
  const regardsHtml = regardsText
    ? `<div style="margin-top:22px;font-size:14px;line-height:1.6;color:#18181b;font-weight:500;">${escapeHtml(regardsText).replace(/\r?\n/g, '<br />')}</div>`
    : '';

  const defaultSecurityNote =
    senderBadge === 'account@revlet.me' || senderBadge === 'accounts@revlet.me'
      ? `If you did not initiate this request, no modifications have been made to your account. You can safely disregard this email or report suspicious activity to ${supportEmail}.`
      : `This message was generated automatically by Revlet Platform. If you believe this notification was sent in error, contact ${supportEmail}.`;
  const securityNoteText = params.securityNote || defaultSecurityNote;
  const securityNoticeHtml = `
    <div style="margin-top:22px;background-color:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:13px 16px;font-size:12.5px;line-height:1.6;color:#713f12;">
      <strong style="color:#78350f;">Didn&rsquo;t expect this?</strong>
      ${escapeHtml(securityNoteText).replace(
        escapeHtml(supportEmail),
        `<a href="mailto:${escapeHtml(supportEmail)}" style="color:#92400e;text-decoration:underline;font-weight:600;">${escapeHtml(supportEmail)}</a>`
      )}
    </div>`;

  const footerNote =
    params.footerNote ||
    'Please do not reply directly to this email as this is an automated no-reply address.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(params.subject)}</title>
  <style>
    .email-header,
    .email-header *,
    .email-header a,
    .email-header a:link,
    .email-header a:visited,
    .email-header a:hover,
    a[x-apple-data-detectors],
    u + #body .email-header a {
      color: #ffffff !important;
      text-decoration: none !important;
    }
    .detail-value a,
    .detail-value a[x-apple-data-detectors] {
      color: #09090b !important;
      text-decoration: none !important;
    }
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 12px 8px !important;
      }
      .email-card {
        border-radius: 14px !important;
      }
      .email-header {
        padding: 20px 18px !important;
      }
      .email-body {
        padding: 22px 18px !important;
      }
      .email-footer {
        padding: 18px 16px !important;
      }
      .email-title {
        font-size: 18px !important;
      }
      .cta-btn {
        display: block !important;
        text-align: center !important;
        width: auto !important;
      }
      .detail-label,
      .detail-value {
        padding: 10px 12px !important;
        font-size: 12px !important;
      }
    }
  </style>
</head>
<body id="body" style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-wrapper" style="background-color:#f4f4f5;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-card" style="max-width:580px;width:100%;background-color:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(9,9,11,0.06);">
          <tr>
            <td class="email-header" style="background-color:#09090b;background-image:radial-gradient(circle at 50% 0%, #18181b 0%, #09090b 72%);border-bottom:1px solid #27272a;padding:22px 28px;color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;"><img src="https://app.revlet.me/brand/revlet-email-logo.png" alt="Revlet" height="28" style="display:block;height:28px;width:auto;border:0;outline:none;text-decoration:none;font-size:18px;font-weight:700;color:#ffffff;" /></td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;background-color:#18181b;border:1px solid #3f3f46;border-radius:999px;padding:4px 12px;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#ffffff;text-decoration:none;white-space:nowrap;">${escapeHtmlNeutralizingAutoLinks(senderBadge)}</span>
                  </td>
                </tr>
              </table>
              ${
                params.subtitle
                  ? `<div style="margin-top:16px;background-color:#18181b;border:1px solid #27272a;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.55;color:#ffffff;">${escapeHtmlNeutralizingAutoLinks(params.subtitle)}</div>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td class="email-body" style="padding:28px;">
              <h1 class="email-title" style="margin:0 0 12px 0;font-size:20px;font-weight:700;color:#09090b;letter-spacing:-0.015em;line-height:1.3;">${escapeHtml(params.title)}</h1>
              ${summaryHtml}
              ${otpHtml}
              ${
                detailRowsHtml
                  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border:1px solid #e4e4e7;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;background-color:#ffffff;">
                      ${detailRowsHtml}
                    </table>`
                  : ''
              }
              ${ctaHtml}
              ${regardsHtml}
              ${securityNoticeHtml}
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="background-color:#fafafa;border-top:1px solid #e4e4e7;padding:20px 28px;text-align:center;font-size:11.5px;color:#71717a;line-height:1.65;">
              <div>${escapeHtml(footerNote)}</div>
              <div style="margin-top:10px;color:#a1a1aa;">
                <a href="https://revlet.me/support" style="color:#52525b;text-decoration:none;font-weight:500;">Help &amp; Support</a>
                &nbsp;&middot;&nbsp;
                <a href="https://revlet.me/privacy" style="color:#52525b;text-decoration:none;font-weight:500;">Privacy Policy</a>
                &nbsp;&middot;&nbsp;
                <a href="https://revlet.me/terms" style="color:#52525b;text-decoration:none;font-weight:500;">Service Terms</a>
                &nbsp;&middot;&nbsp;
                <a href="https://revlet.me" style="color:#52525b;text-decoration:none;font-weight:500;">About</a>
              </div>
              <div style="margin-top:10px;font-size:11px;color:#a1a1aa;">
                Revlet Platform &middot; Developed &amp; Managed by Shivam Yadav.
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
    ...(regardsText ? ['', regardsText] : []),
    '',
    `Security Notice: ${securityNoteText}`,
    '',
    '---',
    footerNote,
    'Revlet Platform · Developed & Managed by Shivam Yadav.',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

function extractEmailAddress(formatted: string): string {
  const match = formatted.match(/<([^>]+)>/);
  return (match ? match[1] : formatted).trim().toLowerCase();
}

function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function dotStuffSmtpBody(raw: string): string {
  return raw
    .replace(/\r?\n/g, '\r\n')
    .replace(/^\./gm, '..');
}

async function sendViaAwsSesSmtp(params: {
  fromAddress: string;
  recipients: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const host = (process.env.AWS_SES_SMTP_HOST || 'email-smtp.ap-southeast-2.amazonaws.com').trim();
  const port = Number.parseInt((process.env.AWS_SES_SMTP_PORT || '465').trim(), 10) || 465;
  const user = (process.env.AWS_SES_SMTP_USER || '').trim();
  const password = (process.env.AWS_SES_SMTP_PASSWORD || '').trim();

  if (!host || !user || !password || params.recipients.length === 0) {
    return false;
  }

  const envelopeFrom = extractEmailAddress(params.fromAddress);
  const boundary = `revlet_${crypto.randomBytes(12).toString('hex')}`;
  const messageId = `<${crypto.randomUUID()}@revlet.me>`;
  const mimePayload = [
    `From: ${params.fromAddress}`,
    `To: ${params.recipients.join(', ')}`,
    `Subject: ${encodeMimeHeader(params.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Auto-Submitted: auto-generated`,
    `X-Auto-Response-Suppress: All`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(params.text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(params.html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
    ``,
    `--${boundary}--`,
    ``,
  ].join('\r\n');

  const runSmtpSession = (useImplicitTls: boolean, targetPort: number) =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        resolve(ok);
      };

      let socket: net.Socket | tls.TLSSocket = useImplicitTls
        ? tls.connect(targetPort, host, { servername: host, rejectUnauthorized: true })
        : net.connect(targetPort, host);

      socket.setTimeout(12000, () => finish(false));
      socket.on('error', () => finish(false));

      let buffer = '';
      let stage = useImplicitTls ? 'greeting' : 'plain_greeting';
      let rcptIndex = 0;

      const writeLine = (line: string) => {
        socket.write(`${line}\r\n`);
      };

      const attachDataHandler = (sock: net.Socket | tls.TLSSocket) => {
        sock.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          if (!buffer.includes('\n')) return;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line || /^\d{3}-/.test(line)) continue;
            const code = Number.parseInt(line.slice(0, 3), 10);
            if (Number.isNaN(code) || code >= 400) {
              finish(false);
              return;
            }
            if (stage === 'plain_greeting' && code === 220) {
              stage = 'plain_ehlo';
              writeLine('EHLO app.revlet.me');
            } else if (stage === 'plain_ehlo' && code === 250) {
              stage = 'starttls';
              writeLine('STARTTLS');
            } else if (stage === 'starttls' && code === 220) {
              stage = 'greeting_tls';
              const upgraded = tls.connect({
                socket: sock as net.Socket,
                servername: host,
                rejectUnauthorized: true,
              });
              upgraded.setTimeout(12000, () => finish(false));
              upgraded.on('error', () => finish(false));
              socket = upgraded;
              buffer = '';
              attachDataHandler(upgraded);
              stage = 'ehlo';
              writeLine('EHLO app.revlet.me');
              return;
            } else if (stage === 'greeting' && code === 220) {
              stage = 'ehlo';
              writeLine('EHLO app.revlet.me');
            } else if (stage === 'ehlo' && code === 250) {
              stage = 'auth';
              writeLine('AUTH LOGIN');
            } else if (stage === 'auth' && code === 334) {
              stage = 'auth_user';
              writeLine(Buffer.from(user, 'utf8').toString('base64'));
            } else if (stage === 'auth_user' && code === 334) {
              stage = 'auth_pass';
              writeLine(Buffer.from(password, 'utf8').toString('base64'));
            } else if (stage === 'auth_pass' && code === 235) {
              stage = 'mail_from';
              writeLine(`MAIL FROM:<${envelopeFrom}>`);
            } else if (stage === 'mail_from' && code === 250) {
              stage = 'rcpt_to';
              rcptIndex = 0;
              writeLine(`RCPT TO:<${params.recipients[rcptIndex]}>`);
            } else if (stage === 'rcpt_to' && (code === 250 || code === 251)) {
              rcptIndex += 1;
              if (rcptIndex < params.recipients.length) {
                writeLine(`RCPT TO:<${params.recipients[rcptIndex]}>`);
              } else {
                stage = 'data';
                writeLine('DATA');
              }
            } else if (stage === 'data' && code === 354) {
              stage = 'body';
              socket.write(`${dotStuffSmtpBody(mimePayload)}\r\n.\r\n`);
            } else if (stage === 'body' && code === 250) {
              stage = 'quit';
              writeLine('QUIT');
              finish(true);
              return;
            }
          }
        });
      };

      attachDataHandler(socket);
    });

  // Prefer implicit TLS on 465 for lowest serverless latency; fallback to STARTTLS if configured port differs
  if (port === 465) {
    return runSmtpSession(true, 465);
  }
  const ok = await runSmtpSession(false, port);
  if (ok) return true;
  return runSmtpSession(true, 465);
}

async function dispatchRevletSesEmail(params: {
  payload: RevletEmailPayload;
  fromAddress: string;
  senderBadge: string;
  defaultCta?: { url: string; label: string };
}): Promise<{ sent: boolean; status: number }> {
  const recipients = (Array.isArray(params.payload.to) ? params.payload.to : [params.payload.to])
    .map((addr) => addr.trim().toLowerCase())
    .filter((addr) => addr.includes('@'));

  if (recipients.length === 0) {
    return { sent: false, status: 400 };
  }

  const { html, text } = buildInstitutionalEmailContent(
    params.payload,
    params.senderBadge,
    params.defaultCta
  );

  // Try AWS SES v2 API first, then fallback to authenticated AWS SES SMTP relay
  const apiRes = await callAwsSesV2Api('POST', '/v2/email/outbound-emails', {
    FromEmailAddress: params.fromAddress,
    Destination: {
      ToAddresses: recipients,
    },
    Content: {
      Simple: {
        Subject: { Data: params.payload.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
        Headers: [
          { Name: 'Auto-Submitted', Value: 'auto-generated' },
          { Name: 'X-Auto-Response-Suppress', Value: 'All' },
        ],
      },
    },
  });

  if (apiRes.ok) {
    return { sent: true, status: apiRes.status };
  }

  console.error('[revlet-alerts] SES v2 API failed:', {
    status: apiRes.status,
    from: params.fromAddress,
    to: recipients,
    error: apiRes.data,
  });

  const smtpOk = await sendViaAwsSesSmtp({
    fromAddress: params.fromAddress,
    recipients,
    subject: params.payload.subject,
    html,
    text,
  });

  if (!smtpOk) {
    console.error('[revlet-alerts] SES SMTP fallback also failed:', {
      from: params.fromAddress,
      to: recipients,
    });
  }

  return { sent: smtpOk, status: smtpOk ? 200 : apiRes.status || 502 };
}

/**
 * Sends a branded Revlet operational/governance alert email from `alerts@revlet.me` (no-reply).
 */
export async function sendRevletAlertEmail(params: {
  to: string;
  from?: string;
  senderBadge?: string;
  subject: string;
  title: string;
  subtitle: string;
  summaryLines: string[];
  details: Array<{ label: string; value: string }>;
  ctaUrl?: string;
  ctaLabel?: string;
}): Promise<boolean> {
  const fromAddress = (
    params.from ||
    process.env.REVLET_ALERTS_FROM ||
    'Revlet Alerts <alerts@revlet.me>'
  ).trim();
  const senderBadge = (params.senderBadge || 'alerts@revlet.me').trim();

  const res = await dispatchRevletSesEmail({
    payload: params,
    fromAddress,
    senderBadge,
    defaultCta: {
      url: 'https://app.revlet.me/services/email',
      label: 'Open Revlet Console',
    },
  });

  return res.sent;
}

/**
 * Sends a branded Revlet Authentication / MFA Security email from `account@revlet.me` (no-reply).
 */
export async function sendRevletAccountEmail(
  params: RevletEmailPayload & { from?: string; senderBadge?: string }
): Promise<{ sent: boolean; status: number }> {
  const fromAddress = (
    params.from ||
    process.env.REVLET_ACCOUNTS_FROM ||
    'Revlet Accounts <accounts@revlet.me>'
  ).trim();
  const senderBadge = (params.senderBadge || 'accounts@revlet.me').trim();

  return dispatchRevletSesEmail({
    payload: params,
    fromAddress,
    senderBadge,
  });
}

/**
 * Sends a Delivery Status Notification (DSN) / bounce report from `mailer-daemon@revlet.me` (no-reply).
 */
export async function sendRevletMailerDaemonEmail(
  params: RevletEmailPayload
): Promise<{ sent: boolean; status: number }> {
  const fromAddress = (
    process.env.REVLET_MAILER_DAEMON_FROM ||
    'Mail Delivery Subsystem <mailer-daemon@revlet.me>'
  ).trim();

  return dispatchRevletSesEmail({
    payload: params,
    fromAddress,
    senderBadge: 'mailer-daemon@revlet.me',
    defaultCta: {
      url: 'https://mail.revlet.me',
      label: 'Open RevletMail',
    },
  });
}

