'use server'

/**
 * @file auth-emails.ts
 * Server actions for generating branded Firebase Auth action links and dispatching
 * pixel-perfect styled transactional emails via the Revlet email infrastructure.
 */

import { adminAuth } from '@/firebase/admin'
import { sendEmail } from '@/lib/email/sender'
import { getPasswordResetEmailHtml } from '@/lib/email/templates/password-reset'
import { getVerifyEmailHtml } from '@/lib/email/templates/verify-email'
import { getEmailChangedHtml } from '@/lib/email/templates/email-changed'

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://app.revlet.me'

/**
 * Transforms Firebase's default action link (e.g. revlet.firebaseapp.com/__/auth/action)
 * to our enterprise custom action handler (https://app.revlet.me/auth/action).
 */
function toBrandedActionUrl(rawLink: string): string {
  try {
    const url = new URL(rawLink)
    const targetUrl = new URL(APP_ORIGIN)
    url.protocol = targetUrl.protocol
    url.host = targetUrl.host
    url.pathname = '/auth/action'
    return url.toString()
  } catch {
    return rawLink.replace(/https:\/\/[^/]+\/__\/auth\/action/, `${APP_ORIGIN}/auth/action`)
  }
}

/**
 * Sends a custom-themed password reset email with our branded action URL.
 */
export async function sendBrandedPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' }
    }

    const trimmedEmail = email.trim().toLowerCase()

    // 1. Fetch user to retrieve display name if available
    let displayName: string | undefined
    try {
      const userRecord = await adminAuth.getUserByEmail(trimmedEmail)
      displayName = userRecord.displayName || undefined
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        // Return friendly error or prevent email enumeration depending on security policy
        return { success: false, error: 'No account found with this email address.' }
      }
      throw err
    }

    // 2. Generate secure reset token via Firebase Admin SDK
    const rawLink = await adminAuth.generatePasswordResetLink(trimmedEmail, {
      url: `${APP_ORIGIN}/login`,
      handleCodeInApp: true,
    })

    // 3. Customize URL to point directly to our app's branded handler
    const brandedActionUrl = toBrandedActionUrl(rawLink)

    // 4. Generate responsive HTML matching Revlet theme
    const html = getPasswordResetEmailHtml({
      recipientEmail: trimmedEmail,
      recipientName: displayName,
      actionUrl: brandedActionUrl,
    })

    // 5. Send through Google Workspace Gmail pipeline
    const sendResult = await sendEmail({
      to: trimmedEmail,
      subject: 'Reset your password for Revlet',
      html,
    })

    if (!sendResult.success) {
      return { success: false, error: sendResult.error || 'Failed to send password reset email.' }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[sendBrandedPasswordResetEmail error]:', error)
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while processing the request.',
    }
  }
}

/**
 * Sends a custom-themed email verification email with our branded action URL.
 */
export async function sendBrandedEmailVerificationEmail(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' }
    }

    const trimmedEmail = email.trim().toLowerCase()

    let displayName: string | undefined
    try {
      const userRecord = await adminAuth.getUserByEmail(trimmedEmail)
      displayName = userRecord.displayName || undefined
    } catch {
      // Proceed even if not found in cache
    }

    const rawLink = await adminAuth.generateEmailVerificationLink(trimmedEmail, {
      url: `${APP_ORIGIN}/account/home`,
      handleCodeInApp: true,
    })

    const brandedActionUrl = toBrandedActionUrl(rawLink)

    const html = getVerifyEmailHtml({
      recipientEmail: trimmedEmail,
      recipientName: displayName,
      actionUrl: brandedActionUrl,
    })

    const sendResult = await sendEmail({
      to: trimmedEmail,
      subject: 'Verify your email for Revlet',
      html,
    })

    if (!sendResult.success) {
      return { success: false, error: sendResult.error || 'Failed to send verification email.' }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[sendBrandedEmailVerificationEmail error]:', error)
    return {
      success: false,
      error: error?.message || 'Failed to dispatch email verification.',
    }
  }
}

/**
 * Sends a security notification and restore link when an email address is changed.
 */
export async function sendBrandedEmailChangedEmail(
  oldEmail: string,
  newEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmedOldEmail = oldEmail.trim().toLowerCase()
    const trimmedNewEmail = newEmail.trim().toLowerCase()

    // Generate sign-in or restore link for original address
    const rawLink = await adminAuth.generateSignInWithEmailLink(trimmedOldEmail, {
      url: `${APP_ORIGIN}/auth/action?mode=recoverEmail`,
      handleCodeInApp: true,
    })

    const brandedRestoreUrl = toBrandedActionUrl(rawLink)

    const html = getEmailChangedHtml({
      recipientEmail: trimmedOldEmail,
      newEmail: trimmedNewEmail,
      restoreUrl: brandedRestoreUrl,
    })

    const sendResult = await sendEmail({
      to: trimmedOldEmail,
      subject: 'Security Alert: Email address changed for Revlet',
      html,
    })

    if (!sendResult.success) {
      return { success: false, error: sendResult.error }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[sendBrandedEmailChangedEmail error]:', error)
    return { success: false, error: error?.message || 'Failed to send security alert.' }
  }
}
