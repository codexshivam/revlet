'use server';

import { adminAuth, adminDb } from '@/firebase/admin';
import { sendRevletAlertEmail } from '@/lib/revlet-alerts';

export async function notifySupportTicketEvent(
  idToken: string,
  params: {
    ticketId: string;
    event: 'created' | 'reply';
    subject: string;
    category: string;
    messagePreview?: string;
    recipientEmail?: string;
  }
): Promise<{ success: boolean }> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const callerEmail = (decoded.email || '').toLowerCase().trim();
    const supportInbox = (process.env.REVLET_SUPPORT_EMAIL || 'hello@revlet.me')
      .toLowerCase()
      .trim();

    if (params.event === 'created') {
      if (callerEmail) {
        await sendRevletAlertEmail({
          to: callerEmail,
          subject: `[Revlet Support] Ticket Received: ${params.subject}`,
          title: 'Support Ticket Created',
          subtitle: 'Revlet Help & Support',
          summaryLines: [
            'We have received your support request and our team will review it shortly.',
          ],
          details: [
            { label: 'Ticket ID', value: params.ticketId },
            { label: 'Subject', value: params.subject },
            { label: 'Category', value: params.category },
            { label: 'Status', value: 'Open' },
          ],
          ctaUrl: 'https://app.revlet.me/support',
          ctaLabel: 'View Support Tickets',
        });
      }

      const reporterName =
        typeof decoded.name === 'string' && decoded.name.trim()
          ? decoded.name.trim()
          : callerEmail.split('@')[0] || 'User';
      const reportMessage = (params.messagePreview || '').trim();

      const reportSent = await sendRevletAlertEmail({
        to: 'hello@revlet.me',
        from: 'Revlet Alerts <alerts@revlet.me>',
        senderBadge: 'alerts@revlet.me',
        subject: `[Support Report] Case ${params.ticketId}`,
        title: 'New Support Report Submitted',
        subtitle: `Support Center report from ${reporterName} (${callerEmail || decoded.uid})`,
        summaryLines: [
          reportMessage || 'A user submitted a new support report.',
        ],
        details: [
          { label: 'Case ID', value: params.ticketId },
          { label: 'Subject', value: params.subject },
          { label: 'Category', value: params.category },
          { label: 'Reporter', value: `${reporterName} (${callerEmail || decoded.uid})` },
          { label: 'User UID', value: decoded.uid },
          { label: 'Status', value: 'Open' },
          { label: 'Portal', value: 'app.revlet.me/support' },
        ],
        ctaUrl: 'https://app.revlet.me/support',
        ctaLabel: 'Open Support Console',
      });
      if (!reportSent) {
        const safeTicketId = String(params.ticketId || '').replace(/[\r\n]/g, '');
        console.error('[support] Failed to send support report email to hello@revlet.me for case:', safeTicketId);
      }
      return { success: reportSent };
    }

    // Ticket reply event: only admins can notify the ticket owner, or the ticket owner can notify supportInbox
    const ticketSnap = params.ticketId
      ? await adminDb.collection('supportTickets').doc(params.ticketId).get()
      : null;
    const ticketData = ticketSnap?.exists ? ticketSnap.data() : null;
    const ticketOwnerUid = String(ticketData?.ownerId || ticketData?.userId || '');

    let targetEmail = '';
    if (decoded.admin === true) {
      targetEmail = String(ticketData?.userEmail || ticketData?.ownerEmail || '').toLowerCase().trim();
    } else if (ticketData && ticketOwnerUid === decoded.uid) {
      targetEmail = supportInbox;
    } else {
      return { success: false };
    }

    const storedSubject = String(ticketData?.subject || params.subject || 'Support Ticket');
    const storedCategory = String(ticketData?.category || params.category || 'General');

    if (targetEmail) {
      await sendRevletAlertEmail({
        to: targetEmail,
        subject: `[Revlet Support] New Reply on "${storedSubject}"`,
        title: 'Support Ticket Reply',
        subtitle: 'Revlet Help & Support',
        summaryLines: [
          params.messagePreview
            ? params.messagePreview.slice(0, 300)
            : 'There is a new reply on your support ticket.',
        ],
        details: [
          { label: 'Ticket ID', value: params.ticketId },
          { label: 'Subject', value: storedSubject },
          { label: 'Category', value: storedCategory },
        ],
        ctaUrl: 'https://app.revlet.me/support',
        ctaLabel: 'View Ticket Reply',
      });
    }

    return { success: true };
  } catch {
    return { success: false };
  }
}
