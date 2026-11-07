import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Create an Account & Register Organization',
  description: 'Register your educational institution or enterprise on Revlet. Deploy Cloudflare Anycast DNS, configure custom email routing, and automate Google Workspace administration in minutes.',
  alternates: {
    canonical: 'https://app.revlet.me/signup',
  },
  keywords: [
    'Revlet signup',
    'register organization',
    'educational IT management',
    'free IT control plane',
    'Cloudflare DNS setup',
    'Google Workspace onboarding',
  ],
  openGraph: {
    title: 'Create Account | Revlet IT Management Control Plane',
    description: 'Start managing your organization\'s IT infrastructure in minutes with zero-trust tenancy.',
    url: 'https://app.revlet.me/signup',
    type: 'website',
    images: [
      {
        url: '/banner.svg',
        width: 1200,
        height: 320,
        alt: 'Revlet Create Account',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Create Account | Revlet IT Management Control Plane',
    description: 'Start managing your organization\'s IT infrastructure in minutes with zero-trust tenancy.',
    images: ['/banner.svg'],
  },
  robots: {
    index: true,
    follow: true,
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
