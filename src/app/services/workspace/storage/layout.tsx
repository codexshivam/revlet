import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Drive Storage Quotas',
  description: 'Monitor aggregate Google Drive storage pools, consumption trends, and capacity alerts in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function WorkspaceStorageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
