import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Email Forwarding',
  description: 'Custom domain email forwarders and SPF, DKIM, DMARC security inspection.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function EmailForwardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
