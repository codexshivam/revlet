import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import {
  resolveOrganizationOwnerEmail,
  sendRevletAlertEmail,
} from '@/lib/revlet-alerts';

// ============================================================================
// IMMUTABLE SECURITY AUDIT LOGGING
// ============================================================================

export async function logMailAuditEvent(params: {
  orgId: string;
  actorUid: string;
  actorEmail?: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await adminDb
      .collection('organizations')
      .doc(params.orgId)
      .collection('mailAuditLogs')
      .add({
        actorUid: params.actorUid,
        actorEmail: params.actorEmail || null,
        action: params.action,
        target: params.target,
        metadata: params.metadata || {},
        createdAt: new Date().toISOString(),
        timestamp: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.warn('[Revlet Mail Audit] Non-fatal audit log write warning:', err);
  }
}

// ============================================================================
// STALWART MAIL SERVER PRINCIPAL DIRECTORY SYNCHRONIZATION BRIDGE
// ============================================================================

export function getStalwartConfig() {
  const baseUrl = (process.env.STALWART_BASE_URL || process.env.STALWART_API_URL || '').trim().replace(/\/+$/, '');
  const adminUser = (process.env.STALWART_ADMIN_USER || '').trim();
  const adminToken = (process.env.STALWART_ADMIN_TOKEN || process.env.STALWART_ADMIN_PASS || '').trim();
  const enabled = Boolean(baseUrl && adminUser && adminToken);
  const authHeader = enabled
    ? `Basic ${Buffer.from(`${adminUser}:${adminToken}`).toString('base64')}`
    : '';
  return { baseUrl, adminUser, adminToken, authHeader, enabled };
}

export async function callStalwartJmap(
  methodCalls: [string, Record<string, unknown>, string][]
): Promise<any[]> {
  const { baseUrl, authHeader, enabled } = getStalwartConfig();
  if (!enabled) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${baseUrl}/jmap/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        using: [
          'urn:ietf:params:jmap:core',
          'urn:ietf:params:jmap:mail',
          'urn:ietf:params:jmap:submission',
          'urn:stalwart:jmap',
        ],
        methodCalls,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.methodResponses) ? data.methodResponses : [];
  } catch (err: any) {
    console.warn('[Stalwart JMAP] Call deferred:', err?.message || err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function findStalwartAccountByEmail(cleanEmail: string): Promise<any | null> {
  const queryRes = await callStalwartJmap([
    ['x:Account/query', { accountId: 'b', filter: { text: cleanEmail }, limit: 10 }, 'accQuery'],
  ]);
  const queriedIds: string[] = queryRes.find((r) => r[0] === 'x:Account/query')?.[1]?.ids || [];
  if (queriedIds.length > 0) {
    const getRes = await callStalwartJmap([
      ['x:Account/get', { accountId: 'b', ids: queriedIds }, 'accGet'],
    ]);
    const list: any[] = getRes.find((r) => r[0] === 'x:Account/get')?.[1]?.list || [];
    const matched = list.find((a) => (a.emailAddress || '').toLowerCase() === cleanEmail);
    if (matched) return matched;
  }

  // Fallback for Stalwart versions where x:Account/query is unavailable
  const fallbackRes = await callStalwartJmap([
    ['x:Account/get', { accountId: 'b', ids: null, properties: ['id', 'emailAddress', 'name', 'aliases', 'description'] }, 'accList'],
  ]);
  const accList: any[] = fallbackRes.find((r) => r[0] === 'x:Account/get')?.[1]?.list || [];
  return accList.find((a) => (a.emailAddress || '').toLowerCase() === cleanEmail) || null;
}

export async function dispatchStalwartApi(
  method: 'POST' | 'PATCH' | 'DELETE' | 'GET',
  endpoint: string,
  _body?: unknown
): Promise<{ ok: boolean; status: number }> {
  const { enabled } = getStalwartConfig();
  if (!enabled) {
    return { ok: true, status: 200 };
  }

  // If deleting a user principal, also remove via Stalwart JMAP x:Account/set
  if (method === 'DELETE' && endpoint.startsWith('/api/principal/')) {
    const emailTarget = decodeURIComponent(endpoint.replace('/api/principal/', ''))
      .toLowerCase()
      .trim();
    const matched = await findStalwartAccountByEmail(emailTarget);
    if (matched?.id) {
      await callStalwartJmap([
        ['x:Account/set', { accountId: 'b', destroy: [matched.id] }, 'del'],
      ]);
    }
    return { ok: true, status: 200 };
  }

  return { ok: true, status: 200 };
}

export async function ensureStalwartDomainId(domain: string): Promise<string | null> {
  const cleanDomain = domain.toLowerCase().trim();
  if (!cleanDomain) return null;

  const responses = await callStalwartJmap([
    ['x:Domain/get', { accountId: 'b', ids: null }, 'domList'],
  ]);
  const domList: any[] = responses.find((r) => r[0] === 'x:Domain/get')?.[1]?.list || [];
  const existing = domList.find((d) => (d.name || '').toLowerCase() === cleanDomain);
  if (existing?.id) return existing.id;

  const createRes = await callStalwartJmap([
    [
      'x:Domain/set',
      {
        accountId: 'b',
        create: {
          dom0: {
            name: cleanDomain,
            enable: true,
            description: `Revlet Managed Domain (${cleanDomain})`,
            dkimManagement: {
              '@type': 'Automatic',
              algorithms: { Dkim1RsaSha256: true },
              selectorTemplate: 'v{version}-{algorithm}-{date-%Y%m%d}',
              rotateAfter: 7776000000,
              retireAfter: 604800000,
              deleteAfter: 2592000000,
            },
            subAddressing: { '@type': 'Enabled' },
          },
        },
      },
      'createDom',
    ],
    [
      'x:Action/set',
      {
        accountId: 'b',
        create: { act1: { '@type': 'ReloadSettings' } },
      },
      'reloadDom',
    ],
  ]);

  const createdId = createRes.find((r) => r[0] === 'x:Domain/set')?.[1]?.created?.dom0?.id;
  return createdId || null;
}

export async function syncStalwartDomainPrincipal(domain: string) {
  await ensureStalwartDomainId(domain);
}

export async function syncStalwartUserPrincipal(params: {
  primaryEmail: string;
  displayName: string;
  orgUnitPath: string;
  aliases: string[];
  domain: string;
  isCatchAllTarget: boolean;
  plainPassword?: string;
  isCreate?: boolean;
  disabled?: boolean;
}) {
  const cleanEmail = params.primaryEmail.toLowerCase().trim();
  const [localPart, domainPart] = cleanEmail.split('@');
  if (!localPart || !domainPart) return;

  const domainId = await ensureStalwartDomainId(domainPart);
  if (!domainId) return;

  const existingAcc = await findStalwartAccountByEmail(cleanEmail);

  const aliasesMap: Record<string, unknown> = {};
  let aliasIdx = 0;
  for (const alias of params.aliases || []) {
    const cleanAlias = alias.toLowerCase().trim();
    if (cleanAlias && cleanAlias !== cleanEmail) {
      const [aLocal, aDomain] = cleanAlias.split('@');
      if (aLocal && aDomain) {
        const aDomId =
          aDomain === domainPart
            ? domainId
            : await ensureStalwartDomainId(aDomain);
        if (aDomId) {
          aliasesMap[String(aliasIdx++)] = {
            name: aLocal,
            domainId: aDomId,
            enable: true,
          };
        }
      }
    }
  }

  if (!existingAcc) {
    await callStalwartJmap([
      [
        'x:Account/set',
        {
          accountId: 'b',
          create: {
            usr0: {
              '@type': 'User',
              name: localPart,
              domainId,
              description: params.displayName || localPart,
              aliases: aliasesMap,
              roles: { '@type': 'User' },
              permissions: { '@type': 'Inherit' },
              ...(params.plainPassword
                ? {
                    credentials: {
                      '0': {
                        '@type': 'Password',
                        secret: params.plainPassword,
                      },
                    },
                  }
                : {}),
            },
          },
        },
        'createUsr',
      ],
    ]);
    return;
  }

  const updateFields: Record<string, unknown> = {
    description: params.displayName || existingAcc.description || localPart,
    aliases: aliasesMap,
  };
  if (params.disabled) {
    updateFields.credentials = {};
  } else if (params.plainPassword) {
    updateFields.credentials = {
      '0': {
        '@type': 'Password',
        secret: params.plainPassword,
      },
    };
  }

  await callStalwartJmap([
    [
      'x:Account/set',
      {
        accountId: 'b',
        update: {
          [existingAcc.id]: updateFields,
        },
      },
      'updUsr',
    ],
  ]);
}

export async function calculateRollingQuota(orgData: any) {
  const now = new Date();
  const nowMs = now.getTime();
  const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;
  const currentMonthKey = now.toISOString().slice(0, 7);

  // 1. Calculate 24-hour rolling window from hourly buckets
  let dailySentCount = 0;
  const hourlyBuckets: Record<string, number> = orgData.mailHourlyBuckets || {};
  const cleanedHourlyMap = new Map<string, number>();
  let hasHourlyChanges = false;

  for (const [key, count] of Object.entries(hourlyBuckets)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const bucketTime = new Date(key + ':00:00.000Z').getTime();
    if (!isNaN(bucketTime) && bucketTime >= oneDayAgo) {
      const val = typeof count === 'number' ? count : 0;
      dailySentCount += val;
      cleanedHourlyMap.set(key, val);
    } else {
      hasHourlyChanges = true;
    }
  }
  const cleanedHourly: Record<string, number> = Object.fromEntries(cleanedHourlyMap);

  // Fallback for legacy format before hourly buckets
  if (Object.keys(hourlyBuckets).length === 0 && orgData.mailDailyBucket) {
    const legacyDayTime = new Date(orgData.mailDailyBucket + 'T00:00:00.000Z').getTime();
    if (!isNaN(legacyDayTime) && legacyDayTime >= oneDayAgo) {
      dailySentCount = orgData.mailDailySent ?? 0;
    } else {
      dailySentCount = 0; // Expired 24-hour window
    }
  }

  // 2. Calculate Monthly Sent Count for Current Calendar Month
  let monthlySentCount = 0;
  const isCurrentMonth = !orgData.mailMonthlyBucket || orgData.mailMonthlyBucket === currentMonthKey;

  if (isCurrentMonth) {
    const recordedMonthly = orgData.mailMonthlySent ?? 0;
    // Monthly count must accumulate and never drop below recorded monthly or daily sent
    monthlySentCount = Math.max(recordedMonthly, dailySentCount);
  } else {
    // New calendar month rollover
    monthlySentCount = 0;
  }

  return {
    dailySentCount,
    monthlySentCount,
    cleanedHourly,
    cleanedDaily: orgData.mailDailyBuckets || {},
    hasChanges: hasHourlyChanges,
  };
}

/**
 * Permanently purges:
 * 1) All Email Service data for organizations deactivated > 14 days ago.
 * 2) All soft-deleted email user accounts whose 14-day recovery window has expired.
 * Sends branded Revlet Alerts emails from alerts@revlet.me to organization owners.
 */
export async function purgeExpiredMailData(): Promise<{
  purgedOrgsCount: number;
  purgedUsersCount: number;
  notificationsSent: number;
}> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let purgedOrgsCount = 0;
  let purgedUsersCount = 0;
  let notificationsSent = 0;

  // 1. Deactivated Email Service > 14 days -> targeted indexed query instead of full collection scan
  const dueOrgsSnap = await adminDb
    .collection('organizations')
    .where('mailPurgeScheduledAt', '<=', nowIso)
    .get();

  for (const orgDoc of dueOrgsSnap.docs) {
    const orgData = orgDoc.data();
    const orgId = orgDoc.id;
    const domain = (orgData.domain || '').toLowerCase().trim();
    const orgName = orgData.name || domain || orgId;
    const ownerEmail = await resolveOrganizationOwnerEmail(orgData);

    if (!orgData.mailServiceActive && orgData.mailPurgeScheduledAt) {
      const scheduledMs = new Date(orgData.mailPurgeScheduledAt).getTime();
      if (!Number.isNaN(scheduledMs) && scheduledMs <= nowMs) {
        const usersSnap = await orgDoc.ref.collection('mailUsers').get();
        const groupsSnap = await orgDoc.ref.collection('mailGroups').get();
        const ousSnap = await orgDoc.ref.collection('mailOrgUnits').get();

        // Remove user principals from Stalwart
        for (const uDoc of usersSnap.docs) {
          const primaryEmail = (uDoc.data().primaryEmail || '').toLowerCase().trim();
          if (primaryEmail) {
            await dispatchStalwartApi('DELETE', `/api/principal/${encodeURIComponent(primaryEmail)}`);
          }
        }

        // Remove mailing lists & domain from Stalwart
        if (domain) {
          try {
            const mlRes = await callStalwartJmap([
              ['x:MailingList/get', { accountId: 'b', ids: null }, 'mlList'],
            ]);
            const mlList: any[] = mlRes.find((r) => r[0] === 'x:MailingList/get')?.[1]?.list || [];
            const domainMls = mlList
              .filter((m) => (m.emailAddress || '').toLowerCase().endsWith(`@${domain}`))
              .map((m) => m.id)
              .filter(Boolean);
            if (domainMls.length > 0) {
              await callStalwartJmap([
                ['x:MailingList/set', { accountId: 'b', destroy: domainMls }, 'delMls'],
              ]);
            }
            const domRes = await callStalwartJmap([
              ['x:Domain/get', { accountId: 'b', ids: null }, 'domList'],
            ]);
            const domList: any[] = domRes.find((r) => r[0] === 'x:Domain/get')?.[1]?.list || [];
            const matchedDom = domList.find((d) => (d.name || '').toLowerCase() === domain);
            if (matchedDom?.id) {
              await callStalwartJmap([
                ['x:Domain/set', { accountId: 'b', destroy: [matchedDom.id] }, 'delDom'],
              ]);
            }
          } catch (stalwartErr) {
            console.warn('[Stalwart Purge] Domain cleanup warning:', stalwartErr);
          }
        }

        // Delete Firestore subcollections in batches
        const allRefs = [
          ...usersSnap.docs.map((d) => d.ref),
          ...groupsSnap.docs.map((d) => d.ref),
          ...ousSnap.docs.map((d) => d.ref),
        ];
        for (let i = 0; i < allRefs.length; i += 400) {
          const batch = adminDb.batch();
          allRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
          await batch.commit();
        }

        await orgDoc.ref.update({
          mailPurgeScheduledAt: null,
          mailPurgeCompletedAt: nowIso,
          mailCatchAllUserId: null,
          mailCatchAllEmail: null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        await logMailAuditEvent({
          orgId,
          actorUid: 'system-retention-purge',
          actorEmail: 'alerts@revlet.me',
          action: 'MAIL_SERVICE_PURGED_14D',
          target: domain || orgId,
          metadata: {
            deletedUsersCount: usersSnap.size,
            deletedGroupsCount: groupsSnap.size,
            deletedOusCount: ousSnap.size,
          },
        });

        if (ownerEmail) {
          const sent = await sendRevletAlertEmail({
            to: ownerEmail,
            subject: `Email Service data permanently deleted for ${domain || orgName}`,
            title: 'Email Service Data Permanently Deleted',
            subtitle: '14-Day Deactivation Retention Completed',
            summaryLines: [
              `Your 14-day retention period following Email Service deactivation for ${orgName} (${domain}) has ended.`,
              'All mailboxes, aliases, groups, organizational units, and stored email data have been permanently deleted from Revlet mail servers.',
            ],
            details: [
              { label: 'Organization', value: orgName },
              { label: 'Domain', value: domain || '—' },
              { label: 'Removed Accounts', value: String(usersSnap.size) },
              { label: 'Removed Groups', value: String(groupsSnap.size) },
              { label: 'Completed At', value: nowIso },
            ],
          }).catch(() => false);
          if (sent) notificationsSent++;
        }

        purgedOrgsCount++;
      }
    }
  }

  // 2. Active organizations: purge individual soft-deleted accounts past 14-day recovery window
  const activeOrgsSnap = await adminDb
    .collection('organizations')
    .where('mailServiceActive', '==', true)
    .select('domain', 'name', 'ownerId', 'ownerEmail')
    .get();

  for (let idx = 0; idx < activeOrgsSnap.docs.length; idx += 10) {
    const chunk = activeOrgsSnap.docs.slice(idx, idx + 10);
    await Promise.all(
      chunk.map(async (orgDoc) => {
        const orgData = orgDoc.data();
        const orgId = orgDoc.id;
        const domain = (orgData.domain || '').toLowerCase().trim();
        const orgName = orgData.name || domain || orgId;

        const deletedSnap = await orgDoc.ref
          .collection('mailUsers')
          .where('status', '==', 'deleted')
          .get();

        if (deletedSnap.empty) return;

        let ownerEmail: string | null | undefined = undefined;
        for (const uDoc of deletedSnap.docs) {
          const uData = uDoc.data();
          if (!uData.recoverableUntil) continue;
          const expiryMs = new Date(uData.recoverableUntil).getTime();
          if (Number.isNaN(expiryMs) || expiryMs > nowMs) continue;

          if (ownerEmail === undefined) {
            ownerEmail = await resolveOrganizationOwnerEmail(orgData);
          }

          const userEmail = (uData.primaryEmail || '').toLowerCase().trim();
          await uDoc.ref.delete();
          if (userEmail) {
            await dispatchStalwartApi('DELETE', `/api/principal/${encodeURIComponent(userEmail)}`);
          }

          await logMailAuditEvent({
            orgId,
            actorUid: 'system-retention-purge',
            actorEmail: 'alerts@revlet.me',
            action: 'MAIL_USER_PURGED_14D',
            target: userEmail || uDoc.id,
          });

          if (ownerEmail && userEmail) {
            const sent = await sendRevletAlertEmail({
              to: ownerEmail,
              subject: `Email account permanently deleted: ${userEmail}`,
              title: 'Email Account Permanently Deleted',
              subtitle: '14-Day Recovery Window Expired',
              summaryLines: [
                `The deleted email account ${userEmail} in ${orgName} has passed its 14-day recovery window and has been permanently removed from Revlet mail servers.`,
                'All mailbox credentials and associated messages have been erased and cannot be recovered.',
              ],
              details: [
                { label: 'Organization', value: orgName },
                { label: 'Deleted Account', value: userEmail },
                { label: 'Completed At', value: nowIso },
              ],
            }).catch(() => false);
            if (sent) notificationsSent++;
          }

          purgedUsersCount++;
        }
      })
    );
  }

  return {
    purgedOrgsCount,
    purgedUsersCount,
    notificationsSent,
  };
}
