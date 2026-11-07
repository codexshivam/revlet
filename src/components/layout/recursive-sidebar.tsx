"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  Globe, 
  Users, 
  Settings, 
  LayoutDashboard,
  CreditCard,
  Database,
  Mail,
  GraduationCap,
  HardDrive,
  UserMinus,
  Library
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useActiveOrg } from "@/hooks/use-active-org"

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  badge?: React.ReactNode
}

export function RecursiveSidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const { activeOrg } = useActiveOrg()

  const isWorkspaceActive = activeOrg?.workspaceStatus === 'active'

  const navItems: NavItem[] = [
    { title: "Account Home", icon: LayoutDashboard, href: "/account/home" },
    { title: "Manage Payments", icon: CreditCard, href: "/account/billing" },
    { title: "DNS Management", icon: Globe, href: "/services/dns" },
    { title: "Website Management", icon: Database, href: "/services/website" },
    { title: "Email Service", icon: Mail, href: "/services/email" },
    ...(activeOrg?.isEducation && !isWorkspaceActive ? [{ title: "Google Workspace", icon: GraduationCap, href: "/services/workspace" }] : []),
    ...(isWorkspaceActive && activeOrg?.isEducation ? [
      { title: "Workspace Overview", icon: GraduationCap, href: "/services/workspace" },
      { title: "Users", icon: Users, href: "/services/workspace/users" },
      { title: "Classes & Sections", icon: Library, href: "/management/academics" },
      { title: "Storage", icon: HardDrive, href: "/services/workspace/storage" },
      { title: "Deactivated Users", icon: UserMinus, href: "/services/workspace/deactivated" },
      { title: "Alumni Manager", icon: GraduationCap, href: "/services/workspace/alumni" },
    ] : []),
    { title: "Team Management", icon: Users, href: "/management/team" },
    { title: "Settings", icon: Settings, href: "/management/settings" },
  ]

  return (
    <aside className={cn(
      "bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 transition-all",
      mobile ? "w-full pt-4 border-r-0 h-full" : "w-64 pt-6 hidden lg:flex"
    )}>
      <div className="px-5 mb-5">
        <Link href="/account/home" className="inline-block transition-opacity hover:opacity-80">
          <span className="font-headline font-bold text-base tracking-[0.15em] text-slate-900 uppercase">
            REVLET
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3.5 custom-scrollbar pb-6 space-y-1">
        {navItems.map((item, idx) => {
          const isActive = pathname === item.href
          
          return (
            <Link
              key={idx}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold tracking-wide transition-all group relative",
                isActive 
                  ? "bg-white text-[#191C1E] shadow-sm border border-slate-200/80" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-[#191C1E]"
              )}
            >
              <item.icon className={cn(
                "w-3.5 h-3.5 transition-colors shrink-0",
                isActive ? "text-[#191C1E]" : "text-slate-400 group-hover:text-slate-600"
              )} />
              <span className="truncate">{item.title}</span>
              {item.badge}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
