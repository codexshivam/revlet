import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Domain & DNS Management',
  description: 'Manage domains and Cloudflare DNS infrastructure for educational institutions and businesses.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DNSLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Domain & DNS Management',
    description: 'Manage domains and Cloudflare DNS infrastructure for educational institutions and businesses.',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NPR',
    },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
