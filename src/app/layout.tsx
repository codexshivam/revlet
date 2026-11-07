
import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';
import { JsonLd } from '@/components/seo/json-ld';
import { DevToolsGuard } from '@/components/security/devtools-guard';
import { PointerEventsGuard } from '@/components/layout/pointer-events-guard';

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
    default: 'Revlet | Enterprise IT Management & Cloud Infrastructure Control Plane',
    template: '%s | Revlet',
  },
  description: 'Open-source enterprise multi-tenant IT management control plane. Unified orchestration for Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity.',
  applicationName: 'Revlet',
  keywords: [
    'Revlet',
    'IT Management Platform',
    'Cloudflare DNS Management',
    'Cloudflare API v4',
    'Google Workspace for Education',
    'Google Admin SDK',
    'Domain-Wide Delegation',
    'Custom Email Routing',
    'SPF DKIM DMARC Validator',
    'Multi-Tenant Control Plane',
    'Zero-Trust Tenancy',
    'Institutional IT Dashboard',
    'EdTech Infrastructure',
    'School Domain Management',
  ],
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
    title: 'Revlet | Enterprise IT Management & Cloud Infrastructure Control Plane',
    description: 'Unified multi-tenant orchestration for Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity.',
    type: 'website',
    url: 'https://app.revlet.me',
    locale: 'en_US',
    siteName: 'Revlet',
    images: [
      {
        url: '/banner.svg',
        width: 1200,
        height: 320,
        alt: 'Revlet Enterprise IT Management Control Plane',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Revlet | Enterprise IT Management & Cloud Infrastructure Control Plane',
    description: 'Unified multi-tenant orchestration for Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity.',
    creator: '@revlet',
    images: ['/banner.svg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'technology',
  other: {
    'geo.region': 'Global',
    'geo.placename': 'Worldwide',
    'DC.title': 'Revlet - Enterprise IT Management & Cloud Infrastructure Control Plane',
    'DC.description': 'Unified control plane for Cloudflare DNS, Email Routing, and Google Workspace for Education.',
    'DC.subject': 'Cloudflare DNS, Google Workspace Admin SDK, Email Routing, Multi-Tenant IT Platform',
  },
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
    'https://github.com/codexshivam/revlet',
  ],
  areaServed: {
    '@type': 'Place',
    name: 'Worldwide',
  },
  knowsAbout: [
    'Cloudflare DNS & Edge Infrastructure',
    'Google Workspace for Education',
    'Google Admin SDK',
    'Domain-Wide Delegation',
    'Email Routing Protocols',
    'SPF, DKIM, and DMARC Verification',
    'Zero-Trust Multi-Tenancy',
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
  applicationSubCategory: 'NetworkInfrastructureManagement',
  operatingSystem: 'All modern web browsers (Cloud Web Application)',
  browserRequirements: 'Requires a modern web browser with JavaScript enabled',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Open-source software licensed under Apache-2.0',
  },
  creator: {
    '@type': 'Organization',
    '@id': 'https://revlet.me/#organization',
    name: 'Revlet',
  },
  featureList: [
    'Authoritative Cloudflare DNS Management',
    'Cloudflare Email Forwarding & Routing',
    'SPF, DKIM, and DMARC Compliance Auditing',
    'Google Workspace for Education User & OU Lifecycle Management',
    'Google Drive Institutional Storage Pool Monitoring',
    'Google Alert Center Security Event Ingestion',
    'Batch CSV User Ingestion',
    'Multi-Tenant Zero-Trust Isolation',
  ],
};

// FAQPage schema — optimizes indexing for Google Search Generative Experience (SGE) & AI Answer Engines (Perplexity, ChatGPT, Claude)
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Revlet?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Revlet is an open-source, multi-tenant Enterprise IT Management Control Plane designed for educational institutions and distributed organizations. It unifies Cloudflare DNS, Email Routing, and Google Workspace for Education administration into a single pane of glass.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does Revlet manage Google Workspace for Education?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Revlet integrates with the Google Workspace Admin SDK using a Google Cloud Service Account configured with Domain-Wide Delegation (DWD). It enables administrators to provision users, manage Organizational Units (OUs), monitor Google Drive storage quotas, and ingest security alerts directly without logging into the Google Admin Console.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does Revlet interact with Cloudflare DNS and Email Routing?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Revlet uses Cloudflare API v4 with organization-scoped bearer tokens to execute atomic CRUD operations on DNS records (A, AAAA, CNAME, MX, TXT, SRV), toggle CDN proxying, purge edge caches, configure SSL/TLS encryption, and manage custom email forwarding aliases.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is Revlet secure for multi-tenant organizations?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Revlet enforces a Defense-in-Depth security model featuring Server Actions tenancy verification (verifyUserOrgAccess) to prevent Insecure Direct Object References (IDOR), granular Firestore and Firebase Storage security rules, and strict Content Security Policy (CSP) and HSTS headers.',
      },
    },
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
        <JsonLd data={faqSchema} />
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
