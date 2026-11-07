import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Custom Email Routing',
  description: 'Configure custom domain forwarder aliases and inspect real-time SPF, DKIM, and DMARC parameters.',
  alternates: {
    canonical: 'https://revlet.me/services/email',
  },
  openGraph: {
    title: 'Custom Email Routing | Revlet IT Control Plane',
    description: 'Configure custom domain forwarder aliases and inspect real-time SPF, DKIM, and DMARC parameters.',
    url: 'https://revlet.me/services/email',
    images: ['/banner.svg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function EmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
