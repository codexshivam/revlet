'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { verifyUserOrgAccess, assertStepUpMfa } from './auth-helper';
import {
  logMailAuditEvent,
  syncStalwartSharedMailboxPrincipal,
  deleteStalwartSharedMailboxPrincipal,
  findStalwartAccountByEmail,
  callStalwartJmap,
} from '@/lib/mail-internal';
import { isEmailAddressTakenInOrg } from './email-service';
import { validateAndSanitizeInput } from '@/lib/security/sanitize';
import {
  COMPLIANCE_ADMIN_PERMISSION,
  SECURITY_ADMIN_PERMISSION,
} from '@/lib/team-permissions';

export interface LegalHoldRecord {
  id: string;
  matterName: string;
  custodianEmails: string[];
  holdAllMailboxes: boolean;
  reason: string;
  status: 'active' | 'released';
  createdBy: string;
  createdAt: string;
  releasedBy?: string | null;
  releasedAt?: string | null;
}

export interface DlpRuleRecord {
  id: string;
  name: string;
  patternType: 'ssn' | 'credit_card' | 'api_key' | 'keyword' | 'regex';
  patternValue: string;
  action: 'quarantine' | 'block' | 'warn_audit';
  enabled: boolean;
  createdAt: string;
}

export interface TransportRuleRecord {
  id: string;
  name: string;
  ruleType: 'append_disclaimer' | 'moderate_external' | 'sandbox_urls' | 'block_attachment_ext';
  configValue: string;
  enabled: boolean;
  createdAt: string;
}

export interface QuarantineItemRecord {
  id: string;
  sender: string;
  recipients: string[];
  subject: string;
  snippet: string;
  reason: 'SPAM' | 'DLP' | 'PHISHING' | 'ATTACHMENT_POLICY';
  matchedRule: string;
  score: number;
  status: 'quarantined' | 'released' | 'deleted';
  receivedAt: string;
}

export interface SharedMailboxDelegate {
  email: string;
  accessLevel: 'FULL_ACCESS' | 'SEND_AS' | 'READ_ONLY';
}

export interface SharedMailboxRecord {
  id: string;
  displayName: string;
  email: string;
  delegates: SharedMailboxDelegate[];
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorUid: string;
  actorEmail: string | null;
  action: string;
  target: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function getGovernanceOverview(idToken: string, orgId: string) {
  try {
    await verifyUserOrgAccess(idToken, orgId, undefined, [
      'Email: Read',
      'Email: Admin',
      SECURITY_ADMIN_PERMISSION,
      COMPLIANCE_ADMIN_PERMISSION,
      'HelpDesk: Admin',
    ]);

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const [holdsSnap, dlpSnap, transportSnap, quarSnap, sharedSnap, auditSnap] = await Promise.all([
      orgRef.collection('mailLegalHolds').orderBy('createdAt', 'desc').get(),
      orgRef.collection('mailDlpRules').orderBy('createdAt', 'desc').get(),
      orgRef.collection('mailTransportRules').orderBy('createdAt', 'desc').get(),
      orgRef.collection('mailQuarantine').orderBy('receivedAt', 'desc').limit(100).get(),
      orgRef.collection('mailSharedMailboxes').orderBy('createdAt', 'desc').get(),
      orgRef.collection('mailAuditLogs').orderBy('createdAt', 'desc').limit(150).get(),
    ]);

    const sharedMailboxes = sharedSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as SharedMailboxRecord[];

    // Non-blocking self-healing reconciliation to ensure all shared mailboxes in Firestore
    // are automatically synchronized in Stalwart Mail Server
    if (sharedMailboxes.length > 0) {
      Promise.allSettled(
        sharedMailboxes.map((sm) =>
          syncStalwartSharedMailboxPrincipal({
            email: sm.email,
            displayName: sm.displayName,
            delegates: Array.isArray(sm.delegates) ? sm.delegates : [],
          })
        )
      ).catch(() => {});
    }

    return {
      success: true,
      data: {
        legalHolds: holdsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as LegalHoldRecord[],
        dlpRules: dlpSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DlpRuleRecord[],
        transportRules: transportSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as TransportRuleRecord[],
        quarantineItems: quarSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as QuarantineItemRecord[],
        sharedMailboxes,
        auditLogs: auditSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AuditLogRecord[],
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load governance data.' };
  }
}

// ============================================================================
// 1. eDiscovery & Legal Hold
// ============================================================================

export async function createLegalHold(
  idToken: string,
  orgId: string,
  input: {
    matterName: string;
    custodianEmails: string[];
    holdAllMailboxes: boolean;
    reason: string;
  },
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      COMPLIANCE_ADMIN_PERMISSION,
      'Email: Admin',
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    const matterRes = validateAndSanitizeInput(input.matterName || '', 'Matter name');
    if (!matterRes.isValid || !matterRes.sanitized) throw new Error(matterRes.error || 'Matter name is required.');
    const matterName = matterRes.sanitized.slice(0, 120);
    const reasonRes = validateAndSanitizeInput(input.reason || 'Litigation Hold', 'Reason');
    const reason = (reasonRes.sanitized || 'Litigation Hold').slice(0, 300);

    const custodians = Array.from(
      new Set(
        (input.custodianEmails || [])
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes('@'))
      )
    );
    if (!input.holdAllMailboxes && custodians.length === 0) {
      throw new Error('Specify at least one custodian email or hold all mailboxes.');
    }

    const record: Omit<LegalHoldRecord, 'id'> = {
      matterName,
      custodianEmails: custodians,
      holdAllMailboxes: Boolean(input.holdAllMailboxes),
      reason,
      status: 'active',
      createdBy: auth.email || auth.uid,
      createdAt: new Date().toISOString(),
    };

    const ref = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailLegalHolds')
      .add({ ...record, timestamp: FieldValue.serverTimestamp() });

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'LEGAL_HOLD_CREATED',
      target: ref.id,
      metadata: { matterName, holdAllMailboxes: record.holdAllMailboxes, custodians },
    });

