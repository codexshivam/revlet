"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, Home, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log unexpected runtime exception for diagnostics
    console.error("Revlet Application Error:", error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4 selection:bg-primary selection:text-white">
      <div className="w-full max-w-md bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/40 p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center mx-auto text-amber-600 shadow-sm">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-headline font-bold text-slate-900 tracking-tight">
            Unexpected System Exception
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            An unhandled runtime error occurred while processing this view. You can reload this component or return to the main dashboard.
          </p>
          {error.digest && (
            <p className="text-[10px] font-mono text-slate-400 bg-slate-50 py-1 px-2 rounded border border-slate-100 inline-block">
              Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => reset()}
            className="w-full sm:w-auto font-bold text-xs h-10 px-5 bg-slate-900 hover:bg-black text-white rounded-lg shadow-sm gap-2 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </Button>
          <Link href="/account/home" className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full sm:w-auto font-bold text-xs h-10 px-5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-black rounded-lg gap-2 transition-all shadow-none"
            >
              <Home className="w-3.5 h-3.5" />
              Account Home
            </Button>
          </Link>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-4 text-[11px] text-slate-400 font-medium">
          <Link href="/support" className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors">
            <HelpCircle className="w-3.5 h-3.5" />
            Contact Platform Support
          </Link>
        </div>
      </div>
    </div>
  )
}
