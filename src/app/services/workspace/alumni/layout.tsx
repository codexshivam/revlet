import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Alumni',
};

export default function WorkspaceAlumniLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
