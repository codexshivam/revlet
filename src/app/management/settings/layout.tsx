import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Account Settings',
  description: 'Organization and security preferences for Revlet IT Management.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
