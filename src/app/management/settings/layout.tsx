import { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Account Settings | Revlet' },
  description: 'Organization settings, security preferences, and tenant configuration in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
