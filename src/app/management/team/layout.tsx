import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team & Access Control',
};

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
