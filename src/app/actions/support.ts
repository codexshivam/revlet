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
    const supportInbox = (process.env.REVLET_SUPPORT_EMAIL || 'support@revlet.me')
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

      if (supportInbox && supportInbox !== callerEmail) {
        await sendRevletAlertEmail({
          to: supportInbox,
          subject: `[Support Queue] New Ticket: ${params.subject}`,
          title: 'New Support Ticket Submitted',
          subtitle: 'Revlet Support Queue',
          summaryLines: [
            params.messagePreview
              ? params.messagePreview.slice(0, 300)
              : 'A user submitted a new support ticket.',
          ],
          details: [
            { label: 'Ticket ID', value: params.ticketId },
            { label: 'From', value: callerEmail || decoded.uid },
            { label: 'Category', value: params.category },
            { label: 'Subject', value: params.subject },
          ],
          ctaUrl: 'https://app.revlet.me/support',
          ctaLabel: 'Open Support Console',
        });
      }
      return { success: true };
    }

    // Ticket reply event: only admins can notify the ticket owner, or the ticket owner can notify supportInbox
    const ticketSnap = params.ticketId
      ? await adminDb.collection('supportTickets').doc(params.ticketId).get()
      : null;
    const ticketData = ticketSnap?.exists ? ticketSnap.data() : null;

    let targetEmail = '';
    if (decoded.admin === true) {
      targetEmail = String(ticketData?.userEmail || '').toLowerCase().trim();
    } else if (ticketData && ticketData.userId === decoded.uid) {
      targetEmail = supportInbox;
    } else {
      return { success: false };
    }

    if (targetEmail) {
      await sendRevletAlertEmail({
        to: targetEmail,
        subject: `[Revlet Support] New Reply on "${params.subject}"`,
        title: 'Support Ticket Reply',
        subtitle: 'Revlet Help & Support',
        summaryLines: [
          params.messagePreview
            ? params.messagePreview.slice(0, 300)
            : 'There is a new reply on your support ticket.',
        ],
        details: [
          { label: 'Ticket ID', value: params.ticketId },
          { label: 'Subject', value: params.subject },
          { label: 'Category', value: params.category },
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
