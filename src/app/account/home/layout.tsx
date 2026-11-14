import { Metadata } from 'next';
import { buildPageMetadata, PAGE_SEO } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata(PAGE_SEO.accountHome);

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
