export const ORG_ADMIN_PERMISSION = 'Org: Admin';
export const SECURITY_ADMIN_PERMISSION = 'Security: Admin';
export const COMPLIANCE_ADMIN_PERMISSION = 'Compliance: Admin';
export const HELP_DESK_ADMIN_PERMISSION = 'HelpDesk: Admin';

export const ADMIN_ALL_PERMISSIONS = [
  'Org: Admin',
  'Security: Admin',
  'Compliance: Admin',
  'HelpDesk: Admin',
  'DNS: Admin',
  'Email: Admin',
] as const;

export type RbacRoleId =
  | 'ORG_ADMIN'
  | 'SECURITY_ADMIN'
  | 'COMPLIANCE_ADMIN'
  | 'HELP_DESK_ADMIN'
  | 'CUSTOM';

export const RBAC_ROLE_PRESETS: Array<{
  id: RbacRoleId;
  label: string;
  description: string;
  permissions: string[];
}> = [
  {
    id: 'ORG_ADMIN',
    label: 'Organization Super Admin',
    description: 'Full access across all services, billing, team RBAC, security, and compliance.',
    permissions: ['Org: Admin', 'Security: Admin', 'Compliance: Admin', 'HelpDesk: Admin', 'DNS: Admin', 'Email: Admin'],
  },
  {
    id: 'SECURITY_ADMIN',
    label: 'Security Admin',
    description: 'Manage Quarantine Console, DLP rules, MFA policies, and SIEM audit exports.',
    permissions: ['Security: Admin', 'Email: Read', 'DNS: Read'],
  },
  {
    id: 'COMPLIANCE_ADMIN',
    label: 'Compliance & eDiscovery Admin',
    description: 'Manage Legal Holds, eDiscovery exports, Transport/Mail Flow rules, and Audit logs.',
    permissions: ['Compliance: Admin', 'Email: Read'],
  },
  {
    id: 'HELP_DESK_ADMIN',
    label: 'Help Desk Admin',
    description: 'Reset user passwords, unsuspend accounts, and view directory & delivery diagnostics.',
    permissions: ['HelpDesk: Admin', 'Email: Read', 'DNS: Read'],
  },
  {
    id: 'CUSTOM',
    label: 'Custom Service Permissions',
    description: 'Pick individual DNS, Email, Security, or Compliance permissions.',
    permissions: [],
  },
];

export const SERVICE_PERMISSION_OPTIONS = [
  { id: 'DNS: Read', label: 'DNS: Read', group: 'DNS Management', description: 'View DNS records and nameservers' },
  { id: 'DNS: Edit', label: 'DNS: Edit', group: 'DNS Management', description: 'Add, update, and delete DNS records' },
  { id: 'DNS: Admin', label: 'DNS: Admin', group: 'DNS Management', description: 'Full DNS zone, snapshot, and activation control' },
  { id: 'Email: Read', label: 'Email: Read', group: 'Email Service', description: 'View mailboxes, aliases, and delivery status' },
  { id: 'Email: Add', label: 'Email: Add', group: 'Email Service', description: 'Create mailboxes, aliases, and groups' },
  { id: 'Email: Admin', label: 'Email: Admin', group: 'Email Service', description: 'Full Email Service and quota administration' },
  { id: 'Security: Admin', label: 'Security: Admin', group: 'Security & Compliance', description: 'Manage DLP rules, Quarantine Console, MFA & SIEM' },
  { id: 'Compliance: Admin', label: 'Compliance: Admin', group: 'Security & Compliance', description: 'Manage Legal Hold, eDiscovery & Transport rules' },
  { id: 'HelpDesk: Admin', label: 'HelpDesk: Admin', group: 'Security & Compliance', description: 'Reset mailbox passwords & unlock/suspend users' },
] as const;

export const PERMISSION_GROUPS = ['DNS Management', 'Email Service', 'Security & Compliance'] as const;

export function derivePrimaryRbacRole(permissions: string[]): string {
  if (permissions.includes('*') || permissions.includes(ORG_ADMIN_PERMISSION)) return 'ORG_ADMIN';
  if (permissions.includes(SECURITY_ADMIN_PERMISSION)) return 'SECURITY_ADMIN';
  if (permissions.includes(COMPLIANCE_ADMIN_PERMISSION)) return 'COMPLIANCE_ADMIN';
  if (permissions.includes(HELP_DESK_ADMIN_PERMISSION)) return 'HELP_DESK_ADMIN';
  return 'MEMBER';
}
