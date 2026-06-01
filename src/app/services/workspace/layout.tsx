import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Google Workspace',
  description: 'Google Workspace for Education centralized administration for institutions.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Google Workspace Management',
    description: 'Google Workspace for Education centralized administration for institutions.',
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
