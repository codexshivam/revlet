import { MetadataRoute } from 'next';
import { SITE_URL, PAGE_SEO } from '@/lib/seo';

// Only public, indexable pages belong in the sitemap. The console itself is private.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [PAGE_SEO.signup, PAGE_SEO.login, PAGE_SEO.support].map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified,
  }));
}
