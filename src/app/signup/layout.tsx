import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Register your organization on the Revlet IT Management platform.',
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
