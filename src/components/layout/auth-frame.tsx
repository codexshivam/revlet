import Link from "next/link"
import React from "react"
import { RevletLogo } from "@/components/brand/revlet-logo"

interface AuthFrameProps {
  children: React.ReactNode
  className?: string
}

export function AuthFrame({ children, className }: AuthFrameProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-slate-200">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-slate-200 px-4 sm:px-8 lg:px-12 h-14 flex items-center justify-between shrink-0">
        <Link
          href="https://revlet.me"
          className="flex items-center hover:opacity-90 transition-opacity"
        >
          <RevletLogo variant="horizontal" size="sm" />
        </Link>

        <nav className="flex items-center gap-4 sm:gap-6 text-xs">
          <Link
            href="/support"
            className="text-slate-500 hover:text-slate-900 transition-colors"
          >
            Support
          </Link>
          <a
            href="https://revlet.me"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-900 transition-colors"
          >
            About
          </a>
        </nav>
      </header>

      {/* Main Content Area */}
      <main
        className={`flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 ${className || ""}`}
      >
        {children}
      </main>

      {/* Bottom Footer */}
      <footer className="w-full bg-white border-t border-slate-200 px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 text-xs text-slate-500 shrink-0">
        <div className="flex items-center gap-3">
          <a
            href="https://revlet.me/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 transition-colors"
          >
            Privacy policy
          </a>
          <span className="text-slate-200 select-none">/</span>
          <a
            href="https://revlet.me/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 transition-colors"
          >
            Terms of service
          </a>
        </div>

        <div className="text-center sm:text-right text-slate-400">
          Revlet IT Management Control Plane
        </div>
      </footer>
    </div>
  )
}
