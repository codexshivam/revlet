
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
  metadataBase: new URL('https://revlet.me'),
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
    canonical: 'https://revlet.me',
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
    url: 'https://revlet.me',
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
    url: 'https://revlet.me/favicon-192x192.png',
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
  '@id': 'https://revlet.me/#application',
  name: 'Revlet Dashboard',
  url: 'https://revlet.me',
  description: 'Enterprise infrastructure management platform for institutions and businesses. Manage DNS, email, Google Workspace, and teams from one unified dashboard.',
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

// SiteNavigationElement schema — guides Google Search algorithms to generate expanded organic Sitelinks
const siteNavigationSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  '@id': 'https://revlet.me/#sitelinks',
  name: 'Revlet Sitelinks Navigation',
  description: 'Primary services and administrative portals of the Revlet Control Plane.',
  itemListElement: [
    {
      '@type': 'SiteNavigationElement',
      position: 1,
      name: 'Console',
      description: 'Use the console to manage everything powering your domain — DNS records, email routing, and Google Workspace users.',
      url: 'https://revlet.me/login',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 2,
      name: 'Get Started & Organization Registration',
      description: 'Register your educational institution or enterprise on Revlet with zero-trust multi-tenancy.',
      url: 'https://revlet.me/signup',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 3,
      name: 'Google Workspace for Education',
      description: 'Centralized administration for school domains, user directory, and Google Drive storage pool monitoring.',
      url: 'https://revlet.me/services/workspace',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 4,
      name: 'DNS Management',
      description: 'Authoritative Cloudflare API v4 records management with instant Anycast edge propagation.',
      url: 'https://revlet.me/services/dns',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 5,
      name: 'Custom Email Routing & Domain Security',
      description: 'Configure custom domain forwarder aliases and inspect real-time SPF, DKIM, and DMARC parameters.',
      url: 'https://revlet.me/services/email',
    },
    {
      '@type': 'SiteNavigationElement',
      position: 6,
      name: 'Documentation & Support',
      description: 'Access technical documentation, troubleshooting manuals, FAQs, and submit priority support tickets.',
      url: 'https://revlet.me/support',
    },
  ],
};

// WebSite schema with SearchAction & Sitelinks declaration
const webSiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': 'https://revlet.me/#website',
  name: 'Revlet',
  alternateName: ['Revlet Dashboard', 'Revlet Control Plane', 'Revlet IT Manager'],
  url: 'https://revlet.me',
  publisher: {
    '@type': 'Organization',
    '@id': 'https://revlet.me/#organization',
  },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://revlet.me/support?q={search_term_string}',
    },
    'query-input': 'required name=search_term_string',
  },
  hasPart: [
    {
      '@type': 'WebPage',
      '@id': 'https://revlet.me/login#webpage',
      url: 'https://revlet.me/login',
      name: 'Console',
      description: 'Sign in to the Revlet Console to manage DNS, email routing, and Google Workspace.',
    },
    {
      '@type': 'WebPage',
      '@id': 'https://revlet.me/signup#webpage',
      url: 'https://revlet.me/signup',
      name: 'Get Started',
      description: 'Register your educational institution or enterprise on Revlet.',
    },
    {
      '@type': 'WebPage',
      '@id': 'https://revlet.me/services/workspace#webpage',
      url: 'https://revlet.me/services/workspace',
      name: 'Google Workspace for Education',
      description: 'Centralized administration for school domains, user directory, and Drive storage.',
    },
    {
      '@type': 'WebPage',
      '@id': 'https://revlet.me/services/dns#webpage',
      url: 'https://revlet.me/services/dns',
      name: 'DNS Management',
      description: 'Authoritative Cloudflare API v4 DNS records management.',
    },
    {
      '@type': 'WebPage',
      '@id': 'https://revlet.me/services/email#webpage',
      url: 'https://revlet.me/services/email',
      name: 'Custom Email Routing',
      description: 'Configure custom domain forwarder aliases and inspect real-time SPF, DKIM, and DMARC parameters.',
    },
    {
      '@type': 'WebPage',
      '@id': 'https://revlet.me/support#webpage',
      url: 'https://revlet.me/support',
      name: 'Documentation & Support',
      description: 'Technical guides, FAQs, and submit priority infrastructure support tickets.',
    },
  ],
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
      item: 'https://revlet.me',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Console',
      item: 'https://revlet.me/login',
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'Get Started',
      item: 'https://revlet.me/signup',
    },
    {
      '@type': 'ListItem',
      position: 4,
      name: 'Support',
      item: 'https://revlet.me/support',
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
        <JsonLd data={siteNavigationSchema} />
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
