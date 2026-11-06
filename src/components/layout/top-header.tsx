"use client"

import * as React from "react"
import { LifeBuoy, Menu, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OrgSelector } from "@/components/org/org-selector"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { RevletLogo } from "@/components/brand/revlet-logo"
import Link from "next/link"

export function TopHeader() {
  return (
    <header className="h-14 border-b border-slate-200 bg-white/95 backdrop-blur-md flex items-center justify-between px-3 sm:px-4 lg:px-6 shrink-0 relative z-30 shadow-xs">
      {/* 1. Mobile Menu + Brand & Organization Selector */}
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

        {/* Mobile brand mark */}
        <Link href="/account/home" className="lg:hidden flex items-center gap-1.5 pr-1 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <RevletLogo variant="mark" size="sm" className="w-4 h-4 text-white" />
          </div>
          <span className="font-headline font-extrabold text-[13px] tracking-[0.14em] text-slate-900">
            REVLET
          </span>
        </Link>

        <OrgSelector compact />
      </div>

      {/* 2. Platform Status & Actions */}
      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        {/* Strict brand status pill */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/80 text-[11px] font-medium text-slate-600 select-none">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Revlet Cloud</span>
        </div>

        <Link href="/support">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs font-semibold gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200/80 transition-all rounded-lg group"
          >
            <LifeBuoy className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
            <span className="hidden sm:inline">Support</span>
          </Button>
        </Link>

        <Link href="/account/profile">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs font-semibold gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200/80 transition-all rounded-lg group"
          >
            <UserCircle className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
            <span className="hidden sm:inline">Profile</span>
          </Button>
        </Link>
      </div>
    </header>
  )
}

