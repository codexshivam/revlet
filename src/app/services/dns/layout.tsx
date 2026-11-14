import { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'DNS Management | Revlet',
  description: 'Authoritative DNS records management, zone snapshots, and domain routing.',
  indexable: false,
});

export default function DNSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
