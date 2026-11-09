import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DNS Management',
  description: 'Authoritative Cloudflare API v4 DNS records management.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DNSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
