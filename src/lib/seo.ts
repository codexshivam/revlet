import type { Metadata } from 'next';

export const SITE_URL = 'https://app.revlet.me';
export const MARKETING_URL = 'https://revlet.me';
export const SITE_NAME = 'Revlet';

export const DEFAULT_OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Revlet — Cloud IT & Communications Control Plane',
};

interface PageMetadataOptions {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  indexable?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogAlt?: string;
}

/**
 * Generates consistent, standards-compliant Next.js Metadata for public and private routes.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
  indexable = false,
  ogTitle,
  ogDescription,
  ogAlt,
}: PageMetadataOptions): Metadata {
  const canonicalUrl = path ? `${SITE_URL}${path}` : undefined;
  const resolvedOgTitle = ogTitle || title;
  const resolvedOgDesc = ogDescription || description;

  return {
    title: { absolute: title },
    description,
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    ...(indexable
      ? {
          openGraph: {
            title: resolvedOgTitle,
            description: resolvedOgDesc,
            ...(canonicalUrl ? { url: canonicalUrl } : {}),
            type: 'website',
            siteName: SITE_NAME,
            locale: 'en_US',
            images: [
              {
                ...DEFAULT_OG_IMAGE,
                alt: ogAlt || resolvedOgTitle,
              },
            ],
          },
          twitter: {
            card: 'summary_large_image',
            title: resolvedOgTitle,
            description: resolvedOgDesc,
            creator: '@revlet',
            images: ['/og-image.png'],
          },
          robots: {
            index: true,
            follow: true,
            googleBot: {
              index: true,
              follow: true,
              'max-image-preview': 'large',
              'max-snippet': -1,
            },
          },
        }
      : {
          robots: {
            index: false,
            follow: false,
          },
        }),
  };
}
