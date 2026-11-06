import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Priority Support Desk',
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
