import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team & Access Control',
  description: 'Manage team member permissions, staff work emails, and role-based access control across organizations in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
