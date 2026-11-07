import Link from 'next/link';
import React from 'react';
import { RevletLogo } from '@/components/brand/revlet-logo';
import { ArrowRight, LogIn, UserPlus, ShieldCheck, CheckCircle2 } from 'lucide-react';

export interface ServiceFeature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

export interface PublicServiceShowcaseProps {
  badge: string;
  title: string;
  description: string;
  badgeIcon?: React.ReactNode;
  features: ServiceFeature[];
  previewComponent?: React.ReactNode;
  currentPath: string;
}

export function PublicServiceShowcase({
  badge,
  title,
  description,
  badgeIcon,
  features,
  previewComponent,
  currentPath,
}: PublicServiceShowcaseProps) {
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
            aria-label="Service Navigation"
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
              className={
                currentPath === '/services/dns'
                  ? 'text-blue-600 font-bold'
                  : 'hover:text-slate-900 transition-colors'
              }
            >
              DNS Management
            </Link>
            <Link
              href="/services/email"
              className={
                currentPath === '/services/email'
                  ? 'text-blue-600 font-bold'
                  : 'hover:text-slate-900 transition-colors'
              }
            >
              Email Routing
            </Link>
            <Link
              href="/services/workspace"
              className={
                currentPath === '/services/workspace'
                  ? 'text-blue-600 font-bold'
                  : 'hover:text-slate-900 transition-colors'
              }
            >
              Google Workspace
            </Link>
            <Link
              href="/support"
              className="hover:text-slate-900 transition-colors"
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
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 md:py-14 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-xs font-bold tracking-wide">
            {badgeIcon || <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />}
            {badge}
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-headline font-bold text-slate-900 tracking-tight leading-tight">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal max-w-2xl mx-auto">
            {description}
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-md transition-all group"
            >
              Open in Console
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:text-black hover:bg-slate-50 rounded-lg transition-colors shadow-sm"
            >
              Register Organization
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <section aria-labelledby="service-features-title" className="space-y-4">
          <h2
            id="service-features-title"
            className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center"
          >
            Capabilities &amp; Infrastructure Specifications
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, i) => (
              <div
                key={i}
                className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-2.5 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    {feature.icon}
                  </div>
                  <h3 className="text-sm font-headline font-bold text-slate-900">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 pt-2 border-t border-slate-100">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Production Ready</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Optional Preview / Showcase Component */}
        {previewComponent && (
          <section aria-labelledby="service-preview-title" className="space-y-4">
            <h2
              id="service-preview-title"
              className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center"
            >
              Interface &amp; Administrative Preview
            </h2>
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden">
              {previewComponent}
            </div>
          </section>
        )}

        {/* Cross-Service Navigation */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4 max-w-4xl mx-auto">
          <h2 className="text-lg font-headline font-bold text-slate-900">
            Explore Revlet Infrastructure Control Plane
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
            Revlet unifies Cloudflare DNS, Custom Email Routing, and Google Workspace for Education into a single zero-trust administrative interface.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/services/dns"
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              DNS Management ↗
            </Link>
            <Link
              href="/services/email"
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Email Routing ↗
            </Link>
            <Link
              href="/services/workspace"
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Google Workspace ↗
            </Link>
            <Link
              href="/support"
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Support Center ↗
            </Link>
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
