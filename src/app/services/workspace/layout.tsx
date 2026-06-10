import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: {
    default: 'Google Workspace | Revlet',
    template: '%s | Google Workspace | Revlet',
  },
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
      '@id': 'https://revlet.me/#organization',
      name: 'Revlet',
    },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
