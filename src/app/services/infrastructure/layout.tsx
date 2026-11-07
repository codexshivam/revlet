import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Edge Infrastructure & Security',
  description: 'Cloudflare edge cache purging, SSL/TLS encryption modes, and DDoS security levels in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function InfrastructureLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
