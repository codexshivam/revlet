/**
 * Migration Script: Separate Email Forwarding vs Email Service Schema in Firestore
 * Updates organizations, mailUsers, mailGroups, mailOrgUnits, emailRoutingConfigs, forwardingRules, and users.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { adminDb } from '../src/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

async function runMigration() {
  console.log('🚀 Starting Firestore Email Separation Schema Migration...');

  // 1. Process Organizations
  const orgsSnap = await adminDb.collection('organizations').get();
  console.log(`📦 Found ${orgsSnap.size} organizations to inspect/update.`);

  let updatedOrgs = 0;
  let updatedMailUsers = 0;
  let updatedMailGroups = 0;
  let updatedMailOus = 0;

  for (const orgDoc of orgsSnap.docs) {
    const orgData = orgDoc.data();

    // Distinguish Email Service (Revlet Mail) from Email Forwarding (Cloudflare routing)
    const isMailServiceActive = Boolean(orgData.mailServiceActive);
    const isEmailForwardingActive = Boolean(orgData.emailForwardingActive ?? orgData.emailRoutingActive ?? orgData.emailServiceActive ?? false);

    await orgDoc.ref.set({
      serviceType: 'organization',
      mailServiceActive: isMailServiceActive,
      emailForwardingActive: isEmailForwardingActive,
      emailRoutingActive: isEmailForwardingActive,
      mailMonthlyLimit: orgData.mailMonthlyLimit ?? 1000,
      mailDailyLimit: orgData.mailDailyLimit ?? 100,
      mailMonthlySent: orgData.mailMonthlySent ?? 0,
      mailDailySent: orgData.mailDailySent ?? 0,
      mailRetentionPolicy: orgData.mailRetentionPolicy ?? 'EPHEMERAL_21D',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    updatedOrgs++;

    // 1.1 Process mailUsers subcollection
    const mailUsersSnap = await orgDoc.ref.collection('mailUsers').get();
    for (const muDoc of mailUsersSnap.docs) {
      await muDoc.ref.set({
        serviceType: 'email_service',
        mailboxType: 'stalwart_mailbox',
        status: muDoc.data().status || 'active',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      updatedMailUsers++;
    }

    // 1.2 Process mailGroups subcollection
    const mailGroupsSnap = await orgDoc.ref.collection('mailGroups').get();
    for (const mgDoc of mailGroupsSnap.docs) {
      await mgDoc.ref.set({
        serviceType: 'email_service',
        groupType: 'distribution_list',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      updatedMailGroups++;
    }

    // 1.3 Process mailOrgUnits subcollection
    const mailOusSnap = await orgDoc.ref.collection('mailOrgUnits').get();
    for (const ouDoc of mailOusSnap.docs) {
      await ouDoc.ref.set({
        serviceType: 'email_service',
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      updatedMailOus++;
    }
  }

  // 2. Process emailRoutingConfigs
  const routingConfigsSnap = await adminDb.collection('emailRoutingConfigs').get();
  console.log(`📨 Found ${routingConfigsSnap.size} emailRoutingConfigs.`);
  for (const doc of routingConfigsSnap.docs) {
    await doc.ref.set({
      serviceType: 'email_forwarding',
      routingEngine: 'cloudflare_email_routing',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  // 3. Process forwardingRules
  const forwardingRulesSnap = await adminDb.collection('forwardingRules').get();
  console.log(`🔀 Found ${forwardingRulesSnap.size} forwardingRules.`);
  for (const doc of forwardingRulesSnap.docs) {
    await doc.ref.set({
      serviceType: 'email_forwarding',
      ruleType: 'alias_forwarding',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  // 4. Process Users
  const usersSnap = await adminDb.collection('users').get();
  console.log(`👤 Found ${usersSnap.size} users to update.`);
  let updatedUsers = 0;

  for (const userDoc of usersSnap.docs) {
    // Find organizations belonging to user
    const userOwnedOrgsSnap = await adminDb.collection('organizations').where('ownerId', '==', userDoc.id).get();
    const ownedOrgDocs = userOwnedOrgsSnap.docs;

    const hasMailService = ownedOrgDocs.some(d => Boolean(d.data().mailServiceActive));
    const hasEmailForwarding = ownedOrgDocs.some(d => Boolean(d.data().emailForwardingActive || d.data().emailServiceActive));

    const mailServiceOrgIds = ownedOrgDocs.filter(d => Boolean(d.data().mailServiceActive)).map(d => d.id);
    const forwardingOrgIds = ownedOrgDocs.filter(d => Boolean(d.data().emailForwardingActive || d.data().emailServiceActive)).map(d => d.id);

    // Count user's mailboxes
    let userMailboxesCount = 0;
    for (const org of ownedOrgDocs) {
      const uSnap = await org.ref.collection('mailUsers').get();
      userMailboxesCount += uSnap.size;
    }

    await userDoc.ref.set({
      serviceType: 'user_profile',
      emailService: {
        enabled: hasMailService,
        mailboxesCount: userMailboxesCount,
        activeOrgIds: mailServiceOrgIds,
      },
      emailForwarding: {
        enabled: hasEmailForwarding,
        activeOrgIds: forwardingOrgIds,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    updatedUsers++;
  }

  console.log('✅ Migration complete!');
  console.log({
    updatedOrgs,
    updatedMailUsers,
    updatedMailGroups,
    updatedMailOus,
    routingConfigs: routingConfigsSnap.size,
    forwardingRules: forwardingRulesSnap.size,
    updatedUsers,
  });
}

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
