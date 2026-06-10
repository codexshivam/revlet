import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Website Management',
};

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
