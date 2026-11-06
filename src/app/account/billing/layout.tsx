import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Billing & Payments',
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
