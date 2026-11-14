import { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Email Service | Revlet',
  description: 'Manage custom domain email accounts, aliases, organizational units, groups, and domain routing.',
  indexable: false,
});

export default function EmailServiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
