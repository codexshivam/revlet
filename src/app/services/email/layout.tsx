import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Custom Email Routing & Domain Security',
  description: 'Cloudflare Email Routing rules, destination inbox forwarders, and real-time SPF, DKIM, and DMARC compliance auditing.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function EmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
