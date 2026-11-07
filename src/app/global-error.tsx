"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertOctagon, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Revlet Root Global Error:", error)
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-800 antialiased">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-600 shadow-sm">
            <AlertOctagon className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Critical System Failure
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              A critical layout exception occurred. Please attempt to reinitialize the session or reload the application.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => reset()}
              className="w-full sm:w-auto font-bold text-xs h-10 px-5 bg-slate-900 hover:bg-black text-white rounded-lg shadow-sm gap-2 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Application
            </Button>
            <a href="/login" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full sm:w-auto font-bold text-xs h-10 px-5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-black rounded-lg transition-all shadow-none"
              >
                Return to Login
              </Button>
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
