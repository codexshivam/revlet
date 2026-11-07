import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Billing & Subscriptions',
  description: 'Manage your organization plan, payment vouchers, transaction history, and subscription details in Revlet.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
