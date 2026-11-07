import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Help, Documentation & Support Center',
  description: 'Access Revlet official documentation, troubleshooting guides, FAQs, and submit priority support tickets for DNS, email routing, and Google Workspace integrations.',
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
    title: 'Help & Support | Revlet IT Management Control Plane',
    description: 'Documentation, guides, and ticket support for educational and enterprise IT teams.',
    url: 'https://app.revlet.me/support',
    type: 'website',
    images: [
      {
        url: '/banner.svg',
        width: 1200,
        height: 320,
        alt: 'Revlet Help & Support',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help & Support | Revlet IT Management Control Plane',
    description: 'Documentation, guides, and ticket support for educational and enterprise IT teams.',
    images: ['/banner.svg'],
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
        item: 'https://app.revlet.me',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Help & Support',
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
