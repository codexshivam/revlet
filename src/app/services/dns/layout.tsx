import { Metadata } from 'next';
import { buildPageMetadata, PAGE_SEO } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata(PAGE_SEO.dns);

export default function DNSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
