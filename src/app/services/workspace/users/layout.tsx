import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'User Directory',
};

export default function WorkspaceUsersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
