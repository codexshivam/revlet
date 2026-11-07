import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Tokens',
  description: 'Manage API tokens and programmatic access credentials for Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function TokensLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
