import { MetadataRoute } from 'next';
import { SITE_URL, PAGE_SEO } from '@/lib/seo';

// Only public, indexable pages belong in sitemap.xml.
// Private console routes and the root redirect (noindex) are intentionally excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const publicPages = [
    {
      path: PAGE_SEO.signup.path,
      changeFrequency: 'weekly' as const,
      priority: 1.0,
    },
    {
      path: PAGE_SEO.login.path,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      path: PAGE_SEO.support.path,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
  ];

  return publicPages.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    images: [`${SITE_URL}${page.path}/opengraph-image`],
  }));
}
