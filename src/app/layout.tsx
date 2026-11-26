import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';
import { JsonLd } from '@/components/seo/json-ld';
import { DevToolsGuard } from '@/components/security/devtools-guard';
import { PointerEventsGuard } from '@/components/layout/pointer-events-guard';
import { PersistentWorkspaceFrame } from '@/components/layout/dashboard-shell';
import {
  SITE_URL,
  MARKETING_URL,
  SITE_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  PAGE_SEO,
} from '@/lib/seo';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#09090b',
  colorScheme: 'light',
};

const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'Revlet',
    'business email',
    'custom domain email',
    'professional email for teams',
    'DNS management',
    'domain management',
    'team access management',
    'cloud infrastructure for organizations',
  ],
  authors: [{ name: SITE_NAME, url: MARKETING_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: '/manifest.json',
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon-48x48.png', type: 'image/png', sizes: '48x48' },
      { url: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
      { url: '/favicon-144x144.png', type: 'image/png', sizes: '144x144' },
      { url: '/favicon-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: 'website',
    url: SITE_URL,
    locale: 'en_US',
    siteName: SITE_NAME,
  },
  twitter: {
    card: 'summary_large_image',
    site: '@revletme',
    creator: '@revletme',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // Private by default: only public pages (login, signup, support) opt in to indexing.
  robots: {
    index: false,
    follow: true,
  },
  category: 'business',
  ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
};

// Entity graph that helps search engines and AI assistants understand who Revlet is
// and what it offers. Only facts that are true site-wide live here; page-specific
// markup (breadcrumbs, FAQs) lives in each public page's layout.
const siteSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${MARKETING_URL}/#organization`,
      name: 'Revlet Platform',
      legalName: 'Revlet Platform',
      alternateName: ['Revlet', 'Revlet Cloud', 'RevletMail', 'Revlet Mail', 'Revlet Console'],
      url: `${MARKETING_URL}/`,
      logo: {
        '@type': 'ImageObject',
        '@id': `${MARKETING_URL}/#logo`,
        url: `${MARKETING_URL}/favicon-512x512.png`,
        contentUrl: `${MARKETING_URL}/favicon-512x512.png`,
        width: 512,
        height: 512,
        caption: 'Revlet Platform',
      },
      image: { '@id': `${MARKETING_URL}/#logo` },
      description:
        'Revlet Platform is an enterprise cloud infrastructure platform unifying custom-domain business email (RevletMail), 1-second global DNS management, shared team mailboxes, and organization access controls in one console.',
      foundingDate: '2024',
      founder: { '@id': `${MARKETING_URL}/about/#shivam-yadav` },
      email: 'hello@revlet.me',
      publishingPrinciples: `${MARKETING_URL}/privacy/`,
      contactPoint: [
        {
          '@type': 'ContactPoint',
          email: 'hello@revlet.me',
          contactType: 'customer support',
          url: `${MARKETING_URL}/contact/`,
          availableLanguage: ['English'],
        },
        {
          '@type': 'ContactPoint',
          email: 'hello@revlet.me',
          contactType: 'technical support',
          url: `${SITE_URL}${PAGE_SEO.support.path}`,
          availableLanguage: ['English'],
        },
      ],
      sameAs: [
        'https://www.instagram.com/revlet.me',
        'https://www.facebook.com/revletplatform',
        'https://x.com/revletme',
        'https://www.linkedin.com/company/revlet',
        'https://github.com/codexshivam/revlet',
      ],
      brand: [
        {
          '@type': 'Brand',
          name: 'Revlet Platform',
          alternateName: 'Revlet',
          url: `${MARKETING_URL}/`,
          logo: `${MARKETING_URL}/favicon-512x512.png`,
        },
        {
          '@type': 'Brand',
          name: 'Revlet Console',
          url: `${SITE_URL}/`,
          logo: `${SITE_URL}/favicon-512x512.png`,
        },
        {
          '@type': 'Brand',
          name: 'RevletMail',
          alternateName: 'Revlet Mail',
          url: 'https://mail.revlet.me/',
          logo: 'https://mail.revlet.me/favicon-512x512.png',
        },
      ],
      owns: [
        { '@id': `${MARKETING_URL}/#application` },
        { '@id': `${SITE_URL}/#application` },
        { '@id': 'https://mail.revlet.me/#application' },
      ],
    },
    {
      '@type': 'Person',
      '@id': `${MARKETING_URL}/about/#shivam-yadav`,
      name: 'Shivam Yadav',
      jobTitle: 'Founder & Chief Architect',
      url: `${MARKETING_URL}/about/`,
      worksFor: { '@id': `${MARKETING_URL}/#organization` },
      sameAs: [
        'https://shivm.co/',
        'https://shivamyadav.com.np/',
        'https://www.linkedin.com/in/shivmco/',
        'https://x.com/shivmco',
        'https://github.com/codexshivam',
        'https://www.instagram.com/shvmco/',
        'https://www.facebook.com/shvmco',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: ['Revlet', 'Revlet Console', 'app.revlet.me'],
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      inLanguage: 'en-US',
      publisher: { '@id': `${MARKETING_URL}/#organization` },
    },
    {
      '@type': ['SoftwareApplication', 'WebApplication'],
      '@id': `${SITE_URL}/#application`,
      name: 'Revlet Console',
      url: `${SITE_URL}${PAGE_SEO.login.path}`,
      description: SITE_DESCRIPTION,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      inLanguage: 'en',
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: `${MARKETING_URL}/pricing/`,
        description: 'Standard Open Access Plan ($0/mo): up to 1,000 mailboxes, 1,000 sends/month, and fast DNS management.',
      },
      image: `${SITE_URL}/opengraph-image`,
      screenshot: `${SITE_URL}/opengraph-image`,
      publisher: { '@id': `${MARKETING_URL}/#organization` },
      author: { '@id': `${MARKETING_URL}/about/#shivam-yadav` },
      isPartOf: { '@id': `${MARKETING_URL}/#application` },
      featureList: [
        'Professional email on your own domain',
        'Aliases, group mailboxes, and organizational units',
        'Email security records (SPF, DKIM, DMARC) set up for you',
        'Bulk import and export of email accounts',
        '14-day recovery for deleted email accounts',
        'Simple DNS management with restore points',
        'Per-organization team roles and permissions',
        'Manage multiple organizations from one account',
      ],
    },
    {
      '@type': 'SiteNavigationElement',
      '@id': `${SITE_URL}/#nav-signup`,
      name: 'Get Started Free',
      description: 'Create your free Revlet Platform account for up to 1,000 custom mailboxes and 1-second global DNS at $0/mo.',
      url: `${SITE_URL}${PAGE_SEO.signup.path}`,
      isPartOf: { '@id': `${SITE_URL}/#website` },
    },
    {
      '@type': 'SiteNavigationElement',
      '@id': `${SITE_URL}/#nav-login`,
      name: 'Login',
      description: 'Sign in to Revlet Platform to manage business email, DNS records, and team access.',
      url: `${SITE_URL}${PAGE_SEO.login.path}`,
      isPartOf: { '@id': `${SITE_URL}/#website` },
    },
    {
      '@type': 'SiteNavigationElement',
      '@id': `${SITE_URL}/#nav-support`,
      name: 'Help & Support',
      description: 'Best-in-class support and a guided approach to Revlet Platform products, DNS, and RevletMail.',
      url: `${SITE_URL}${PAGE_SEO.support.path}`,
      isPartOf: { '@id': `${SITE_URL}/#website` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        <JsonLd data={siteSchema} />
      </head>
      <body className="font-body antialiased">
        <DevToolsGuard />
        <PointerEventsGuard />
        <FirebaseClientProvider>
          <PersistentWorkspaceFrame>{children}</PersistentWorkspaceFrame>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
