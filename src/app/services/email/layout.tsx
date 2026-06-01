import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Email Services',
  description: 'Secure and scalable enterprise email infrastructure management tailored for businesses.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function EmailLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Email Services Management',
    description: 'Secure and scalable enterprise email infrastructure management tailored for businesses.',
    provider: {
      '@type': 'Organization',
      name: 'Revlet IT Management',
    },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
