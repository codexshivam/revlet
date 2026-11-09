/**
 * @file sender.ts
 * Enterprise transactional email sender for Revlet Platform.
 * Sends emails via Google Workspace Gmail API using Domain-Wide Delegation
 * impersonating accounts@revlet.me with strict SPF, DKIM, and DMARC alignment.
 */

import { google } from 'googleapis'

export interface SendEmailPayload {
  to: string
  subject: string
  html: string
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
 * Sends a transactional email through Google Workspace impersonating accounts@revlet.me
 */
export async function sendEmail(payload: SendEmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { to, subject, html, from = 'Revlet Platform <accounts@revlet.me>', replyTo = 'accounts@revlet.me' } = payload

    const credentials = getGoogleWorkspaceCredentials()

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: 'accounts@revlet.me',
    })

    const gmail = google.gmail({ version: 'v1', auth })

    // Build RFC 2822 email payload
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`
    const messageParts = [
      `From: ${from}`,
      `To: ${to}`,
      `Reply-To: ${replyTo}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
    ]

    const message = messageParts.join('\r\n')
    const encodedMessage = Buffer.from(message)
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
