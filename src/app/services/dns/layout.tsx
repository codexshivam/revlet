import { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'DNS Management | Relvet' },
  description: 'Authoritative DNS records management.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DNSLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
