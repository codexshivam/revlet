import { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Account Settings | Revlet',
  description: 'Organization settings, security preferences, and tenant configuration in Revlet.',
  indexable: false,
});

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
