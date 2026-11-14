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
  description: 'Official administrative console for Revlet. Unified multi-tenant control plane for DNS Management, Email Service, and Institutional Identity.',
  applicationName: 'Revlet Console',
  keywords: [
    'Revlet Console',
    'Revlet',
    'Cloud IT Management Platform',
    'DNS Management',
    'Authoritative DNS Control',
    'Business Email Service',
    'Custom Domain Email',
    'SPF DKIM DMARC Validator',
    'Team Access Control',
    'Multi-Tenant Control Plane',
    'Zero-Trust Tenancy',
  ],
  authors: [
    { name: 'Shivam Yadav', url: 'https://revlet.me/about/' },
    { name: 'Revlet', url: 'https://revlet.me' },
  ],
  creator: 'Shivam Yadav',
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
    description: 'Official administrative console for Revlet. Unified multi-tenant control plane for DNS Management, Email Service, and Institutional Identity.',
    type: 'website',
    url: 'https://app.revlet.me',
    locale: 'en_US',
    siteName: 'Revlet Console',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Revlet Console Enterprise IT Management Control Plane',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Revlet Console | Enterprise IT Management & Cloud Infrastructure',
    description: 'Official administrative console for Revlet. Unified multi-tenant control plane for DNS Management, Email Service, and Institutional Identity.',
    creator: '@revlet',
    images: ['/og-image.png'],
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
    'DC.description': 'Official administrative console for DNS Management and Enterprise Email Service.',
    'DC.subject': 'DNS Management, Email Service, Multi-Tenant IT Platform',
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
      description: 'Multi-tenant IT management control plane for DNS Management and Enterprise Email Service.',
      foundingDate: '2024',
      founder: {
        '@type': 'Person',
        '@id': 'https://revlet.me/about/#shivam-yadav',
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
        'https://github.com/codexshivam',
      ],
      areaServed: {
        '@type': 'Place',
        name: 'Worldwide',
      },
      knowsAbout: [
        'Cloudflare DNS & Edge Infrastructure',
        'Enterprise Email Service',
        'Google Admin SDK',
        'Domain-Wide Delegation',
        'Email Routing Protocols',
        'SPF, DKIM, and DMARC Verification',
        'Zero-Trust Multi-Tenancy',
        {
          '@type': 'DefinedTerm',
          name: 'Cloud Computing',
          sameAs: 'https://www.wikidata.org/wiki/Q483639',
        },
        {
          '@type': 'DefinedTerm',
          name: 'Domain Name System',
          sameAs: 'https://www.wikidata.org/wiki/Q8767',
        },
        {
          '@type': 'DefinedTerm',
          name: 'TypeScript',
          sameAs: 'https://www.wikidata.org/wiki/Q982476',
        },
        {
          '@type': 'DefinedTerm',
          name: 'Next.js',
          sameAs: 'https://www.wikidata.org/wiki/Q105085340',
        },
      ],
    },
    // 2. Person Entity (Shivam Yadav — Founder & Principal Developer)
    {
      '@type': 'Person',
      '@id': 'https://revlet.me/about/#shivam-yadav',
      name: 'Shivam Yadav',
      alternateName: ['codexshivam', 'Shivam'],
      jobTitle: 'Founder & Principal Software Engineer',
      description: 'Shivam Yadav is an enterprise software engineer, systems architect, and the creator and lead developer of Revlet.',
      url: 'https://revlet.me/about/#shivam-yadav',
      image: 'https://revlet.me/favicon-192x192.png',
      worksFor: {
        '@id': 'https://revlet.me/#organization',
      },
      founder: {
        '@id': 'https://revlet.me/#organization',
      },
      sameAs: [
        'https://github.com/codexshivam',
        'https://github.com/codexshivam/revlet',
      ],
      knowsAbout: [
        'Authoritative DNS & Edge Infrastructure',
        'Business Email Service & Deliverability',
        'SPF, DKIM & DMARC Security',
        'Next.js & TypeScript Architecture',
        'Zero-Trust Multi-Tenancy',
        {
          '@type': 'DefinedTerm',
          name: 'Cloud Computing',
          sameAs: 'https://www.wikidata.org/wiki/Q483639',
        },
        {
          '@type': 'DefinedTerm',
          name: 'Domain Name System',
          sameAs: 'https://www.wikidata.org/wiki/Q8767',
        },
        {
          '@type': 'DefinedTerm',
          name: 'TypeScript',
          sameAs: 'https://www.wikidata.org/wiki/Q982476',
        },
        {
          '@type': 'DefinedTerm',
          name: 'Computer Security',
          sameAs: 'https://www.wikidata.org/wiki/Q3510521',
        },
      ],
    },
    // 3. Software Application Entity (Console WebApplication Node on app.revlet.me)
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
      softwareVersion: '1.1.0',
      datePublished: '2024-05-30',
      inLanguage: 'en',
      programmingLanguage: ['TypeScript', 'JavaScript'],
      license: 'https://www.apache.org/licenses/LICENSE-2.0',
      codeRepository: 'https://github.com/codexshivam/revlet',
      downloadUrl: 'https://github.com/codexshivam/revlet',
      screenshot: 'https://app.revlet.me/og-image.png',
      isAccessibleForFree: true,
      description: 'Official cloud console for Revlet. Manage DNS Management, Email Service, and Institutional Identity from one unified dashboard.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Open-source software licensed under Apache-2.0',
      },
      author: {
        '@id': 'https://revlet.me/about/#shivam-yadav',
      },
      creator: {
        '@id': 'https://revlet.me/about/#shivam-yadav',
      },
      maintainer: {
        '@id': 'https://revlet.me/about/#shivam-yadav',
      },
      publisher: {
        '@id': 'https://revlet.me/#organization',
      },
      featureList: [
        'Authoritative DNS Management & Zone Snapshots',
        'Custom Domain Business Email Service',
        'SPF, DKIM, and DMARC Compliance Auditing',
        'Organizational Units, Aliases & Mailing Groups',
        'Bulk CSV Mailbox Import & Export',
        '14-Day Soft-Delete Recovery & Retention Alerts',
        'Per-Organization Granular Team Permissions',
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
          description: 'Sign in to the Revlet Console to manage DNS and Email Service.',
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
          description: 'Use the console to manage everything powering your domain — DNS records and enterprise email service.',
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
            text: 'The Revlet Console is the centralized cloud management portal located at app.revlet.me. It provides authorized administrators with unified control over DNS Management and Enterprise Email Service.',
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
          name: 'How does Revlet manage Email Service?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Revlet provisions custom domain mailboxes, groups, and organizational units with automated SPF, DKIM, and DMARC authentication and per-organization quota enforcement.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does Revlet manage DNS?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Revlet executes atomic CRUD operations on DNS records (A, AAAA, CNAME, MX, TXT, SRV, CAA, PTR, NS), supports point-in-time zone snapshots, and allows managed or Bring-Your-Own-Token zones.',
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
