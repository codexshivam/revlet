import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Documentation & Support',
  description: 'Access technical documentation, step-by-step onboarding guides, FAQs, and submit priority infrastructure support tickets.',
  alternates: {
    canonical: 'https://app.revlet.me/support',
  },
  keywords: [
    'Revlet support',
    'IT help desk',
    'Cloudflare DNS troubleshooting',
    'Google Workspace delegation help',
    'SPF DKIM assistance',
  ],
  openGraph: {
    title: 'Documentation & Support | Revlet IT Control Plane',
    description: 'Documentation, guides, and ticket support for educational and enterprise IT teams.',
    url: 'https://app.revlet.me/support',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Revlet Documentation & Support',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Documentation & Support | Revlet IT Control Plane',
    description: 'Documentation, guides, and ticket support for educational and enterprise IT teams.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Revlet',
        item: 'https://revlet.me',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Documentation & Support',
        item: 'https://app.revlet.me/support',
      },
    ],
  };

  const supportLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Revlet Support Center',
    url: 'https://app.revlet.me/support',
    description: 'Technical documentation, service status, and customer assistance for Revlet administrators.',
    mainEntity: {
      '@type': 'Organization',
      name: 'Revlet Support',
      url: 'https://revlet.me',
      email: 'hello@revlet.me',
    },
  };

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={supportLd} />
      {children}
    </>
  );
}
