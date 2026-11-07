import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DNS Management',
  description: 'Authoritative Cloudflare API v4 DNS records management with instant Anycast edge propagation.',
  alternates: {
    canonical: 'https://revlet.me/services/dns',
  },
  openGraph: {
    title: 'DNS Management | Revlet IT Control Plane',
    description: 'Authoritative Cloudflare API v4 DNS records management with instant Anycast edge propagation.',
    url: 'https://revlet.me/services/dns',
    images: ['/banner.svg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function DNSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
