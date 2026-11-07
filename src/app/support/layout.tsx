import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help & Support',
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
