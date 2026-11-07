import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Classes & Sections',
  description: 'Manage academic classes, sections, and student organizational units in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AcademicsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
