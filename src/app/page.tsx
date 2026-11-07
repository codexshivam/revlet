"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useUser } from "@/firebase"
import { RevletLogo } from "@/components/brand/revlet-logo"
import {
  Globe,
  Mail,
  GraduationCap,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  LifeBuoy,
  UserPlus,
  LogIn,
} from "lucide-react"

export default function RootPage() {
  const router = useRouter()
  const { user, loading } = useUser()

  useEffect(() => {
    if (!loading && user) {
      router.replace("/account/home")
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-body text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header & Crawlable Navigation */}
      <header className="w-full bg-white border-b border-slate-200/80 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary rounded-lg p-1">
            <RevletLogo variant="horizontal" size="md" />
          </Link>

          <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
            <Link href="/login" className="hover:text-slate-900 transition-colors">
              Console
            </Link>
            <Link href="/services/dns" className="hover:text-slate-900 transition-colors">
              DNS Management
            </Link>
            <Link href="/services/email" className="hover:text-slate-900 transition-colors">
              Email Routing
            </Link>
            <Link href="/services/workspace" className="hover:text-slate-900 transition-colors">
              Google Workspace
            </Link>
            <Link href="/support" className="hover:text-slate-900 transition-colors">
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

      {/* Main Hero & Sitelinks Showcase */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-12 md:py-16 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/60 text-blue-700 text-xs font-bold tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            Enterprise IT Management &amp; Cloud Control Plane
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-headline font-bold text-slate-900 tracking-tight leading-tight">
            Revlet: Simplified Cloud &amp; Institutional Infrastructure
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal max-w-2xl mx-auto">
            Meet your institutional IT challenges with unified orchestration for Cloudflare DNS, custom email routing forwarders, and Google Workspace for Education administration.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-md transition-all group"
            >
              Open Console
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

        {/* Rich Sitelink Services Section (Reflecting Google Search Sitelinks Architecture) */}
        <section aria-labelledby="services-overview-title" className="space-y-4">
          <h2 id="services-overview-title" className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center">
            Core Portals &amp; Infrastructure Services
          </h2>

          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
            {/* Sitelink 1: Console */}
            <Link
              href="/login"
              className="group p-5 sm:p-6 flex items-start justify-between hover:bg-slate-50/80 transition-colors"
            >
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <LogIn className="w-4 h-4 text-primary" />
                  <h3 className="text-base sm:text-lg font-headline font-bold text-blue-600 group-hover:underline">
                    Console
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Use the console to manage everything powering your domain — DNS records, custom forwarding emails, and Google Workspace users.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </Link>

            {/* Sitelink 2: Free Registration */}
            <Link
              href="/signup"
              className="group p-5 sm:p-6 flex items-start justify-between hover:bg-slate-50/80 transition-colors"
            >
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-base sm:text-lg font-headline font-bold text-blue-600 group-hover:underline">
                    Get Started &amp; Organization Registration
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Register your school or business on Revlet with zero-trust multi-tenancy and start deploying Anycast DNS in minutes.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </Link>

            {/* Sitelink 3: Google Workspace */}
            <Link
              href="/services/workspace"
              className="group p-5 sm:p-6 flex items-start justify-between hover:bg-slate-50/80 transition-colors"
            >
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-base sm:text-lg font-headline font-bold text-blue-600 group-hover:underline">
                    Google Workspace for Education
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Centralized Google Workspace for Education administration. Manage users, monitor storage, track security alerts, and control user types.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </Link>

            {/* Sitelink 4: DNS Management */}
            <Link
              href="/services/dns"
              className="group p-5 sm:p-6 flex items-start justify-between hover:bg-slate-50/80 transition-colors"
            >
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-600" />
                  <h3 className="text-base sm:text-lg font-headline font-bold text-blue-600 group-hover:underline">
                    DNS Management
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Authoritative DNS record management powered by Cloudflare API v4. Deploy A, CNAME, and MX records with instant Anycast edge propagation.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </Link>

            {/* Sitelink 5: Email Routing */}
            <Link
              href="/services/email"
              className="group p-5 sm:p-6 flex items-start justify-between hover:bg-slate-50/80 transition-colors"
            >
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-amber-600" />
                  <h3 className="text-base sm:text-lg font-headline font-bold text-blue-600 group-hover:underline">
                    Custom Email Routing &amp; Domain Security
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Configure custom domain email forwarding aliases and inspect real-time SPF, DKIM, and DMARC security parameters.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </Link>

            {/* Sitelink 6: Documentation & Support */}
            <Link
              href="/support"
              className="group p-5 sm:p-6 flex items-start justify-between hover:bg-slate-50/80 transition-colors"
            >
              <div className="space-y-1 pr-4">
                <div className="flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-purple-600" />
                  <h3 className="text-base sm:text-lg font-headline font-bold text-blue-600 group-hover:underline">
                    Documentation &amp; Support
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Access technical documentation, step-by-step onboarding guides, FAQs, and submit priority infrastructure support tickets.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
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
            <a href="https://github.com/codexshivam/revlet" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
