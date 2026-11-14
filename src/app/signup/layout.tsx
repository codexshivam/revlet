import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Get Started | Revlet',
  description: 'Create your Revlet organization to manage DNS records, launch custom domain email, and delegate team access in minutes.',
  path: '/signup',
  indexable: true,
  keywords: [
    'Revlet signup',
    'get started with Revlet',
    'register organization',
    'custom domain email setup',
    'DNS Management setup',
    'team IT control plane',
  ],
  ogTitle: 'Get Started | Revlet',
  ogDescription: 'Create your Revlet organization and launch DNS and Business Email Service in minutes.',
  ogAlt: 'Get Started | Revlet',
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
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
        name: 'Get Started',
        item: 'https://app.revlet.me/signup',
      },
    ],
  };

  return (
    <>
      <JsonLd data={breadcrumbLd} />
      {children}
    </>
  );
}
