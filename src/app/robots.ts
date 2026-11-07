import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://app.revlet.me';

  const publicAllowed = [
    '/',
    '/login',
    '/signup',
    '/support',
    '/llms.txt',
    '/llms-full.txt',
    '/sitemap.xml',
    '/banner.svg',
    '/favicon.svg',
  ];

  const privateDisallowed = [
    '/account/',
    '/services/',
    '/management/',
    '/api/',
  ];

  return {
    rules: [
      // Standard search engine crawlers (Google, Bing, DuckDuckGo, etc.)
      {
        userAgent: '*',
        allow: publicAllowed,
        disallow: privateDisallowed,
      },
      // Google-Extended (Google Gemini / Vertex AI)
      {
        userAgent: 'Google-Extended',
        allow: publicAllowed,
        disallow: privateDisallowed,
      },
      // OpenAI / ChatGPT web search and training crawler
      {
        userAgent: 'GPTBot',
        allow: publicAllowed,
        disallow: privateDisallowed,
      },
      // Anthropic / Claude web search crawler
      {
        userAgent: 'ClaudeBot',
        allow: publicAllowed,
        disallow: privateDisallowed,
      },
      // Perplexity AI search crawler
      {
        userAgent: 'PerplexityBot',
        allow: publicAllowed,
        disallow: privateDisallowed,
      },
      // Applebot & Apple Intelligence
      {
        userAgent: 'Applebot-Extended',
        allow: publicAllowed,
        disallow: privateDisallowed,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
