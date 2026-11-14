import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Help & Support | Revlet',
  description: 'Access technical documentation, step-by-step onboarding guides, FAQs, and submit infrastructure support tickets.',
  path: '/support',
  indexable: true,
  keywords: [
    'Revlet support',
    'IT help desk',
    'DNS troubleshooting',
    'DNS Management help',
    'Email Service help',
    'SPF DKIM assistance',
  ],
  ogTitle: 'Help & Support | Revlet',
  ogDescription: 'Documentation, FAQs, and ticket support for Revlet organizations and IT teams.',
  ogAlt: 'Help & Support | Revlet',
});

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
