import { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Google Workspace for Education',
    template: '%s | Google Workspace | Revlet Console',
  },
  description: 'Centralized administration for school domains, user directory, and Google Drive storage pool monitoring.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
