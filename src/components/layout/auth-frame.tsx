import Link from "next/link"
import React from "react"

interface AuthFrameProps {
  children: React.ReactNode
  className?: string
}

export function AuthFrame({ children, className }: AuthFrameProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col justify-between selection:bg-slate-200">
      
      {/* TOP HEADER */}
      <header className="w-full bg-white border-b border-[#eceef0] px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
        <Link 
          href="https://revlet.me" 
          className="font-headline font-bold text-sm tracking-tight text-slate-900 hover:text-primary transition-colors flex items-center gap-2"
        >
          <span>Revlet</span>
          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 font-normal">Console</span>
        </Link>

        <nav className="flex items-center gap-3.5 sm:gap-6 text-[11px] sm:text-xs">
          <Link 
            href="/support" 
            className="text-slate-600 hover:text-slate-900 transition-colors font-medium"
          >
            Support
          </Link>
          <a 
            href="https://revlet.me" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-slate-600 hover:text-slate-900 underline underline-offset-4 transition-colors font-medium"
          >
            About Revlet
          </a>
        </nav>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className={`flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 ${className || ""}`}>
        {children}
      </main>

      {/* BOTTOM FOOTER */}
      <footer className="w-full bg-white border-t border-[#eceef0] px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 text-[11px] sm:text-xs text-slate-500 shrink-0">
        <div className="flex items-center gap-3">
          <a 
            href="https://revlet.me/privacy" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-slate-800 transition-colors"
          >
            Privacy Policy
          </a>
          <span className="text-slate-300 select-none">|</span>
          <a 
            href="https://revlet.me/terms" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-slate-800 transition-colors"
          >
            Terms of Services
          </a>
        </div>

        <div className="text-center sm:text-right">
          <span>Powered by </span>
          <span className="font-semibold text-slate-800">Revlet</span>
        </div>
      </footer>

    </div>
  )
}
