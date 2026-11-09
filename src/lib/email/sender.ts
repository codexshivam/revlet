/**
 * @file sender.ts
 * Enterprise transactional email sender for Revlet Platform.
 * Sends emails via Google Workspace Gmail API using Domain-Wide Delegation
 * impersonating accounts@revlet.me with strict SPF, DKIM, and DMARC alignment.
 */

import { google } from 'googleapis'
import { randomUUID } from 'crypto'

export interface SendEmailPayload {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
}

function getGoogleWorkspaceCredentials() {
  const raw = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY
  if (!raw) {
    throw new Error('GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY is not configured.')
  }

  const cleaned = raw.trim().replace(/^['"]|['"]$/g, '')
  let jsonStr: string

  try {
    JSON.parse(cleaned)
    jsonStr = cleaned
  } catch {
    jsonStr = Buffer.from(cleaned, 'base64').toString('utf-8')
  }

  return JSON.parse(jsonStr)
}

/**
 * Strips HTML tags and creates clean plain-text fallback for anti-spam multipart compliance.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rarr;/g, '->')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Sends a transactional email through Google Workspace impersonating accounts@revlet.me
 * Configured with enterprise deliverability headers to prevent spam classification.
 */
export async function sendEmail(payload: SendEmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { 
      to, 
      subject, 
      html, 
      text = htmlToPlainText(html),
      from = 'Revlet Accounts Team <accounts@revlet.me>', 
      replyTo = 'Revlet Accounts Team <noreply@revlet.me>' 
    } = payload

    const credentials = getGoogleWorkspaceCredentials()

    // Using both gmail.send and mail.google.com scopes
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://mail.google.com/'
      ],
      subject: 'accounts@revlet.me',
    })

    const gmail = google.gmail({ version: 'v1', auth })

    const boundary = `----=_Part_${randomUUID().replace(/-/g, '')}`
    const messageId = `<${Date.now()}.${randomUUID()}@revlet.me>`
    const currentDate = new Date().toUTCString()
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`

    // RFC 2822 Multipart/Alternative Email with Anti-Spam Security Headers
    const emailLines = [
      `From: ${from}`,
      `To: ${to}`,
      `Reply-To: ${replyTo}`,
      `Subject: ${utf8Subject}`,
      `Date: ${currentDate}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      'Auto-Submitted: auto-generated',
      'X-Auto-Response-Suppress: All',
      'Precedence: bulk',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(text, 'utf-8').toString('base64'),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html, 'utf-8').toString('base64'),
      '',
      `--${boundary}--`,
    ]

    const rawMessage = emailLines.join('\r\n')
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    })

    return {
      success: true,
      messageId: res.data.id || undefined,
    }
  } catch (error: any) {
    console.error('[sendEmail Error]:', error)
    return {
      success: false,
      error: error?.message || 'Failed to deliver transactional email',
    }
  }
}
