import { Metadata } from 'next';
import { buildPageMetadata, PAGE_SEO } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata(PAGE_SEO.email);

export default function EmailServiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
