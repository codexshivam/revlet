"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { TopHeader } from "@/components/layout/top-header"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase"
import { useRouter } from "next/navigation"

const CommandPalette = dynamic(
  () => import("@/components/layout/command-palette").then((mod) => mod.CommandPalette),
  { ssr: false }
)

export function DashboardShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { user, loading } = useUser()
  const router = useRouter()
  const [mfaAllowed, setMfaAllowed] = React.useState(false)

  React.useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
      return
    }
    if (!loading && user) {
      let cancelled = false
      user
        .getIdToken()
        .then((token) =>
          fetch("/api/auth/mfa", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          })
        )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return
          if (data?.ok && (data.hasEnrolledMfa || data.enforceMfa) && !data.mfaSessionVerified) {
            router.replace("/login?mfa=1")
            return
          }
          setMfaAllowed(true)
        })
        .catch(() => {
          if (!cancelled) setMfaAllowed(true)
        })
      return () => {
        cancelled = true
      }
    }
  }, [user, loading, router])

  if (loading || !user || !mfaAllowed) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading workspace"
        className="min-h-screen w-full flex items-center justify-center bg-white"
      >
        <div className="flex flex-col items-center gap-3 animate-fade-up-in">
          <div className="font-headline font-bold text-[30px] tracking-tight text-slate-950 select-none">
            Revlet
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <span>Loading workspace...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full flex bg-slate-50 overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3.5 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-white focus:text-xs focus:font-medium focus:shadow-md focus:outline-none"
      >
        Skip to main content
      </a>
      <CommandPalette />
      <RecursiveSidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 h-[100dvh] overflow-hidden">
        <TopHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 focus:outline-none"
        >
          <div
            className={cn(
              "p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 min-h-[calc(100dvh-3.5rem)] flex flex-col",
              className
            )}
          >
            <div className="space-y-6 sm:space-y-8 flex-1 animate-fade-up-in">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
