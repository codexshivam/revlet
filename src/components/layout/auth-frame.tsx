import Link from "next/link"
import React from "react"

interface AuthFrameProps {
  children: React.ReactNode
  className?: string
}

export function AuthFrame({ children, className }: AuthFrameProps) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:16px_16px] p-2.5 sm:p-4 md:p-6 lg:p-8 flex items-center justify-center selection:bg-slate-200">
      <div className="w-full max-w-[1080px] min-h-[calc(100vh-1.25rem)] sm:min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)] bg-white border border-[#e2e8f0] rounded-xl sm:rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col justify-between overflow-hidden my-auto">
        
        {/* TOP HEADER */}
        <header className="w-full px-4 sm:px-8 py-3.5 sm:py-4 border-b border-[#eceef0] flex items-center justify-between">
          <Link 
            href="https://revlet.me" 
            className="font-bold text-xs sm:text-sm tracking-wider text-slate-800 hover:text-slate-900 uppercase font-headline transition-colors"
          >
            REVLET
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
              Know more on revlet.me
            </a>
          </nav>
        </header>

        {/* MAIN CONTENT AREA */}
        <main className={`flex-1 flex items-center justify-center px-4 py-8 sm:py-12 ${className || ""}`}>
          {children}
        </main>

        {/* BOTTOM FOOTER */}
        <footer className="w-full px-4 sm:px-8 py-3.5 sm:py-4 border-t border-[#eceef0] flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 text-[11px] sm:text-xs text-slate-500">
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
            <span className="font-semibold text-slate-800">Revlet Platforms Private Limited</span>
          </div>
        </footer>

      </div>
    </div>
  )
}
