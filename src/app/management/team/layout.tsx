import { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Team Management | Revlet',
  description: 'Manage team member permissions and role-based access control across organizations in Revlet.',
  indexable: false,
});

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
