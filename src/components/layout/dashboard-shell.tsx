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

const verifiedMfaUids = new Set<string>()

function isMfaCachedForUser(uid: string): boolean {
  if (verifiedMfaUids.has(uid)) return true
  if (typeof window !== "undefined") {
    try {
      return sessionStorage.getItem("revlet_mfa_verified_uid") === uid
    } catch {
      return false
    }
  }
  return false
}

function cacheMfaForUser(uid: string) {
  verifiedMfaUids.add(uid)
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("revlet_mfa_verified_uid", uid)
    } catch {
      // ignore
    }
  }
}

export function DashboardShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { user, loading } = useUser()
  const router = useRouter()
  const [mfaAllowed, setMfaAllowed] = React.useState(() =>
    user ? isMfaCachedForUser(user.uid) : false
  )

  React.useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
      return
    }
    if (!loading && user) {
      if (isMfaCachedForUser(user.uid)) {
        setMfaAllowed(true)
      }
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
          if (data?.ok && data.hasEnrolledMfa && !data.mfaSessionVerified) {
            verifiedMfaUids.delete(user.uid)
            if (typeof window !== "undefined") {
              try {
                sessionStorage.removeItem("revlet_mfa_verified_uid")
              } catch {
                // ignore
              }
            }
            router.replace("/login?mfa=1")
            return
          }
          cacheMfaForUser(user.uid)
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
        <div className="font-headline font-bold text-[30px] tracking-tight text-slate-950 select-none">
          Revlet
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
