import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Storage Policies',
};

export default function WorkspaceStorageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