    return { success: true, data: { id: ref.id, ...record } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create Legal Hold.' };
  }
}

export async function releaseLegalHold(
  idToken: string,
  orgId: string,
  holdId: string,
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      COMPLIANCE_ADMIN_PERMISSION,
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailLegalHolds')
      .doc(holdId)
      .update({
        status: 'released',
        releasedBy: auth.email || auth.uid,
        releasedAt: new Date().toISOString(),
      });

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'LEGAL_HOLD_RELEASED',
      target: holdId,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to release Legal Hold.' };
  }
}

export async function exportEDiscoveryBundle(
  idToken: string,
  orgId: string,
  queryText: string,
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      COMPLIANCE_ADMIN_PERMISSION,
      SECURITY_ADMIN_PERMISSION,
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const [holdsSnap, logsSnap, quarSnap] = await Promise.all([
      orgRef.collection('mailLegalHolds').get(),
      orgRef.collection('mailAuditLogs').orderBy('createdAt', 'desc').limit(500).get(),
      orgRef.collection('mailQuarantine').orderBy('receivedAt', 'desc').limit(200).get(),
    ]);

    const q = (queryText || '').trim().toLowerCase();
    const filterMatch = (obj: any) =>
      !q || JSON.stringify(obj).toLowerCase().includes(q);

    const bundle = {
      exportedAt: new Date().toISOString(),
      exportedBy: auth.email || auth.uid,
      orgId,
      query: q || '*',
      legalHolds: holdsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(filterMatch),
      auditTrail: logsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(filterMatch),
      quarantinedEvidence: quarSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(filterMatch),
    };

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'EDISCOVERY_EXPORT',
      target: orgId,
      metadata: { query: q || '*' },
    });

    return { success: true, data: bundle };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to export eDiscovery bundle.' };
  }
}

// ============================================================================
// 2. DLP & Transport / Mail Flow Rules
// ============================================================================

export async function saveDlpRule(
  idToken: string,
  orgId: string,
  input: {
    name: string;
    patternType: DlpRuleRecord['patternType'];
    patternValue: string;
    action: DlpRuleRecord['action'];
  },
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      SECURITY_ADMIN_PERMISSION,
      COMPLIANCE_ADMIN_PERMISSION,
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    const nameRes = validateAndSanitizeInput(input.name || '', 'Rule name');
    if (!nameRes.isValid || !nameRes.sanitized) throw new Error(nameRes.error || 'Rule name is required.');
    const name = nameRes.sanitized.slice(0, 100);

    const record: Omit<DlpRuleRecord, 'id'> = {
      name,
      patternType: input.patternType,
      patternValue: (input.patternValue || '').trim(),
      action: input.action,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    const ref = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailDlpRules')
      .add(record);

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'DLP_RULE_CREATED',
      target: ref.id,
      metadata: { name, patternType: record.patternType, action: record.action },
    });

    return { success: true, data: { id: ref.id, ...record } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create DLP rule.' };
  }
}

