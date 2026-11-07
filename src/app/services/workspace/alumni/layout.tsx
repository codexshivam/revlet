import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Alumni Archive',
  description: 'Manage alumni Google Workspace accounts, archival workflows, and records retention in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function WorkspaceAlumniLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
