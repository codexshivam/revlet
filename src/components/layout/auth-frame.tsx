import Link from "next/link"
import React from "react"

interface AuthFrameProps {
  children: React.ReactNode
  className?: string
}

export function AuthFrame({ children, className }: AuthFrameProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-slate-200">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-slate-200 px-4 sm:px-8 lg:px-12 h-14 flex items-center justify-between shrink-0">
        <a
          href="https://revlet.me/"
          aria-label="Revlet Platform"
          className="flex items-center gap-2 hover:opacity-85 transition-opacity"
        >
          <img src="/brand/revlet-mark.svg" alt="Revlet Platform" className="w-6 h-6 shrink-0" />
          <span className="font-semibold text-base tracking-tight text-slate-900">
            Revlet
          </span>
        </a>

        <nav aria-label="Primary navigation" className="flex items-center gap-4 sm:gap-6 text-xs">
          <a
            href="https://revlet.me/dns/"
            className="hidden sm:inline text-slate-500 hover:text-slate-900 transition-colors"
          >
            DNS Management
          </a>
          <a
            href="https://revlet.me/mail/"
            className="hidden sm:inline text-slate-500 hover:text-slate-900 transition-colors"
          >
            RevletMail
          </a>
          <Link
            href="/support"
            className="text-slate-500 hover:text-slate-900 transition-colors"
          >
            Help &amp; Support
          </Link>
          <a
            href="https://revlet.me/about/"
            className="text-slate-500 hover:text-slate-900 transition-colors"
          >
            About
          </a>
        </nav>
      </header>

      {/* Main Content Area */}
      <main
        id="main-content"
        className={`flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 ${className || ""}`}
      >
        {children}
      </main>

      {/* Bottom Footer */}
      <footer className="w-full bg-white border-t border-slate-200 px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 text-xs text-slate-500 shrink-0">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <a
            href="https://revlet.me/security/whitepaper/"
            className="hover:text-slate-900 transition-colors"
          >
            Security Whitepaper
          </a>
          <span className="text-slate-200 select-none">/</span>
          <a
            href="https://revlet.me/contact/"
            className="hover:text-slate-900 transition-colors"
          >
            Help &amp; Support
          </a>
          <span className="text-slate-200 select-none">/</span>
          <a
            href="https://revlet.me/privacy/"
            className="hover:text-slate-900 transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-slate-200 select-none">/</span>
          <a
            href="https://revlet.me/terms/"
            className="hover:text-slate-900 transition-colors"
          >
            Terms of Service
          </a>
        </div>

        <div className="text-center sm:text-right text-slate-400">
          Revlet Platform &middot; Developed &amp; Managed by Shivam Yadav
        </div>
      </footer>
    </div>
  )
}
