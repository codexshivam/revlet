import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Management',
  description: 'Administer multi-tenant user access and team permissions.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
