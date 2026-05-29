"use client"

import * as React from "react"
import { LifeBuoy, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OrgSelector } from "@/components/org/org-selector"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import Link from "next/link"

export function TopHeader() {
  return (
    <header className="h-14 border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center justify-between px-4 lg:px-6 shrink-0 relative z-30 shadow-sm">
      {/* 1. Persistent Organization Selector compact dropdown on the left */}
      <div className="flex items-center gap-2 lg:gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9 text-slate-500 hover:bg-slate-100 rounded-lg shrink-0">
              <Menu className="w-4 h-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r border-slate-200 bg-slate-50">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <RecursiveSidebar mobile />
          </SheetContent>
        </Sheet>
        <OrgSelector compact />
      </div>

      {/* 2. Support ticketing shortcut on the right */}
      <div className="flex items-center gap-3 ml-auto">
        <Link href="/support">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-9 px-3 text-xs font-semibold gap-1.5 text-slate-600 hover:text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-200/80 transition-all rounded-lg group"
          >
            <LifeBuoy className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-400" />
            Support
          </Button>
        </Link>
      </div>
    </header>
  )
}
