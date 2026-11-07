import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Deactivated Accounts',
  description: 'View suspended and deactivated accounts with one-click restore and permanent purge actions in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function WorkspaceDeactivatedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
