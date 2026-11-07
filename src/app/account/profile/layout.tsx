import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Administrator Profile',
  description: 'Manage your Revlet administrator credentials, security preferences, and account settings.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
