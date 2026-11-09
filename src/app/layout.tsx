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
    default: 'Revlet Console | Enterprise IT Management & Cloud Infrastructure',
    template: '%s | Revlet Console',
  },
  description: 'Official administrative console for Revlet. Unified multi-tenant control plane for Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity.',
  applicationName: 'Revlet Console',
  keywords: [
    'Revlet Console',
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
    title: 'Revlet Console | Enterprise IT Management & Cloud Infrastructure',
    description: 'Official administrative console for Revlet. Unified multi-tenant control plane for Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity.',
    type: 'website',
    url: 'https://app.revlet.me',
    locale: 'en_US',
    siteName: 'Revlet Console',
    images: [
      {
        url: '/banner.svg',
        width: 1200,
        height: 320,
        alt: 'Revlet Console Enterprise IT Management Control Plane',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Revlet Console | Enterprise IT Management & Cloud Infrastructure',
    description: 'Official administrative console for Revlet. Unified multi-tenant control plane for Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity.',
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
    'DC.title': 'Revlet Console - Enterprise IT Management & Cloud Infrastructure Control Plane',
    'DC.description': 'Official administrative console for Cloudflare DNS, Email Routing, and Google Workspace for Education.',
    'DC.subject': 'Cloudflare DNS, Google Workspace Admin SDK, Email Routing, Multi-Tenant IT Platform',
  },
};

// Complete Google Knowledge Graph & Rich Results Linked Data Schema (@graph)
const knowledgeGraphSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    // 1. Organization Entity (Parent Brand Knowledge Node on revlet.me)
    {
      '@type': 'Organization',
      '@id': 'https://revlet.me/#organization',
      name: 'Revlet',
      alternateName: ['Revlet Platform', 'Revlet Control Plane', 'Revlet IT Manager'],
      url: 'https://revlet.me',
      logo: {
        '@type': 'ImageObject',
        '@id': 'https://revlet.me/#logo',
        url: 'https://app.revlet.me/favicon-192x192.png',
        caption: 'Revlet Logo',
        width: 192,
        height: 192,
      },
      image: {
        '@id': 'https://revlet.me/#logo',
      },
      description: 'Open-source enterprise multi-tenant IT management control plane for Cloudflare DNS, Email Routing, and Google Workspace for Education.',
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
    },
    // 2. Software Application Entity (Console WebApplication Node on app.revlet.me)
    {
      '@type': ['SoftwareApplication', 'WebApplication'],
      '@id': 'https://app.revlet.me/#application',
      name: 'Revlet Console',
      alternateName: ['Revlet Dashboard', 'Revlet IT Control Plane'],
      url: 'https://app.revlet.me',
      applicationCategory: 'BusinessApplication, UtilitiesApplication',
      applicationSubCategory: 'NetworkInfrastructureManagement',
      operatingSystem: 'All modern web browsers (Cloud Web Application)',
      browserRequirements: 'Requires a modern web browser with JavaScript enabled',
      softwareVersion: '0.1.0',
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      codeRepository: 'https://github.com/codexshivam/revlet',
      downloadUrl: 'https://github.com/codexshivam/revlet',
      description: 'Official cloud console for Revlet. Manage Cloudflare DNS, Email Routing, Google Workspace for Education, and Institutional Identity from one unified dashboard.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Open-source software licensed under Apache-2.0',
      },
      creator: {
        '@id': 'https://revlet.me/#organization',
      },
      publisher: {
        '@id': 'https://revlet.me/#organization',
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
    },
    // 3. WebSite Entity for the Console Domain (app.revlet.me)
    {
      '@type': 'WebSite',
      '@id': 'https://app.revlet.me/#website',
      name: 'Revlet Console',
      alternateName: ['Revlet Dashboard', 'Revlet App'],
      url: 'https://app.revlet.me',
      publisher: {
        '@id': 'https://revlet.me/#organization',
      },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://app.revlet.me/support?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
      hasPart: [
        {
          '@type': 'WebPage',
          '@id': 'https://app.revlet.me/login#webpage',
          url: 'https://app.revlet.me/login',
          name: 'Console Sign In',
          description: 'Sign in to the Revlet Console to manage DNS, email routing, and Google Workspace.',
        },
        {
          '@type': 'WebPage',
          '@id': 'https://app.revlet.me/signup#webpage',
          url: 'https://app.revlet.me/signup',
          name: 'Register Organization',
          description: 'Register your educational institution or enterprise on Revlet.',
        },
        {
          '@type': 'WebPage',
          '@id': 'https://app.revlet.me/support#webpage',
          url: 'https://app.revlet.me/support',
          name: 'Documentation & Support',
          description: 'Technical guides, FAQs, and submit priority infrastructure support tickets.',
        },
      ],
    },
    // 4. SiteNavigationElement (Organic Sitelinks Hierarchy for Google SERP)
    {
      '@type': 'ItemList',
      '@id': 'https://app.revlet.me/#sitelinks',
      name: 'Revlet Console Navigation',
      description: 'Primary administrative entrypoints and support channels of the Revlet Console.',
      itemListElement: [
        {
          '@type': 'SiteNavigationElement',
          position: 1,
          name: 'Console',
          description: 'Use the console to manage everything powering your domain — DNS records, custom email routing, and Google Workspace users.',
          url: 'https://app.revlet.me/login',
        },
        {
          '@type': 'SiteNavigationElement',
          position: 2,
          name: 'Register Organization',
          description: 'Register your educational institution or enterprise on Revlet with zero-trust multi-tenancy.',
          url: 'https://app.revlet.me/signup',
        },
        {
          '@type': 'SiteNavigationElement',
          position: 3,
          name: 'Documentation & Support',
          description: 'Access technical documentation, troubleshooting manuals, FAQs, and submit priority support tickets.',
          url: 'https://app.revlet.me/support',
        },
      ],
    },
    // 5. BreadcrumbList (Hierarchical Trail Linking app.revlet.me to revlet.me)
    {
      '@type': 'BreadcrumbList',
      '@id': 'https://app.revlet.me/#breadcrumbs',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Revlet Home',
          item: 'https://revlet.me',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Console',
          item: 'https://app.revlet.me',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Sign In',
          item: 'https://app.revlet.me/login',
        },
        {
          '@type': 'ListItem',
          position: 4,
          name: 'Support',
          item: 'https://app.revlet.me/support',
        },
      ],
    },
    // 6. FAQPage (SGE & Rich Answer Engine Snippets)
    {
      '@type': 'FAQPage',
      '@id': 'https://app.revlet.me/#faq',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is the Revlet Console?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The Revlet Console is the centralized cloud management portal located at app.revlet.me. It provides authorized administrators with unified control over Cloudflare DNS, Email Routing, and Google Workspace for Education.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do I access the Revlet Console?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Administrators can securely authenticate at https://app.revlet.me/login using their email and password or institutional Google Single Sign-On (SSO).',
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
        <JsonLd data={knowledgeGraphSchema} />
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
