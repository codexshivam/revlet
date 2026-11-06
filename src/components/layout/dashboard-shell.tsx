
"use client"

import * as React from "react"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { TopHeader } from "@/components/layout/top-header"
import { RevletLogo } from "@/components/brand/revlet-logo"
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
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/10 animate-pulse">
            <RevletLogo variant="mark" size="md" className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono">
              Securing Revlet Session...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex bg-white overflow-hidden">
      <RecursiveSidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <TopHeader />
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#F8FAFC]">
          <div className={cn("p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8 min-h-[calc(100vh-3.5rem)] flex flex-col justify-between", className)}>
            <div className="space-y-6 md:space-y-8 flex-1">
              {children}
            </div>

            {/* Strict Global Brand Footer */}
            <footer className="mt-16 pt-8 pb-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 select-none">
              <div className="flex items-center gap-2 text-slate-600">
                <RevletLogo variant="mark" size="sm" className="w-3.5 h-3.5 text-slate-600" />
                <span className="font-semibold text-slate-600">Revlet IT Manager</span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-slate-600">Enterprise Infrastructure Platform</span>
              </div>
              <div className="flex items-center gap-4 text-slate-600 font-medium">
                <a href="https://revlet.me/terms" target="_blank" rel="noopener noreferrer" className="hover:text-slate-800 transition-colors">Terms</a>
                <a href="https://revlet.me/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-slate-800 transition-colors">Privacy</a>
                <a href="mailto:hello@revlet.me" className="hover:text-slate-800 transition-colors">hello@revlet.me</a>
                <span className="text-slate-600">&copy; 2026 Revlet</span>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}


