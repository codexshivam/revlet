"use client"

import * as React from "react"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { TopHeader } from "@/components/layout/top-header"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { OrgProvider } from "@/hooks/use-active-org"

export function DashboardShell({ 
  children, 
  className 
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
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f8f9fa] bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:16px_16px]">
        <div className="flex flex-col items-center space-y-3">
          <div className="font-bold text-xs uppercase tracking-wider text-slate-800 font-headline">
            REVLET
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span>Securing session...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <OrgProvider>
      <div className="h-screen w-full flex bg-white overflow-hidden">
        <RecursiveSidebar />
        <div className="flex-1 flex flex-col min-w-0 bg-white h-screen overflow-hidden">
          <TopHeader />
          <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#F8FAFC]">
            <div className={cn("p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8 min-h-[calc(100vh-3.5rem)] flex flex-col", className)}>
              <div className="space-y-6 md:space-y-8 flex-1">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </OrgProvider>
  )
}
