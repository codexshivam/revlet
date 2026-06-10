import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login', '/signup'],
        disallow: [
          '/account/',
          '/services/',
          '/management/',
          '/support/',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://app.revlet.me/sitemap.xml',
  };
}
