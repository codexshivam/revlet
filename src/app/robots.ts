import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const privateDisallowed = ['/services/', '/account/', '/management/', '/api/'];

  return {
    rules: [
      {
        userAgent: [
          'Googlebot',
          'Googlebot-Image',
          'Google-Extended',
          'Bingbot',
          'Applebot',
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'ClaudeBot',
          'PerplexityBot',
        ],
        allow: '/',
        disallow: privateDisallowed,
      },
      { userAgent: '*', allow: '/', disallow: privateDisallowed },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