export async function deleteDlpRule(
  idToken: string,
  orgId: string,
  ruleId: string,
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      SECURITY_ADMIN_PERMISSION,
      COMPLIANCE_ADMIN_PERMISSION,
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailDlpRules')
      .doc(ruleId)
      .delete();

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'DLP_RULE_DELETED',
      target: ruleId,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete DLP rule.' };
  }
}

export async function saveTransportRule(
  idToken: string,
  orgId: string,
  input: {
    name: string;
    ruleType: TransportRuleRecord['ruleType'];
    configValue: string;
  },
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      COMPLIANCE_ADMIN_PERMISSION,
      SECURITY_ADMIN_PERMISSION,
      'Email: Admin',
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    const nameRes = validateAndSanitizeInput(input.name || '', 'Rule name');
    if (!nameRes.isValid || !nameRes.sanitized) throw new Error(nameRes.error || 'Rule name is required.');
    const name = nameRes.sanitized.slice(0, 100);

    const record: Omit<TransportRuleRecord, 'id'> = {
      name,
      ruleType: input.ruleType,
      configValue: (input.configValue || '').trim(),
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    const ref = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailTransportRules')
      .add(record);

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'TRANSPORT_RULE_CREATED',
      target: ref.id,
      metadata: { name, ruleType: record.ruleType },
    });

    return { success: true, data: { id: ref.id, ...record } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create transport rule.' };
  }
}

export async function deleteTransportRule(
  idToken: string,
  orgId: string,
  ruleId: string,
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      COMPLIANCE_ADMIN_PERMISSION,
      SECURITY_ADMIN_PERMISSION,
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailTransportRules')
      .doc(ruleId)
      .delete();

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'TRANSPORT_RULE_DELETED',
      target: ruleId,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete transport rule.' };
  }
}

// ============================================================================
// 3. Quarantine Console
// ============================================================================

export async function resolveQuarantineItem(
  idToken: string,
  orgId: string,
  itemId: string,
  decision: 'released' | 'deleted',
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      SECURITY_ADMIN_PERMISSION,
      'Email: Admin',
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    const itemRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailQuarantine')
      .doc(itemId);
    const itemSnap = await itemRef.get();
    const itemData = itemSnap.data() || {};

    await itemRef.update({
      status: decision,
      resolvedBy: auth.email || auth.uid,
      resolvedAt: new Date().toISOString(),
    });

    // When an admin releases a quarantined message, attempt JMAP delivery via Stalwart + AWS SES
    if (decision === 'released' && itemData.sender && Array.isArray(itemData.recipients) && itemData.recipients.length > 0) {
      try {
        const senderEmail = String(itemData.sender).toLowerCase().trim();
        const recipients: string[] = itemData.recipients
          .map((r: unknown) => String(r || '').toLowerCase().trim())
          .filter((r: string) => r.includes('@'));
        const acc = await findStalwartAccountByEmail(senderEmail);
        if (acc?.id && recipients.length > 0) {
          const metaRes = await callStalwartJmap([
            ['Mailbox/get', { accountId: acc.id, ids: null }, 'mb'],
            ['Identity/get', { accountId: acc.id, ids: null }, 'id'],
          ]);
          const mbList: any[] = metaRes.find((r) => r[0] === 'Mailbox/get')?.[1]?.list || [];
          const idList: any[] = metaRes.find((r) => r[0] === 'Identity/get')?.[1]?.list || [];
          const sentMb =
            mbList.find((m) => (m.role || '').toLowerCase() === 'sent') ||
            mbList.find((m) => (m.role || '').toLowerCase() === 'inbox') ||
            mbList[0];
          const sentMailboxId = sentMb?.id || 'e';
          const identityId = idList[0]?.id || 'b';
          const bodyText = String(itemData.bodyText || itemData.snippet || '');
          await callStalwartJmap([
            [
              'Email/set',
              {
                accountId: acc.id,
                create: {
                  relMsg: {
                    mailboxIds: { [sentMailboxId]: true },
                    keywords: { $seen: true },
                    from: [{ name: senderEmail.split('@')[0], email: senderEmail }],
                    to: recipients.map((email) => ({ name: email.split('@')[0], email })),
                    subject: String(itemData.subject || '(Released Message)'),
                    bodyValues: { text: { value: bodyText } },
                    textBody: [{ partId: 'text', type: 'text/plain' }],
                  },
                },
              },
              'cRel',
            ],
            [
              'EmailSubmission/set',
              {
                accountId: acc.id,
                create: {
                  relSub: {
                    emailId: '#relMsg',
                    identityId,
                    envelope: {
                      mailFrom: { email: senderEmail, parameters: null },
                      rcptTo: recipients.map((email) => ({ email, parameters: null })),
                    },
                  },
                },
              },
              'sRel',
            ],
          ]);
        }
      } catch (releaseErr) {
        console.warn('[Quarantine Release] Delivery attempt warning:', releaseErr);
      }
    }

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: decision === 'released' ? 'QUARANTINE_RELEASED' : 'QUARANTINE_DELETED',
      target: itemData.subject ? `${itemId} (${itemData.subject})` : itemId,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update quarantine item.' };
  }
}

