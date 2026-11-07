import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Directory',
  description: 'Google Workspace for Education user accounts, directory status, and OU hierarchy in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function WorkspaceUsersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
