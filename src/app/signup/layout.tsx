import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'Get Started & Organization Registration',
  description: 'Register your school or business on Revlet with zero-trust multi-tenancy and start deploying Anycast DNS in minutes.',
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
    title: 'Get Started | Revlet IT Management Control Plane',
    description: "Start managing your organization's IT infrastructure in minutes with zero-trust tenancy.",
    url: 'https://app.revlet.me/signup',
    type: 'website',
    images: [
      {
        url: '/banner.svg',
        width: 1200,
        height: 320,
        alt: 'Revlet Get Started',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Get Started | Revlet IT Management Control Plane',
    description: "Start managing your organization's IT infrastructure in minutes with zero-trust tenancy.",
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
