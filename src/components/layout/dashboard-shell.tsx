"use client"

import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { OrgSwitcher } from "@/components/layout/org-switcher"
import { GlobalSearch } from "@/components/layout/global-search"
import { Bell, HelpCircle, LayoutGrid } from "lucide-react"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <RecursiveSidebar />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200 z-10 shrink-0">
          <div className="flex items-center gap-6 flex-1">
            <OrgSwitcher />
            <GlobalSearch />
          </div>
          
          <div className="flex items-center gap-4 ml-4">
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-white" />
            </button>
            <div className="w-px h-6 bg-slate-200 mx-2" />
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-all">
              <LayoutGrid className="w-4 h-4" />
              Apps
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
