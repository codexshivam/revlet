import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const privateDisallowed = ['/services/', '/account/', '/management/', '/api/'];

  return {
    rules: [
      // All search engines and AI assistants (Googlebot, Bingbot, Google-Extended,
      // GPTBot, ClaudeBot, PerplexityBot, Applebot) may read public pages only.
      { userAgent: '*', allow: '/', disallow: privateDisallowed },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
