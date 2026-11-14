import { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Account Home | Revlet',
  description: 'Manage organizations, active workspaces, and account overview in Revlet.',
  indexable: false,
});

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
