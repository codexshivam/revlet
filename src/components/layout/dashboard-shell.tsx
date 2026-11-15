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

  React.useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  if (loading || !user) {
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
            <div className="space-y-6 sm:space-y-8 flex-1">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
