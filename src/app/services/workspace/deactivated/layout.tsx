import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Deactivated Accounts',
};

export default function WorkspaceDeactivatedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
