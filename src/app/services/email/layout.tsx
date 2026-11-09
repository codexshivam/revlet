import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Custom Email Routing',
  description: 'Custom domain email forwarders and SPF, DKIM, DMARC security inspection.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function EmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
