import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cloudflare DNS Infrastructure',
  description: 'Authoritative Cloudflare DNS management, Anycast edge records, and proxy settings for educational institutions and enterprises.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DNSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
