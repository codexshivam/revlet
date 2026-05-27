
"use client"

import { Search, Sparkles, LifeBuoy, ChevronDown, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"

export function TopHeader() {
  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0">
      <div className="flex-1 max-w-xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input 
          placeholder="Search portal, institutions, or DNS records..." 
          className="pl-10 h-9 bg-slate-50 border-slate-200 focus-visible:ring-primary/20 text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="h-9 gap-2 text-slate-600 border-slate-200 hover:bg-slate-50 font-medium">
          <Sparkles className="w-4 h-4 text-primary" />
          Ask AI
        </Button>
        <Link href="/support">
          <Button variant="ghost" size="sm" className="h-9 gap-2 text-slate-600 hover:bg-slate-50 font-medium">
            <LifeBuoy className="w-4 h-4" />
            Support
          </Button>
        </Link>
        
        <div className="w-px h-4 bg-slate-200 mx-2" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 px-2 gap-2 hover:bg-slate-50">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-semibold text-slate-700">IT Admin</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account/home">Account Home</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/management/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
