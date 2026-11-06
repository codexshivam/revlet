import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Classes & Sections',
  description: 'Manage academic classes, sections, and organizational rosters in Revlet IT Manager.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AcademicsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
