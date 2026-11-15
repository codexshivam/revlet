import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';
import { JsonLd } from '@/components/seo/json-ld';
import { DevToolsGuard } from '@/components/security/devtools-guard';
import { PointerEventsGuard } from '@/components/layout/pointer-events-guard';
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f8fafc',
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
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-48x48.png', type: 'image/png', sizes: '48x48' },
      { url: '/favicon-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/favicon-512x512.png', type: 'image/png', sizes: '512x512' },
    ],
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
      name: SITE_NAME,
      url: MARKETING_URL,
      logo: {
        '@type': 'ImageObject',
        '@id': `${MARKETING_URL}/#logo`,
        url: `${SITE_URL}/favicon-192x192.png`,
        width: 192,
        height: 192,
        caption: SITE_NAME,
      },
      image: { '@id': `${MARKETING_URL}/#logo` },
      description:
        'Revlet helps organizations run their cloud infrastructure with professional business email, simple DNS management, and secure team access in one place.',
      founder: { '@id': `${MARKETING_URL}/about/#shivam-yadav` },
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'hello@revlet.me',
        contactType: 'customer support',
        url: `${SITE_URL}${PAGE_SEO.support.path}`,
        availableLanguage: ['English'],
      },
      sameAs: [MARKETING_URL, 'https://github.com/codexshivam/revlet'],
    },
    {
      '@type': 'Person',
      '@id': `${MARKETING_URL}/about/#shivam-yadav`,
      name: 'Shivam Yadav',
      jobTitle: 'Founder',
      url: `${MARKETING_URL}/about/`,
      worksFor: { '@id': `${MARKETING_URL}/#organization` },
      sameAs: ['https://github.com/codexshivam'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: ['Revlet Console', 'app.revlet.me'],
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: 'en',
      publisher: { '@id': `${MARKETING_URL}/#organization` },
    },
    {
      '@type': ['SoftwareApplication', 'WebApplication'],
      '@id': `${SITE_URL}/#application`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      inLanguage: 'en',
      image: `${SITE_URL}/opengraph-image`,
      publisher: { '@id': `${MARKETING_URL}/#organization` },
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
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <JsonLd data={siteSchema} />
      </head>
      <body className="font-body antialiased">
        <DevToolsGuard />
        <PointerEventsGuard />
        <FirebaseClientProvider>
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
