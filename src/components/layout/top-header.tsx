"use client"

import { LifeBuoy } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function TopHeader() {
  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-end px-8 shrink-0">
      <div className="flex items-center gap-3">
        <Link href="/support">
          <Button variant="ghost" size="sm" className="h-9 gap-2 text-slate-600 hover:bg-slate-50 font-medium">
            <LifeBuoy className="w-4 h-4" />
            Support
          </Button>
        </Link>
      </div>
    </header>
  )
}
