import Link from 'next/link';
import React from 'react';
import { RevletLogo } from '@/components/brand/revlet-logo';
import {
  Mail,
  LifeBuoy,
  HelpCircle,
  LogIn,
  UserPlus,
  ArrowRight,
  ShieldCheck,
  Globe,
  GraduationCap,
  FileCode2,
} from 'lucide-react';

export function PublicSupportView() {
  const faqs = [
    {
      q: 'What is Revlet?',
      a: 'Revlet is an open-source, multi-tenant Enterprise IT Management Control Plane designed for educational institutions and distributed organizations. It unifies Cloudflare DNS, Email Routing, and Google Workspace for Education administration into a single pane of glass.',
    },
    {
      q: 'How does Revlet manage Google Workspace for Education?',
      a: 'Revlet integrates with the Google Workspace Admin SDK using a Google Cloud Service Account configured with Domain-Wide Delegation (DWD). It enables administrators to provision users, manage Organizational Units (OUs), monitor Google Drive storage quotas, and ingest security alerts directly.',
    },
    {
      q: 'How does Revlet interact with Cloudflare DNS and Email Routing?',
      a: 'Revlet uses Cloudflare API v4 with organization-scoped bearer tokens to execute atomic CRUD operations on DNS records (A, AAAA, CNAME, MX, TXT, SRV), toggle CDN proxying, purge edge caches, and configure custom domain email forwarding aliases.',
    },
    {
      q: 'Is Revlet secure for multi-tenant organizations?',
      a: 'Yes. Revlet enforces a Defense-in-Depth security model featuring Server Actions tenancy verification to prevent Insecure Direct Object References (IDOR), granular Firestore security rules, and strict Content Security Policy (CSP) headers.',
    },
    {
      q: 'How long does DNS record propagation take?',
      a: 'Changes made through Revlet are committed directly to Cloudflare’s global Anycast edge network, typically propagating worldwide in under 10 seconds for proxied and standard records.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-body text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary rounded-lg p-1"
          >
            <RevletLogo variant="horizontal" size="md" />
          </Link>

          <nav
            aria-label="Support Navigation"
            className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600"
          >
            <Link
              href="/login"
              className="hover:text-slate-900 transition-colors"
            >
              Console
            </Link>
            <Link
              href="/services/dns"
              className="hover:text-slate-900 transition-colors"
            >
              DNS Management
            </Link>
            <Link
              href="/services/email"
              className="hover:text-slate-900 transition-colors"
            >
              Email Routing
            </Link>
            <Link
              href="/services/workspace"
              className="hover:text-slate-900 transition-colors"
            >
              Google Workspace
            </Link>
            <Link
              href="/support"
              className="text-blue-600 font-bold"
            >
              Documentation &amp; Support
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-black hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-sm transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-10 md:py-14 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-xs font-bold tracking-wide">
            <LifeBuoy className="w-3.5 h-3.5 text-blue-600" />
            Documentation &amp; Support Center
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-headline font-bold text-slate-900 tracking-tight leading-tight">
            How can we help your IT team today?
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal max-w-2xl mx-auto">
            Find answers to frequently asked questions, consult architectural guides, or reach out directly to the Revlet infrastructure engineering desk.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <a
              href="mailto:hello@revlet.me"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-md transition-all group"
            >
              <Mail className="w-4 h-4" />
              Email Support: hello@revlet.me
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:text-black hover:bg-slate-50 rounded-lg transition-colors shadow-sm"
            >
              Open Console Ticket
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Contact Methods Grid */}
        <section aria-labelledby="support-channels-title" className="space-y-4">
          <h2
            id="support-channels-title"
            className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center"
          >
            Direct Assistance Channels
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <Mail className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-headline font-bold text-slate-900">
                Direct Email Help Desk
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contact our infrastructure team directly for incident response or onboarding questions.
              </p>
              <a
                href="mailto:hello@revlet.me"
                className="text-xs font-bold text-blue-600 hover:underline pt-2 block"
              >
                hello@revlet.me ↗
              </a>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <LogIn className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-headline font-bold text-slate-900">
                Console Ticket Portal
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Registered tenants can track ticket history, status updates, and priority resolutions.
              </p>
              <Link
                href="/login"
                className="text-xs font-bold text-blue-600 hover:underline pt-2 block"
              >
                Sign in to view tickets ↗
              </Link>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                <FileCode2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-headline font-bold text-slate-900">
                Open Source &amp; Docs
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Inspect architecture documentation, security rules, and submit code contributions on GitHub.
              </p>
              <a
                href="https://github.com/codexshivam/revlet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 hover:underline pt-2 block"
              >
                GitHub Repository ↗
              </a>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section aria-labelledby="faq-title" className="space-y-4">
          <h2
            id="faq-title"
            className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center"
          >
            Frequently Asked Questions
          </h2>
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 shadow-sm overflow-hidden">
            {faqs.map((faq, i) => (
              <div key={i} className="p-5 sm:p-6 space-y-2">
                <h3 className="text-base font-headline font-bold text-slate-900 flex items-start gap-2.5">
                  <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-1" />
                  <span>{faq.q}</span>
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed pl-6.5">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>Revlet — Open-Source Enterprise IT Management Control Plane</p>
          <div className="flex items-center gap-4 font-medium text-slate-600">
            <Link href="/login" className="hover:text-slate-900 transition-colors">Console</Link>
            <Link href="/support" className="hover:text-slate-900 transition-colors">Support</Link>
            <a
              href="https://github.com/codexshivam/revlet"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
