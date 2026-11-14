import { Metadata } from 'next';
import { buildPageMetadata, PAGE_SEO } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata(PAGE_SEO.team);

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
