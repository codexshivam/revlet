"use client"

import * as React from "react"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { TopHeader } from "@/components/layout/top-header"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase"
import { useRouter } from "next/navigation"

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
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <div className="font-headline font-bold text-[30px] tracking-tight text-slate-950 select-none">
          Revlet
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full flex bg-slate-50 overflow-hidden">
      <RecursiveSidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 h-screen overflow-hidden">
        <TopHeader />
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
          <div
            className={cn(
              "p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-8 min-h-[calc(100vh-3.5rem)] flex flex-col",
              className
            )}
          >
            <div className="space-y-8 flex-1">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
