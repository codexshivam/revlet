import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Login | Revlet',
  description: 'Sign in to Revlet to manage your organization domains, DNS records, custom email service, and team access.',
  path: '/login',
  indexable: true,
  keywords: [
    'Revlet login',
    'Revlet console sign in',
    'DNS Management login',
    'Email Service login',
    'business email admin console',
    'team access control',
  ],
  ogTitle: 'Login | Revlet',
  ogDescription: "Access your organization's unified DNS, Email, and Team Management console.",
  ogAlt: 'Login | Revlet',
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
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
        name: 'Console',
        item: 'https://app.revlet.me/login',
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
