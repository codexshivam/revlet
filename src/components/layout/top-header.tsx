"use client"

import * as React from "react"
import { LifeBuoy, Menu, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OrgSelector } from "@/components/org/org-selector"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import Link from "next/link"

export function TopHeader() {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between gap-2 px-3 sm:px-6 shrink-0 relative z-30">
      {/* 1. Mobile Menu + Brand & Organization Selector */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9 text-slate-500 hover:bg-slate-100 rounded-lg shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r border-slate-200 bg-slate-50">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <RecursiveSidebar mobile onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Mobile brand mark */}
        <Link
          href="/account/home"
          className="lg:hidden flex items-center pr-1 sm:pr-2 shrink-0 hover:opacity-85 transition-opacity"
        >
          <span className="font-bold text-[18px] tracking-tight text-slate-950 font-headline">
            Revlet
          </span>
        </Link>

        <OrgSelector compact />
      </div>

      {/* 2. Platform Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.dispatchEvent(new CustomEvent("revlet:open-command-palette"))}
          aria-label="Open quick navigation command palette"
          className="hidden md:inline-flex h-8 px-2.5 text-xs font-normal gap-2 text-slate-500 border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <span>Quick jump</span>
          <kbd className="ml-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            ⌘K
          </kbd>
        </Button>
        <Link href="/support">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs font-medium gap-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <LifeBuoy className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span className="hidden sm:inline">Support</span>
          </Button>
        </Link>
      </div>
    </header>
  )
}
