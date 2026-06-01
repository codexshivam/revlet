
import type { Metadata } from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: {
    default: 'Revlet IT Management | Enterprise IT Solutions',
    template: '%s | Revlet IT Management'
  },
  description: 'Enterprise Infrastructure Management Platform for business owners and educational institutions. Manage DNS, Email, Google Workspace, and Team access securely.',
  openGraph: {
    title: 'Revlet IT Management | Enterprise IT Solutions',
    description: 'Enterprise Infrastructure Management Platform for business owners and educational institutions.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Revlet IT Management',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Revlet IT Management',
    description: 'Enterprise Infrastructure Management Platform for business owners and educational institutions.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
