"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/firebase"
import Link from "next/link"
import { RevletLogo } from "@/components/brand/revlet-logo"
import { ArrowRight, ExternalLink } from "lucide-react"

export default function RootPage() {
  const router = useRouter()
  const { user, loading } = useUser()

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace("/account/home")
      } else {
        router.replace("/login")
      }
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-body text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between">
        <Link href="/login" className="flex items-center gap-2">
          <RevletLogo variant="horizontal" size="md" />
        </Link>
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
          <Link href="/support" className="hover:text-slate-900 transition-colors">
            Support
          </Link>
          <a
            href="https://revlet.me"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
          >
            <span>revlet.me</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </header>

      {/* Main Loading / Routing State */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-sm mx-auto">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="space-y-1">
          <h1 className="text-sm font-headline font-bold text-slate-900">
            Revlet Console
          </h1>
          <p className="text-xs text-slate-500">
            Connecting to your cloud infrastructure workspace...
          </p>
        </div>

        <noscript>
          <div className="pt-4 space-y-3">
            <p className="text-xs text-slate-600">
              JavaScript is required to manage organizations in Revlet Console.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-all"
            >
              Go to Console Sign In
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </noscript>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-slate-200/80 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>Revlet Console &bull; Multi-Tenant Cloud Control Plane</p>
          <div className="flex items-center gap-4 font-medium text-slate-600">
            <Link href="/login" className="hover:text-slate-900 transition-colors">Console</Link>
            <Link href="/support" className="hover:text-slate-900 transition-colors">Support</Link>
            <a href="https://revlet.me" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors">Website ↗</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
