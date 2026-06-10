import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Login',
  description: 'Sign in to the Revlet Dashboard — manage DNS, email, Google Workspace, and IT infrastructure for your organization.',
  alternates: {
    canonical: 'https://app.revlet.me/login',
  },
  openGraph: {
    title: 'Login | Revlet Dashboard',
    description: 'Access your organization\'s infrastructure management dashboard.',
    url: 'https://app.revlet.me/login',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
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
        name: 'Login',
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
