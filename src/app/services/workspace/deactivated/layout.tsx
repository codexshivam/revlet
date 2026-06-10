import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Archive',
};

export default function WorkspaceDeactivatedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
