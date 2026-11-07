import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Custom Email Routing',
  description: 'Configure custom domain forwarder aliases and inspect real-time SPF, DKIM, and DMARC parameters.',
  alternates: {
    canonical: 'https://revlet.me/services/email',
  },
  openGraph: {
    title: 'Custom Email Routing | Revlet IT Control Plane',
    description: 'Configure custom domain forwarder aliases and inspect real-time SPF, DKIM, and DMARC parameters.',
    url: 'https://revlet.me/services/email',
    images: ['/banner.svg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function EmailLayout({ children }: { children: React.ReactNode }) {
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
        name: 'Custom Email Routing',
        item: 'https://revlet.me/services/email',
      },
    ],
  };

  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Custom Domain Email Routing & Security',
    description: 'Cloudflare email routing rules and SPF, DKIM, DMARC security posture analysis.',
    provider: {
      '@type': 'Organization',
      '@id': 'https://revlet.me/#organization',
      name: 'Revlet',
    },
    url: 'https://revlet.me/services/email',
  };

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={serviceLd} />
      {children}
    </>
  );
}
