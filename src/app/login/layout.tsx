import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Sign In to Your IT Control Plane',
  description: 'Access your organization\'s infrastructure management control plane. Manage Cloudflare DNS, Email Routing, and Google Workspace for Education securely.',
  alternates: {
    canonical: 'https://app.revlet.me/login',
  },
  keywords: [
    'Revlet login',
    'IT management sign in',
    'Cloudflare DNS portal',
    'Google Workspace admin login',
    'school IT dashboard',
  ],
  openGraph: {
    title: 'Sign In | Revlet IT Management Control Plane',
    description: 'Access your organization\'s unified infrastructure management dashboard.',
    url: 'https://app.revlet.me/login',
    type: 'website',
    images: [
      {
        url: '/banner.svg',
        width: 1200,
        height: 320,
        alt: 'Revlet Sign In',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sign In | Revlet IT Management Control Plane',
    description: 'Access your organization\'s unified infrastructure management dashboard.',
    images: ['/banner.svg'],
  },
  robots: {
    index: true,
    follow: true,
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
