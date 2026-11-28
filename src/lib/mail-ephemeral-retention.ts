import { adminDb } from '@/firebase/admin';
import { callStalwartJmap, findStalwartAccountById, logMailAuditEvent } from '@/lib/mail-internal';

const POLICY = 'EPHEMERAL_21D';
const MAX_MESSAGES_PER_MAILBOX = 100;

export async function reconcileEphemeralMail() {
  const now = Date.now();
  const cutoff = new Date(now - 21 * 24 * 60 * 60 * 1000).toISOString();
  const dryRun = process.env.REVLET_ENABLE_EPHEMERAL_PURGE !== 'true';
  const report = {
    cutoff, dryRun, organizations: 0, mailboxes: 0, heldOrganizations: 0,
    candidates: 0, destroyed: 0, failedMailboxes: 0, morePending: 0,
  };
  const orgs = await adminDb.collection('organizations').where('mailRetentionPolicy', '==', POLICY).get();
  for (const org of orgs.docs) {
    const orgData = org.data();
    if (orgData.mailServiceActive !== true || orgData.status === 'suspended') continue;
    const domain = String(orgData.mailDomain || orgData.domain || '').toLowerCase().trim();
    const binding = domain ? await adminDb.collection('mailDomainBindings').doc(domain).get() : null;
    if (binding?.data()?.orgId !== org.id) continue;
    report.organizations++;

    const holds = org.ref.collection('mailLegalHolds').where('status', '==', 'active').limit(1);
    if (!(await holds.get()).empty) {
      // Preserve the entire tenant when an active hold exists.
      report.heldOrganizations++;
      continue;
    }
    const mailboxes = await org.ref.collection('mailUsers').where('status', '==', 'active').get();
    for (const mailbox of mailboxes.docs) {
      report.mailboxes++;
      const { primaryEmail, stalwartAccountId } = mailbox.data();
      if (typeof primaryEmail !== 'string' || typeof stalwartAccountId !== 'string') {
        report.failedMailboxes++;
        continue;
      }
      const account = await findStalwartAccountById(stalwartAccountId);
      if (String(account?.emailAddress || '').toLowerCase() !== primaryEmail.toLowerCase()) {
        report.failedMailboxes++;
        continue;
      }
      const accountId = stalwartAccountId;
      const responses = await callStalwartJmap([
        ['Email/query', { accountId, filter: {
          operator: 'AND',
          conditions: [
            { before: cutoff, notKeyword: '$flagged' },
            { notKeyword: '$draft' },
          ],
        }, limit: MAX_MESSAGES_PER_MAILBOX, calculateTotal: true }, 'q'],
        ['Email/get', { accountId,
          '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
          properties: ['id', 'keywords', 'receivedAt'],
        }, 'g'],
      ]);
      const query = responses.find(([method, , call]) => method === 'Email/query' && call === 'q')?.[1];
      const details = responses.find(([method, , call]) => method === 'Email/get' && call === 'g')?.[1];
      if (!Array.isArray(query?.ids) || !Array.isArray(details?.list) || typeof details.state !== 'string') {
        report.failedMailboxes++;
        continue;
      }
      const eligibleIds = details.list.filter((item: any) =>
        typeof item.id === 'string' && !item.keywords?.$flagged && !item.keywords?.$draft &&
        typeof item.receivedAt === 'string' && Date.parse(item.receivedAt) < Date.parse(cutoff)
      ).map((item: any) => item.id);
      report.candidates += eligibleIds.length;
      if (query.total > query.ids.length || query.ids.length === MAX_MESSAGES_PER_MAILBOX) report.morePending++;
      if (dryRun || eligibleIds.length === 0) continue;

      const [currentOrg, currentMailbox, currentHolds, currentBinding] = await Promise.all([
        org.ref.get(), mailbox.ref.get(), holds.get(), binding!.ref.get(),
      ]);
      const updated = currentOrg.data();
      const current = currentMailbox.data();
      if (!currentHolds.empty || updated?.mailServiceActive !== true ||
          updated?.status === 'suspended' || updated?.mailRetentionPolicy !== POLICY ||
          currentBinding.data()?.orgId !== org.id || current?.status !== 'active' ||
          current.stalwartAccountId !== accountId || current.primaryEmail !== primaryEmail) continue;

      const removal = await callStalwartJmap([
        ['Email/set', { accountId, ifInState: details.state, destroy: eligibleIds }, 'd'],
      ]);
      const result = removal.find(([method, , call]) => method === 'Email/set' && call === 'd')?.[1];
      const destroyed = Array.isArray(result?.destroyed) ? result.destroyed.length : 0;
      report.destroyed += destroyed;
      if (destroyed !== eligibleIds.length) report.failedMailboxes++;
      if (destroyed) {
        await logMailAuditEvent({ orgId: org.id, actorUid: 'system-cron',
          action: 'MAIL_EPHEMERAL_RETENTION_PURGED', target: mailbox.id, metadata: { cutoff, destroyed },
        });
      }
    }
  }
  return report;
}
