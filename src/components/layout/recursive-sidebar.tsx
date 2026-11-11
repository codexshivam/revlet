"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  Globe, 
  Users, 
  Settings, 
  LayoutDashboard,
  Mail,
  ArrowRightLeft,
  GraduationCap,
  HardDrive,
  UserMinus,
  Library,
  Server
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

  const mainNavItems: NavItem[] = [
    { title: "Account Home", icon: LayoutDashboard, href: "/account/home" },
    { title: "DNS Management", icon: Globe, href: "/services/dns" },
    { title: "Email Forwarding", icon: ArrowRightLeft, href: "/services/email-forwarding" },
    { title: "Email Service", icon: Mail, href: "/services/email" },
    { title: "Infrastructure", icon: Server, href: "/services/infrastructure" },
    ...(activeOrg?.isEducation && !isWorkspaceActive ? [{ title: "Google Workspace", icon: GraduationCap, href: "/services/workspace" }] : []),
    ...(isWorkspaceActive && activeOrg?.isEducation ? [
      { title: "Workspace Overview", icon: GraduationCap, href: "/services/workspace" },
      { title: "Users", icon: Users, href: "/services/workspace/users" },
      { title: "Classes & Sections", icon: Library, href: "/management/academics" },
      { title: "Storage", icon: HardDrive, href: "/services/workspace/storage" },
      { title: "Deactivated Users", icon: UserMinus, href: "/services/workspace/deactivated" },
      { title: "Alumni Manager", icon: GraduationCap, href: "/services/workspace/alumni" },
    ] : []),
  ]

  const bottomNavItems: NavItem[] = [
    { title: "Team Management", icon: Users, href: "/management/team" },
    { title: "Settings", icon: Settings, href: "/management/settings" },
  ]

  return (
    <aside className={cn(
      "bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 transition-all select-none",
      mobile ? "w-full pt-4 border-r-0 h-full max-h-full" : "w-64 pt-6 hidden lg:flex h-screen max-h-screen sticky top-0"
    )}>
      <div className="px-5 mb-5 shrink-0">
        <Link href="/account/home" className="inline-flex items-center transition-opacity hover:opacity-80">
          <span className="font-headline font-bold text-base tracking-tight text-slate-900">
            Revlet
          </span>
        </Link>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3.5 custom-scrollbar pb-3 space-y-1">
        {mainNavItems.map((item, idx) => {
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

      {/* Bottom Pinned Items: Team Management & Settings */}
      <div className="p-3.5 pt-3 border-t border-slate-200/80 space-y-1 bg-slate-50 shrink-0 mt-auto">
        {bottomNavItems.map((item, idx) => {
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
      </div>
    </aside>
  )
}
