"use client"

import * as React from "react"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { TopHeader } from "@/components/layout/top-header"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

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
    <div className="h-screen w-full flex bg-white overflow-hidden">
      <RecursiveSidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-white h-screen overflow-hidden">
        <TopHeader />
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#F8FAFC]">
          <div className={cn("p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8 min-h-[calc(100vh-3.5rem)] flex flex-col justify-between", className)}>
            <div className="space-y-6 md:space-y-8 flex-1">
              {children}
            </div>

            {/* Global Brand Footer */}
            <footer className="mt-16 pt-8 pb-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 select-none">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="font-semibold text-slate-700">Revlet</span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-500">Enterprise Infrastructure Platform</span>
              </div>
              <div className="text-xs text-slate-500 font-normal">
                <span>&copy; 2026 Revlet Platforms Private Limited</span>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
