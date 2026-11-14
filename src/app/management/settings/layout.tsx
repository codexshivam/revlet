import { Metadata } from 'next';
import { buildPageMetadata, PAGE_SEO } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata(PAGE_SEO.settings);

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
