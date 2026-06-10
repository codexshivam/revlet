import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Users',
};

export default function WorkspaceUsersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
