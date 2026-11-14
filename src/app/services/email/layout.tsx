import { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Email Service | Revlet' },
  description: 'Manage custom domain email accounts, aliases, organizational units, groups, and domain routing.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function EmailServiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
