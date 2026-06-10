import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login',
  description: 'Access the Revlet IT Management portal securely.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
