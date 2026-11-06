
import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';
import { JsonLd } from '@/components/seo/json-ld';
import { DevToolsGuard } from '@/components/security/devtools-guard';

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

export const metadata: Metadata = {
  metadataBase: new URL('https://app.revlet.me'),
  title: {
    default: 'Revlet IT Manager',
    template: '%s | Revlet IT Manager'
  },
  description: 'Enterprise infrastructure management platform for institutions and businesses. Manage DNS, email, Google Workspace, teams, and billing from one unified dashboard.',
  applicationName: 'Revlet',
  keywords: ['Revlet', 'IT management', 'infrastructure platform', 'DNS management', 'Google Workspace', 'enterprise dashboard', 'SaaS', 'institutional IT'],
  authors: [{ name: 'Revlet', url: 'https://revlet.me' }],
  creator: 'Revlet',
  publisher: 'Revlet',
  alternates: {
    canonical: 'https://app.revlet.me',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: 'any',
      },
      {
        url: '/favicon.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/favicon-48x48.png',
        type: 'image/png',
        sizes: '48x48',
      },
      {
        url: '/favicon-192x192.png',
        type: 'image/png',
        sizes: '192x192',
      },
    ],
    apple: [
      {
        url: '/favicon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  },
  openGraph: {
    title: 'Revlet — Enterprise Infrastructure Dashboard',
    description: 'Unified platform for managing DNS, email, Google Workspace, teams, and billing for institutions and businesses.',
    type: 'website',
    url: 'https://app.revlet.me',
    locale: 'en_US',
    siteName: 'Revlet',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Revlet — Enterprise Infrastructure Dashboard',
    description: 'Unified platform for managing DNS, email, Google Workspace, teams, and billing for institutions and businesses.',
    creator: '@revlet',
  },
  robots: {
    index: true,
    follow: true,
  },
  category: 'technology',
};

// Organization entity — the brand itself, pointing to revlet.me as the main website
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://revlet.me/#organization',
  name: 'Revlet',
  url: 'https://revlet.me',
  logo: {
    '@type': 'ImageObject',
    url: 'https://app.revlet.me/favicon-192x192.png',
    width: 192,
    height: 192,
  },
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'hello@revlet.me',
    contactType: 'customer support',
    availableLanguage: ['English'],
  },
  sameAs: [
    'https://revlet.me',
    'https://app.revlet.me',
  ],
};

// WebApplication schema — this dashboard app is a product of the Organization
const webApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  '@id': 'https://app.revlet.me/#application',
  name: 'Revlet Dashboard',
  url: 'https://app.revlet.me',
  description: 'Enterprise infrastructure management platform for institutions and businesses. Manage DNS, email, Google Workspace, teams, and billing from one unified dashboard.',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires a modern web browser',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free to get started',
  },
  creator: {
    '@type': 'Organization',
    '@id': 'https://revlet.me/#organization',
    name: 'Revlet',
  },
  featureList: [
    'DNS & Domain Management',
    'Enterprise Email Infrastructure',
    'Google Workspace Administration',
    'Team & Access Control',
    'Billing & Payments',
    'Website Management',
  ],
};

// WebSite schema with SearchAction — helps Google show a search box in sitelinks
const webSiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': 'https://app.revlet.me/#website',
  name: 'Revlet',
  alternateName: ['Revlet Dashboard', 'Revlet App'],
  url: 'https://app.revlet.me',
  publisher: {
    '@type': 'Organization',
    '@id': 'https://revlet.me/#organization',
  },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://app.revlet.me/search?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
};

// BreadcrumbList for the root — helps Google understand page hierarchy for sitelinks
const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://app.revlet.me',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Login',
      item: 'https://app.revlet.me/login',
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'Create Account',
      item: 'https://app.revlet.me/signup',
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
        <JsonLd data={organizationSchema} />
        <JsonLd data={webApplicationSchema} />
        <JsonLd data={webSiteSchema} />
        <JsonLd data={breadcrumbSchema} />
      </head>
      <body className="font-body antialiased">
        <DevToolsGuard />
        <FirebaseClientProvider>
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