// ============================================================================
// 4. Shared Mailboxes
// ============================================================================

export async function createSharedMailbox(
  idToken: string,
  orgId: string,
  input: {
    displayName: string;
    localPart: string;
    delegates: SharedMailboxDelegate[];
  }
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    const orgData = auth.orgData;
    const domain = (orgData?.domain || '').toLowerCase().trim();
    if (!domain) throw new Error('Organization domain is not configured.');

    const dnRes = validateAndSanitizeInput(input.displayName || '', 'Display name');
    const displayName = (dnRes.sanitized || '').slice(0, 80);
    const localPart = input.localPart
      .trim()
      .toLowerCase()
      .replace(/@.*$/, '')
      .replace(/[^a-z0-9._-]/g, '');
    if (!displayName || !localPart) {
      throw new Error('Display name and email local part are required.');
    }

    const email = `${localPart}@${domain}`;
    const conflict = await isEmailAddressTakenInOrg(orgId, email);
    if (conflict) {
      throw new Error(conflict);
    }

    const seenDelegates = new Map<string, SharedMailboxDelegate>();
    for (const d of input.delegates || []) {
      const dEmail = (d.email || '').trim().toLowerCase();
      if (dEmail && dEmail.includes('@') && dEmail !== email) {
        seenDelegates.set(dEmail, {
          email: dEmail,
          accessLevel: d.accessLevel || 'FULL_ACCESS',
        });
      }
    }
    const delegates = Array.from(seenDelegates.values());

    await syncStalwartSharedMailboxPrincipal({
      email,
      displayName,
      delegates,
    });

    const record: Omit<SharedMailboxRecord, 'id'> = {
      displayName,
      email,
      delegates,
      createdAt: new Date().toISOString(),
    };

    const ref = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailSharedMailboxes')
      .add(record);

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'SHARED_MAILBOX_CREATED',
      target: email,
      metadata: { delegates },
    });

    return { success: true, data: { id: ref.id, ...record } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create shared mailbox.' };
  }
}

export async function updateSharedMailboxDelegates(
  idToken: string,
  orgId: string,
  mailboxId: string,
  delegatesInput: SharedMailboxDelegate[],
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    assertStepUpMfa(auth.uid, stepUpToken);

    const docRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailSharedMailboxes')
      .doc(mailboxId);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new Error('Shared mailbox not found.');
    }
    const existing = snap.data() as Omit<SharedMailboxRecord, 'id'>;
    const mailboxEmail = (existing.email || '').toLowerCase().trim();

    const seenDelegates = new Map<string, SharedMailboxDelegate>();
    for (const d of delegatesInput || []) {
      const dEmail = (d.email || '').trim().toLowerCase();
      if (dEmail && dEmail.includes('@') && dEmail !== mailboxEmail) {
        seenDelegates.set(dEmail, {
          email: dEmail,
          accessLevel: d.accessLevel || 'FULL_ACCESS',
        });
      }
    }
    const delegates = Array.from(seenDelegates.values());

    await syncStalwartSharedMailboxPrincipal({
      email: mailboxEmail,
      displayName: existing.displayName || mailboxEmail.split('@')[0],
      delegates,
    });

    await docRef.update({
      delegates,
      updatedAt: new Date().toISOString(),
    });

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'SHARED_MAILBOX_DELEGATES_UPDATED',
      target: mailboxEmail || mailboxId,
      metadata: { delegates },
    });

    return {
      success: true,
      data: {
        id: mailboxId,
        ...existing,
        delegates,
      } as SharedMailboxRecord,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update shared mailbox delegates.' };
  }
}

