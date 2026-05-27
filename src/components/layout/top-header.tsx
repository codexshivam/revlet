
"use client"

import { Search, LifeBuoy, MoreHorizontal, LogOut, Settings, User } from "lucide-react"
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
        <Link href="/support">
          <Button variant="ghost" size="sm" className="h-9 gap-2 text-slate-600 hover:bg-slate-50 font-medium">
            <LifeBuoy className="w-4 h-4" />
            Support
          </Button>
        </Link>
        
        <div className="w-px h-4 bg-slate-200 mx-2" />

        <div className="flex items-center gap-2 pr-2">
          <span className="text-sm font-semibold text-slate-700">IT Admin</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <User className="w-4 h-4" />
                My Account
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/management/settings" className="flex items-center gap-2 w-full">
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
