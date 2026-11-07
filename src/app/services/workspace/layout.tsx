import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: {
    default: 'Google Workspace for Education',
    template: '%s | Google Workspace | Revlet',
  },
  description: 'Centralized administration for school domains, user directory, and Google Drive storage pool monitoring.',
  alternates: {
    canonical: 'https://revlet.me/services/workspace',
  },
  openGraph: {
    title: 'Google Workspace for Education | Revlet IT Control Plane',
    description: 'Centralized administration for school domains, user directory, and Google Drive storage pool monitoring.',
    url: 'https://revlet.me/services/workspace',
    images: ['/banner.svg'],
  },
  robots: {
    index: true,
    follow: true,
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
    url: 'https://revlet.me/services/workspace',
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      {children}
    </>
  );
}
