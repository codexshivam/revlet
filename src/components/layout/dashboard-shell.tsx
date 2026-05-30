
"use client"

import * as React from "react"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { TopHeader } from "@/components/layout/top-header"
import { cn } from "@/lib/utils"

export function DashboardShell({ 
  children, 
  className 
}: { 
  children: React.ReactNode 
  className?: string
}) {
  return (
    <div className="min-h-screen w-full flex bg-white overflow-hidden">
      <RecursiveSidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <TopHeader />
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#F8FAFC]">
          <div className={cn("p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8", className)}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
