import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'DNS Management',
  description: 'Authoritative Cloudflare API v4 DNS records management with instant Anycast edge propagation.',
  alternates: {
    canonical: 'https://revlet.me/services/dns',
  },
  openGraph: {
    title: 'DNS Management | Revlet IT Control Plane',
    description: 'Authoritative Cloudflare API v4 DNS records management with instant Anycast edge propagation.',
    url: 'https://revlet.me/services/dns',
    images: ['/banner.svg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function DNSLayout({ children }: { children: React.ReactNode }) {
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
        name: 'DNS Management',
        item: 'https://revlet.me/services/dns',
      },
    ],
  };

  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Authoritative DNS Management',
    description: 'Cloudflare API v4 DNS records orchestration with instant Anycast edge propagation.',
    provider: {
      '@type': 'Organization',
      '@id': 'https://revlet.me/#organization',
      name: 'Revlet',
    },
    url: 'https://revlet.me/services/dns',
  };

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      <JsonLd data={serviceLd} />
      {children}
    </>
  );
}
