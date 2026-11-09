/**
 * @file verify-email.ts
 * Pixel-perfect branded HTML email template for email verification.
 * Matches Revlet design specifications (clean monochrome minimalist enterprise UI).
 */

export interface VerifyEmailOptions {
  recipientEmail: string
  recipientName?: string
  actionUrl: string
}

export function getVerifyEmailHtml(options: VerifyEmailOptions): string {
  const { recipientEmail, recipientName, actionUrl } = options
  const displayName = recipientName?.trim() || recipientEmail.split('@')[0]

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email for Revlet</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f8fafc;">
  <center>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto;">
      <tr>
        <td style="padding: 12px;">
          <!-- Card Container -->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); overflow: hidden;">
            <tr>
              <td style="padding: 36px 36px 32px 36px;">
                
                <!-- Wordmark Header -->
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 800; letter-spacing: 0.06em; color: #09090b; text-transform: uppercase;">
                  REVLET
                </div>
                
                <!-- Divider -->
                <div style="height: 1px; background-color: #e2e8f0; margin: 20px 0 28px 0; line-height: 1px;">&nbsp;</div>
                
                <!-- Greeting -->
                <div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 14px;">
                  Hello ${displayName},
                </div>
                
                <!-- Body Text -->
                <div style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                  We received a request to verify the primary email address associated with your Revlet account (<span style="color: #0f172a; font-weight: 500;">${recipientEmail}</span>). Please follow the link below to verify your email and activate your account access.
                </div>
                
                <!-- CTA Button -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0 12px 0;">
                  <tr>
                    <td align="center" style="border-radius: 4px; background-color: #000000;">
                      <a href="${actionUrl}" target="_blank" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 26px; display: inline-block; border-radius: 4px;">
                        Verify Email Address &rarr;
                      </a>
                    </td>
                  </tr>
                </table>
                
                <!-- Timer Notice -->
                <div style="font-size: 12px; color: #64748b; margin-bottom: 26px; line-height: 1.4;">
                  <span style="font-size: 13px; vertical-align: -1px;">&#x23F1;</span> This link is valid for 24 hours and can only be used once.
                </div>
                
                <!-- Fallback URL Box -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin: 24px 0 20px 0;">
                  <tr>
                    <td style="padding: 16px 18px;">
                      <div style="font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 8px;">
                        OR PASTE THIS URL INTO YOUR SECURE BROWSER:
                      </div>
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; color: #0f172a; word-break: break-all; line-height: 1.5;">
                            <a href="${actionUrl}" style="color: #0f172a; text-decoration: none;">${actionUrl}</a>
                          </td>
                          <td align="right" valign="top" style="padding-left: 12px; white-space: nowrap;">
                            <span style="display: inline-block; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 8px; font-size: 10px; font-weight: 700; color: #475569; letter-spacing: 0.04em;">
                              &#x29C9; COPY
                            </span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                
                <!-- Security Notice Box -->
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin: 20px 0 28px 0;">
                  <tr>
                    <td width="26" valign="top" style="padding: 14px 0 14px 16px; font-size: 16px; line-height: 1.3;">
                      &#x1F6E1;
                    </td>
                    <td style="padding: 14px 16px 14px 8px; font-size: 13px; color: #334155; line-height: 1.5;">
                      <strong style="color: #0f172a;">Did not sign up for an account?</strong> No further action is required. This link will safely expire.
                    </td>
                  </tr>
                </table>
                
                <!-- Bottom Divider -->
                <div style="height: 1px; background-color: #e2e8f0; margin: 28px 0 22px 0; line-height: 1px;">&nbsp;</div>
                
                <!-- Footer Signoff -->
                <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                  The Revlet Accounts Team
                </div>
                <div style="font-size: 12px; color: #64748b;">
                  Developed and Managed by Shivam Yadav
                </div>
                
              </td>
            </tr>
          </table>
          
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`
}