export async function deleteSharedMailbox(
  idToken: string,
  orgId: string,
  mailboxId: string,
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, ['Email: Admin']);
    assertStepUpMfa(auth.uid, stepUpToken);

    const docRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailSharedMailboxes')
      .doc(mailboxId);
    const snap = await docRef.get();
    const mailboxEmail = snap.exists ? String(snap.data()?.email || '').toLowerCase().trim() : '';

    if (mailboxEmail) {
      await deleteStalwartSharedMailboxPrincipal(mailboxEmail);
    }

    await docRef.delete();

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'SHARED_MAILBOX_DELETED',
      target: mailboxEmail || mailboxId,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete shared mailbox.' };
  }
}

// ============================================================================
// 5. Persistent SIEM / Audit Log Export
// ============================================================================

export async function exportSiemAuditLogs(
  idToken: string,
  orgId: string,
  format: 'json' | 'ndjson' | 'csv' | 'cef',
  stepUpToken?: string
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      SECURITY_ADMIN_PERMISSION,
      COMPLIANCE_ADMIN_PERMISSION,
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    const snap = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailAuditLogs')
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();

    const logs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AuditLogRecord[];

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'SIEM_AUDIT_EXPORTED',
      target: orgId,
      metadata: { format, count: logs.length },
    });

    let content = '';
    if (format === 'json') {
      content = JSON.stringify(logs, null, 2);
    } else if (format === 'ndjson') {
      content = logs.map((l) => JSON.stringify(l)).join('\n');
    } else if (format === 'csv') {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      content = [
        'id,createdAt,actorUid,actorEmail,action,target,metadata',
        ...logs.map((l) =>
          [l.id, l.createdAt, l.actorUid, l.actorEmail || '', l.action, l.target, JSON.stringify(l.metadata || {})]
            .map(esc)
            .join(',')
        ),
      ].join('\n');
    } else {
      // CEF (Common Event Format) for SIEM ingestion (Splunk, QRadar, Sentinel)
      content = logs
        .map(
          (l) =>
            `CEF:0|Revlet|ControlPlane|1.0|${l.action}|${l.action}|5|rt=${l.createdAt} suser=${l.actorEmail || l.actorUid} cs1=${l.target} cs1Label=Target`
        )
        .join('\n');
    }

    return { success: true, content, count: logs.length };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to export SIEM audit logs.' };
  }
}

export async function getOrganizationSecurityPolicy(idToken: string, orgId: string) {
  try {
    await verifyUserOrgAccess(idToken, orgId, SECURITY_ADMIN_PERMISSION);
    const snap = await adminDb.collection('organizations').doc(orgId).get();
    if (!snap.exists) return { success: false, error: 'Organization not found.' };
    const data = snap.data() || {};
    return {
      success: true,
      enforceMfa: Boolean(data.enforceMfa),
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load security policy.' };
  }
}

export async function setOrganizationEnforceMfa(
  idToken: string,
  orgId: string,
  enforceMfa: boolean,
  stepUpToken?: string
) {
  try {
    const { uid, email } = await verifyUserOrgAccess(idToken, orgId, SECURITY_ADMIN_PERMISSION);
    await assertStepUpMfa(uid, stepUpToken);
    await adminDb.collection('organizations').doc(orgId).set(
      {
        enforceMfa: Boolean(enforceMfa),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await logMailAuditEvent({
      orgId,
      actorUid: uid,
      actorEmail: email || undefined,
      action: enforceMfa ? 'ORG_MFA_ENFORCED' : 'ORG_MFA_RELAXED',
      target: orgId,
      metadata: { enforceMfa: Boolean(enforceMfa) },
    });
    return { success: true, enforceMfa: Boolean(enforceMfa) };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update MFA enforcement policy.' };
  }
}
