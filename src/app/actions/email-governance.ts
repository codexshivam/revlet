'use server';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/firebase/admin';
import { verifyUserOrgAccess, assertStepUpMfa, hasOrgPermission } from './auth-helper';
import {
  assertActiveMailDomainBinding,
  isEmailAddressTakenInOrg,
  logMailAuditEvent,
  syncStalwartSharedMailboxPrincipal,
  deleteStalwartSharedMailboxPrincipal,
  findStalwartAccountByEmail,
  callStalwartJmap,
} from '@/lib/mail-internal';
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
    // Restrict sensitive governance data to authorized administrative roles and
    // scope each dataset to the caller's specific capability.
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      'Email: Admin',
      SECURITY_ADMIN_PERMISSION,
      COMPLIANCE_ADMIN_PERMISSION,
    ]);

    const canEmailAdmin = hasOrgPermission(auth.permissions, 'Email: Admin');
    const canSecurityAdmin = hasOrgPermission(auth.permissions, SECURITY_ADMIN_PERMISSION);
    const canComplianceAdmin = hasOrgPermission(auth.permissions, COMPLIANCE_ADMIN_PERMISSION);

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const [holdsSnap, dlpSnap, transportSnap, quarSnap, sharedSnap, auditSnap, usersSnap] = await Promise.all([
      canComplianceAdmin
        ? orgRef.collection('mailLegalHolds').orderBy('createdAt', 'desc').get()
        : Promise.resolve(null),
      canSecurityAdmin
        ? orgRef.collection('mailDlpRules').orderBy('createdAt', 'desc').get()
        : Promise.resolve(null),
      canEmailAdmin || canSecurityAdmin
        ? orgRef.collection('mailTransportRules').orderBy('createdAt', 'desc').get()
        : Promise.resolve(null),
      canEmailAdmin || canSecurityAdmin
        ? orgRef.collection('mailQuarantine').orderBy('receivedAt', 'desc').limit(100).get()
        : Promise.resolve(null),
      canEmailAdmin
        ? orgRef.collection('mailSharedMailboxes').orderBy('createdAt', 'desc').get()
        : Promise.resolve(null),
      canSecurityAdmin || canComplianceAdmin
        ? orgRef.collection('mailAuditLogs').orderBy('createdAt', 'desc').limit(150).get()
        : Promise.resolve(null),
      canEmailAdmin
        ? orgRef.collection('mailUsers').get()
        : Promise.resolve(null),
    ]);

    const domainUsers = (usersSnap?.docs || [])
      .map((d) => {
        const u = d.data() || {};
        const email = String(u.primaryEmail || u.email || '').trim().toLowerCase();
        const displayName = String(
          u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || email.split('@')[0]
        ).trim();
        return {
          email,
          displayName,
          status: String(u.status || 'active'),
        };
      })
      .filter((u) => u.email && u.status === 'active')
      .map(({ email, displayName }) => ({ email, displayName }))
      .sort((a, b) => a.email.localeCompare(b.email));

    const legalHolds: LegalHoldRecord[] = (holdsSnap?.docs || []).map((d) => {
      const v = d.data() || {};
      return {
        id: d.id,
        matterName: String(v.matterName || ''),
        custodianEmails: Array.isArray(v.custodianEmails) ? v.custodianEmails : [],
        holdAllMailboxes: Boolean(v.holdAllMailboxes),
        reason: String(v.reason || ''),
        status: v.status === 'released' ? 'released' : 'active',
        createdBy: String(v.createdBy || ''),
        createdAt: String(v.createdAt || ''),
        releasedBy: v.releasedBy ?? null,
        releasedAt: v.releasedAt ?? null,
      };
    });

    const dlpRules: DlpRuleRecord[] = (dlpSnap?.docs || []).map((d) => {
      const v = d.data() || {};
      return {
        id: d.id,
        name: String(v.name || ''),
        patternType: v.patternType,
        patternValue: String(v.patternValue || ''),
        action: v.action,
        enabled: Boolean(v.enabled),
        createdAt: String(v.createdAt || ''),
      };
    });

    const transportRules: TransportRuleRecord[] = (transportSnap?.docs || []).map((d) => {
      const v = d.data() || {};
      return {
        id: d.id,
        name: String(v.name || ''),
        ruleType: v.ruleType,
        configValue: String(v.configValue || ''),
        enabled: Boolean(v.enabled),
        createdAt: String(v.createdAt || ''),
      };
    });

    const quarantineItems: QuarantineItemRecord[] = (quarSnap?.docs || []).map((d) => {
      const v = d.data() || {};
      return {
        id: d.id,
        sender: String(v.sender || ''),
        recipients: Array.isArray(v.recipients) ? v.recipients : [],
        subject: String(v.subject || ''),
        snippet: String(v.snippet || ''),
        reason: v.reason || 'DLP',
        matchedRule: String(v.matchedRule || ''),
        score: typeof v.score === 'number' ? v.score : 0,
        status: v.status || 'quarantined',
        receivedAt: String(v.receivedAt || ''),
      };
    });

    const sharedMailboxes: SharedMailboxRecord[] = (sharedSnap?.docs || []).map((d) => {
      const v = d.data() || {};
      return {
        id: d.id,
        displayName: String(v.displayName || ''),
        email: String(v.email || ''),
        delegates: Array.isArray(v.delegates) ? v.delegates : [],
        createdAt: String(v.createdAt || ''),
      };
    });

    const auditLogs: AuditLogRecord[] = (auditSnap?.docs || []).map((d) => {
      const v = d.data() || {};
      return {
        id: d.id,
        actorUid: String(v.actorUid || ''),
        actorEmail: v.actorEmail ? String(v.actorEmail) : null,
        action: String(v.action || ''),
        target: String(v.target || ''),
        metadata: v.metadata && typeof v.metadata === 'object' ? v.metadata : {},
        createdAt: String(v.createdAt || ''),
      };
    });

    return {
      success: true,
      data: {
        legalHolds,
        dlpRules,
        transportRules,
        quarantineItems,
        sharedMailboxes,
        domainUsers,
        auditLogs,
        capabilities: {
          canEmailAdmin,
          canSecurityAdmin,
          canComplianceAdmin,
        },
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
  stepUpToken?: string,
  scope?: {
    custodianEmail?: string;
    startDate?: string;
    endDate?: string;
  }
) {
  try {
    const auth = await verifyUserOrgAccess(idToken, orgId, undefined, [
      COMPLIANCE_ADMIN_PERMISSION,
      SECURITY_ADMIN_PERMISSION,
    ]);
    assertStepUpMfa(auth.uid, stepUpToken);

    const AUDIT_LIMIT = 500;
    const QUARANTINE_LIMIT = 200;
    const orgRef = adminDb.collection('organizations').doc(orgId);
    const [holdsSnap, logsSnap, quarSnap] = await Promise.all([
      orgRef.collection('mailLegalHolds').get(),
      orgRef.collection('mailAuditLogs').orderBy('createdAt', 'desc').limit(AUDIT_LIMIT).get(),
      orgRef.collection('mailQuarantine').orderBy('receivedAt', 'desc').limit(QUARANTINE_LIMIT).get(),
    ]);

    const q = (queryText || '').trim().toLowerCase();
    const custodian = (scope?.custodianEmail || '').trim().toLowerCase();
    const startMs = scope?.startDate ? new Date(scope.startDate).getTime() : NaN;
    const endMs = scope?.endDate ? new Date(scope.endDate).getTime() : NaN;

    const withinDateRange = (iso?: string) => {
      if (!iso || (Number.isNaN(startMs) && Number.isNaN(endMs))) return true;
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return true;
      if (!Number.isNaN(startMs) && t < startMs) return false;
      if (!Number.isNaN(endMs) && t > endMs) return false;
      return true;
    };

    const filterMatch = (obj: any, timestampField: string) => {
      if (!withinDateRange(obj?.[timestampField])) return false;
      const serialized = JSON.stringify(obj).toLowerCase();
      if (custodian && !serialized.includes(custodian)) return false;
      if (q && !serialized.includes(q)) return false;
      return true;
    };

    const legalHolds = holdsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => filterMatch(o, 'createdAt'));
    const auditTrail = logsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => filterMatch(o, 'createdAt'));
    const quarantinedEvidence = quarSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => filterMatch(o, 'receivedAt'));

    const exportedAt = new Date().toISOString();
    const bundle = {
      manifest: {
        exportType: 'governance_metadata_and_quarantine',
        exportedAt,
        exportedBy: auth.email || auth.uid,
        orgId,
        scope: {
          query: q || '*',
          custodianEmail: custodian || null,
          startDate: scope?.startDate || null,
          endDate: scope?.endDate || null,
        },
        counts: {
          legalHolds: legalHolds.length,
          auditTrail: auditTrail.length,
          quarantinedEvidence: quarantinedEvidence.length,
        },
        truncated: {
          auditTrail: logsSnap.size >= AUDIT_LIMIT,
          quarantinedEvidence: quarSnap.size >= QUARANTINE_LIMIT,
        },
        includesRetainedMailboxMessages: false,
        limitations:
          'Exports legal hold records, governance audit logs (up to 500), and quarantined message records (up to 200). Live mailbox contents and attachments are not included.',
      },
      exportedAt,
      exportedBy: auth.email || auth.uid,
      orgId,
      query: q || '*',
      legalHolds,
      auditTrail,
      quarantinedEvidence,
    };

    await logMailAuditEvent({
      orgId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'EDISCOVERY_EXPORT',
      target: orgId,
      metadata: {
        query: q || '*',
        custodianEmail: custodian || null,
        counts: bundle.manifest.counts,
      },
    });

    return { success: true, data: bundle };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to export governance metadata bundle.' };
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
    if (!itemSnap.exists) {
      return { success: false, error: 'Quarantine item not found.' };
    }
    const itemData = itemSnap.data() || {};

    if (decision === 'released') {
      const boundDomain = await assertActiveMailDomainBinding(orgId, auth.orgData);

      // Atomically claim release_pending inside a transaction so concurrent release
      // clicks cannot submit duplicate messages.
      const claimResult = await adminDb.runTransaction(async (tx) => {
        const freshSnap = await tx.get(itemRef);
        if (!freshSnap.exists) {
          return { outcome: 'missing' as const };
        }
        const fd = freshSnap.data() || {};
        if (fd.status === 'released') return { outcome: 'already_released' as const };
        if (fd.status === 'release_pending') return { outcome: 'in_progress' as const };
        if (fd.status === 'deleted') return { outcome: 'deleted' as const };

        const senderEmail = String(fd.sender || '').toLowerCase().trim();
        const senderDomain = (senderEmail.split('@')[1] || '').toLowerCase().trim();
        if (!senderDomain || senderDomain !== boundDomain) {
          return {
            outcome: 'wrong_domain' as const,
            error: `Sender "${senderEmail}" does not belong to this organization's verified domain (@${boundDomain}).`,
          };
        }
        const recipients: string[] = Array.isArray(fd.recipients)
          ? fd.recipients
              .map((r: unknown) => String(r || '').toLowerCase().trim())
              .filter((r: string) => r.includes('@'))
          : [];
        if (!senderEmail || recipients.length === 0) {
          return {
            outcome: 'missing_fields' as const,
            error: 'Quarantined message is missing sender or recipient details and cannot be released.',
          };
        }

        if (fd.bodyTruncated === true) {
          return {
            outcome: 'incomplete' as const,
            error: 'This quarantined message body was truncated at capture and cannot be safely released automatically.',
          };
        }
        if (Array.isArray(fd.attachments) && fd.attachments.length > 0) {
          return {
            outcome: 'incomplete' as const,
            error: 'This quarantined message had attachments that are not preserved in quarantine storage and cannot be released intact.',
          };
        }

        tx.update(itemRef, {
          status: 'release_pending',
          releaseAttemptedBy: auth.email || auth.uid,
          releaseAttemptedAt: new Date().toISOString(),
          releaseError: FieldValue.delete(),
        });
        return { outcome: 'claimed' as const, senderEmail, recipients };
      });

      if (claimResult.outcome === 'missing') return { success: false, error: 'Quarantine item not found.' };
      if (claimResult.outcome === 'already_released') return { success: true };
      if (claimResult.outcome === 'in_progress') {
        return { success: false, error: 'A release attempt is already in progress for this item.' };
      }
      if (claimResult.outcome === 'deleted') {
        return { success: false, error: 'Deleted quarantine items cannot be released.' };
      }
      if (
        claimResult.outcome === 'wrong_domain' ||
        claimResult.outcome === 'missing_fields' ||
        claimResult.outcome === 'incomplete'
      ) {
        return { success: false, error: claimResult.error };
      }

      const { senderEmail, recipients } = claimResult;

      let deliveryError: string | null = null;
      try {
        const acc = await findStalwartAccountByEmail(senderEmail);
        if (!acc?.id) {
          deliveryError = `Sender mailbox "${senderEmail}" could not be resolved on the mail server.`;
        } else {
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
          const bodyHtml = typeof itemData.bodyHtml === 'string' && itemData.bodyHtml.trim() ? itemData.bodyHtml : '';
          const jmapRes = await callStalwartJmap([
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
                    bodyValues: bodyHtml
                      ? { text: { value: bodyText }, html: { value: bodyHtml } }
                      : { text: { value: bodyText } },
                    textBody: [{ partId: 'text', type: 'text/plain' }],
                    ...(bodyHtml ? { htmlBody: [{ partId: 'html', type: 'text/html' }] } : {}),
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

          const emailSetResp = jmapRes.find((r) => r[0] === 'Email/set' && r[2] === 'cRel')?.[1];
          const subSetResp = jmapRes.find((r) => r[0] === 'EmailSubmission/set' && r[2] === 'sRel')?.[1];
          if (!emailSetResp?.created?.relMsg) {
            const errDesc =
              emailSetResp?.notCreated?.relMsg?.description ||
              emailSetResp?.notCreated?.relMsg?.type ||
              'Mail server failed to stage released message.';
            deliveryError = String(errDesc);
          } else if (!subSetResp?.created?.relSub) {
            const errDesc =
              subSetResp?.notCreated?.relSub?.description ||
              subSetResp?.notCreated?.relSub?.type ||
              'Mail server rejected message submission.';
            deliveryError = String(errDesc);
          }
        }
      } catch (releaseErr: any) {
        deliveryError = releaseErr?.message || 'Mail server delivery failed.';
      }

      if (deliveryError) {
        await itemRef.update({
          status: 'release_failed',
          releaseError: deliveryError,
          releaseFailedAt: new Date().toISOString(),
        });
        await logMailAuditEvent({
          orgId,
          actorUid: auth.uid,
          actorEmail: auth.email,
          action: 'QUARANTINE_RELEASE_FAILED',
          target: itemData.subject ? `${itemId} (${itemData.subject})` : itemId,
          metadata: { error: deliveryError },
        });
        return { success: false, error: `Failed to release quarantined message: ${deliveryError}` };
      }

      await itemRef.update({
        status: 'released',
        resolvedBy: auth.email || auth.uid,
        resolvedAt: new Date().toISOString(),
        releaseError: FieldValue.delete(),
      });
    } else {
      await itemRef.update({
        status: 'deleted',
        resolvedBy: auth.email || auth.uid,
        resolvedAt: new Date().toISOString(),
      });
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
    const domain = await assertActiveMailDomainBinding(orgId, orgData);

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

    const usersSnap = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('mailUsers')
      .get();
    const activeUserEmails = new Set(
      usersSnap.docs
        .map((d) => d.data() || {})
        .filter((u) => (u.status || 'active') === 'active')
        .map((u) => String(u.primaryEmail || u.email || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const seenDelegates = new Map<string, SharedMailboxDelegate>();
    for (const d of input.delegates || []) {
      const dEmail = (d.email || '').trim().toLowerCase();
      if (!dEmail) continue;
      if (!dEmail.includes('@') || !dEmail.endsWith(`@${domain}`)) {
        throw new Error(`Delegate "${dEmail}" must belong to @${domain}.`);
      }
      if (dEmail === email) {
        throw new Error('A shared mailbox cannot be added as its own delegate.');
      }
      if (!activeUserEmails.has(dEmail)) {
        throw new Error(`Delegate "${dEmail}" is not an active mailbox user in @${domain}.`);
      }
      const level: SharedMailboxDelegate['accessLevel'] =
        d.accessLevel === 'SEND_AS' || d.accessLevel === 'READ_ONLY'
          ? d.accessLevel
          : 'FULL_ACCESS';
      seenDelegates.set(dEmail, {
        email: dEmail,
        accessLevel: level,
      });
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
    const orgDomain = await assertActiveMailDomainBinding(orgId, auth.orgData);

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

    const orgRef = adminDb.collection('organizations').doc(orgId);
    const usersSnap = await orgRef.collection('mailUsers').get();
    const activeUserEmails = new Set(
      usersSnap.docs
        .map((d) => d.data() || {})
        .filter((u) => (u.status || 'active') === 'active')
        .map((u) => String(u.primaryEmail || u.email || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const seenDelegates = new Map<string, SharedMailboxDelegate>();
    for (const d of delegatesInput || []) {
      const dEmail = (d.email || '').trim().toLowerCase();
      if (!dEmail) continue;
      if (!dEmail.includes('@') || (orgDomain && !dEmail.endsWith(`@${orgDomain}`))) {
        throw new Error(`Delegate "${dEmail}" must belong to @${orgDomain || 'your organization domain'}.`);
      }
      if (dEmail === mailboxEmail) {
        throw new Error('A shared mailbox cannot be added as its own delegate.');
      }
      if (!activeUserEmails.has(dEmail)) {
        throw new Error(`Delegate "${dEmail}" is not an active mailbox user in this domain.`);
      }
      const level: SharedMailboxDelegate['accessLevel'] =
        d.accessLevel === 'SEND_AS' || d.accessLevel === 'READ_ONLY'
          ? d.accessLevel
          : 'FULL_ACCESS';
      seenDelegates.set(dEmail, {
        email: dEmail,
        accessLevel: level,
      });
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
    await assertActiveMailDomainBinding(orgId, auth.orgData);

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
      const esc = (v: unknown) => {
        const text = String(v ?? '');
        const safeText = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
      };
      content = [
        'id,createdAt,actorUid,actorEmail,action,target,metadata',
        ...logs.map((l) =>
          [l.id, l.createdAt, l.actorUid, l.actorEmail || '', l.action, l.target, JSON.stringify(l.metadata || {})]
            .map(esc)
            .join(',')
        ),
      ].join('\n');
    } else {
      // CEF (Common Event Format) with RFC/CEF-compliant header and extension escaping
      const escHeader = (v: unknown) =>
        String(v ?? '')
          .replace(/\\/g, '\\\\')
          .replace(/\|/g, '\\|')
          .replace(/[\r\n]+/g, ' ');
      const escExt = (v: unknown) =>
        String(v ?? '')
          .replace(/\\/g, '\\\\')
          .replace(/=/g, '\\=')
          .replace(/\r/g, '\\r')
          .replace(/\n/g, '\\n');
      content = logs
        .map(
          (l) =>
            `CEF:0|Revlet|ControlPlane|1.0|${escHeader(l.action)}|${escHeader(l.action)}|5|rt=${escExt(l.createdAt)} suser=${escExt(l.actorEmail || l.actorUid)} cs1=${escExt(l.target)} cs1Label=Target`
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
