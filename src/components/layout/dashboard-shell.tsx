
"use client"

import * as React from "react"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { TopHeader } from "@/components/layout/top-header"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-200 p-4 lg:p-6 flex items-center justify-center">
      {/* MacOS Window Frame */}
      <div className="w-full max-w-[1600px] h-[90vh] bg-white rounded-xl shadow-2xl border border-slate-300 flex overflow-hidden relative">
        {/* Window Controls */}
        <div className="absolute top-4 left-4 flex gap-2 z-50">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56] shadow-inner" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E] shadow-inner" />
          <div className="w-3 h-3 rounded-full bg-[#27C93F] shadow-inner" />
        </div>

        <RecursiveSidebar />
        
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <TopHeader />
          <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#F8FAFC]">
            <div className="p-8 max-w-6xl mx-auto space-y-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
