import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Secure Login',
  description: 'Access the Revlet IT Management portal securely.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
