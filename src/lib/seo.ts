import type { Metadata } from 'next';

export const SITE_URL = 'https://app.revlet.me';
export const MARKETING_URL = 'https://revlet.me';
export const SITE_NAME = 'Revlet Platform';
export const SITE_TITLE = 'Dashboard | Revlet Platform';
export const SITE_DESCRIPTION =
  'Professional email on your own domain, simple DNS management, and secure team access — all in one place. Sign in to the Revlet Platform dashboard to manage your organization.';

/**
 * Single source of truth for every page's search and social copy.
 * Copy is benefit-led (what the user gets), not tool-led (how it is built).
 * Titles stay under ~60 characters and descriptions under ~160 characters
 * so they render fully in search results and link previews.
 */
export const PAGE_SEO = {
  login: {
    path: '/login',
    title: 'Login | Revlet',
    description:
      'Sign in to Revlet to manage your business email, domains, and team access from one secure console.',
    ogTitle: 'Sign in to Revlet',
    ogDescription: 'Your business email, domains, and team — managed from one secure console.',
    ogEyebrow: 'Sign In',
    ogHeadline: 'Everything your organization runs on, in one place.',
  },
  signup: {
    path: '/signup',
    title: 'Get Started Free | Revlet',
    description:
      'Create your free Revlet account in minutes. Get up to 1,000 custom domain business email mailboxes, fast DNS management, and team access at $0/mo.',
    ogTitle: 'Get started free with Revlet',
    ogDescription: 'Up to 1,000 custom mailboxes, fast DNS management, and team access — free at $0/mo.',
    ogEyebrow: 'Get Started Free',
    ogHeadline: 'Business email and domains, free for up to 1,000 seats.',
  },
  support: {
    path: '/support',
    title: 'Help & Support | Revlet',
    description:
      'Get answers about business email, DNS, and team access in Revlet. Browse FAQs or contact our support team for help.',
    ogTitle: 'Revlet Help & Support',
    ogDescription: 'Answers about business email, domains, and team access — plus direct help from our team.',
    ogEyebrow: 'Help & Support',
    ogHeadline: 'Answers and help, whenever your team needs it.',
  },
  accountHome: {
    title: 'Account Home | Revlet',
    description: 'See all your organizations and services at a glance, and switch between them in one click.',
  },
  dns: {
    title: 'DNS Management | Revlet',
    description: 'Keep your website and email online with simple, reliable DNS management and one-click restore points.',
  },
  email: {
    title: 'Email Service | Revlet',
    description: 'Give your team professional email on your own domain, with aliases, groups, and built-in protection.',
  },
  team: {
    title: 'Team Management | Revlet',
    description: 'Invite your team and choose exactly what each person can access, organization by organization.',
  },
  settings: {
    title: 'Account Settings | Revlet',
    description: 'Manage your profile, security preferences, and account settings in Revlet.',
  },
  notFound: {
    title: 'Not Found Error',
    description: 'The page you are looking for does not exist or has moved.',
  },
} as const;

interface PageMetadataOptions {
  title: string;
  description: string;
  path?: string;
  indexable?: boolean;
  ogTitle?: string;
  ogDescription?: string;
}

/**
 * Builds consistent metadata. Public pages get canonical URLs, Open Graph and
 * X/Twitter cards (images come from each route's opengraph-image / twitter-image
 * file). Private console pages are explicitly kept out of search results.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  indexable = false,
  ogTitle,
  ogDescription,
}: PageMetadataOptions): Metadata {
  if (!indexable) {
    return {
      title: { absolute: title },
      description,
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    };
  }

  const canonicalUrl = path ? `${SITE_URL}${path}` : SITE_URL;
  const socialTitle = ogTitle || title;
  const socialDescription = ogDescription || description;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: socialTitle,
      description: socialDescription,
      url: canonicalUrl,
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      site: '@revletme',
      creator: '@revletme',
      title: socialTitle,
      description: socialDescription,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}
