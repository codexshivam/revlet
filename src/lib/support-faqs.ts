/**
 * Visible FAQ content for the public Help & Support page.
 * The same array powers the on-page FAQ list and the FAQPage structured data,
 * so search engines always see markup that matches what visitors read.
 */
export const SUPPORT_FAQS = [
  {
    q: 'What is Revlet?',
    a: 'Revlet brings your business email, domain DNS, and team access together in one simple, secure console, so your organization can run its cloud infrastructure without juggling multiple tools.',
  },
  {
    q: 'Can I get professional email on my own domain?',
    a: 'Yes. Revlet gives your team email addresses like you@yourcompany.com, with aliases, group mailboxes, organizational units, and easy bulk import. Recommended email security records (SPF, DKIM, and DMARC) are set up for you to help your messages reach the inbox.',
  },
  {
    q: 'How does DNS management work in Revlet?',
    a: 'You can add, edit, and remove DNS records for your domain from a clean, searchable list. Restore points let you save your settings before big changes and roll back if something goes wrong.',
  },
  {
    q: 'Can I control what each team member can access?',
    a: 'Yes. Invite colleagues as organization admins, or give them access only to the services they need, such as DNS or Email, separately for each organization. Nobody needs to share passwords or provider credentials.',
  },
  {
    q: 'What happens if an email account is deleted by mistake?',
    a: 'Deleted accounts can be restored for 14 days. After that, the account and its data are permanently removed and the organization owner is notified by email.',
  },
  {
    q: 'How quickly do DNS changes take effect?',
    a: 'Changes are published to the DNS network right away. Most visitors see them within minutes, although some networks may take longer depending on each record’s time-to-live (TTL).',
  },
] as const;
