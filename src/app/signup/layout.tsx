import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Register your organization on Revlet — the unified infrastructure management platform for institutions and businesses.',
  alternates: {
    canonical: 'https://app.revlet.me/signup',
  },
  openGraph: {
    title: 'Create Account | Revlet Dashboard',
    description: 'Start managing your organization\'s IT infrastructure in minutes.',
    url: 'https://app.revlet.me/signup',
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Revlet',
        item: 'https://app.revlet.me',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Create Account',
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
