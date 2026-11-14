export const SERVICE_PERMISSION_OPTIONS = [
  { id: 'DNS: Read', label: 'DNS: Read', group: 'DNS Management', description: 'View DNS records and nameservers' },
  { id: 'DNS: Edit', label: 'DNS: Edit', group: 'DNS Management', description: 'Add, update, and delete DNS records' },
  { id: 'DNS: Admin', label: 'DNS: Admin', group: 'DNS Management', description: 'Full DNS zone, snapshot, and activation control' },
  { id: 'Email: Read', label: 'Email: Read', group: 'Email Service', description: 'View mailboxes, aliases, and delivery status' },
  { id: 'Email: Add', label: 'Email: Add', group: 'Email Service', description: 'Create mailboxes, aliases, and groups' },
  { id: 'Email: Admin', label: 'Email: Admin', group: 'Email Service', description: 'Full Email Service and quota administration' },
] as const;

export const PERMISSION_GROUPS = ['DNS Management', 'Email Service'] as const;
