import { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Account Home | Revlet' },
  description: 'Manage institutional tenants, active organizations, and platform overview in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
