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
  Server,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useActiveOrg } from "@/hooks/use-active-org"
import { RevletLogo } from "@/components/brand/revlet-logo"

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  badge?: React.ReactNode
}

export function RecursiveSidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const { activeOrg } = useActiveOrg()

  const isWorkspaceActive = activeOrg?.workspaceStatus === "active"

  const mainNavItems: NavItem[] = [
    { title: "Account home", icon: LayoutDashboard, href: "/account/home" },
    { title: "DNS management", icon: Globe, href: "/services/dns" },
    { title: "Email forwarding", icon: ArrowRightLeft, href: "/services/email-forwarding" },
    { title: "Email service", icon: Mail, href: "/services/email" },
    { title: "Infrastructure", icon: Server, href: "/services/infrastructure" },
    ...(activeOrg?.isEducation && !isWorkspaceActive
      ? [{ title: "Google Workspace", icon: GraduationCap, href: "/services/workspace" }]
      : []),
    ...(isWorkspaceActive && activeOrg?.isEducation
      ? [
          { title: "Workspace overview", icon: GraduationCap, href: "/services/workspace" },
          { title: "Users", icon: Users, href: "/services/workspace/users" },
          { title: "Classes & sections", icon: Library, href: "/management/academics" },
          { title: "Storage", icon: HardDrive, href: "/services/workspace/storage" },
          { title: "Deactivated users", icon: UserMinus, href: "/services/workspace/deactivated" },
          { title: "Alumni manager", icon: GraduationCap, href: "/services/workspace/alumni" },
        ]
      : []),
  ]

  const bottomNavItems: NavItem[] = [
    { title: "Team management", icon: Users, href: "/management/team" },
    { title: "Settings", icon: Settings, href: "/management/settings" },
  ]

  return (
    <aside
      className={cn(
        "bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 select-none",
        mobile
          ? "w-full pt-4 border-r-0 h-full max-h-full"
          : "w-60 pt-5 hidden lg:flex h-screen max-h-screen sticky top-0"
      )}
    >
      <div className="px-5 mb-5 shrink-0">
        <Link
          href="/account/home"
          className="inline-flex items-center hover:opacity-85 transition-opacity"
        >
          <RevletLogo variant="horizontal" size="sm" />
        </Link>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 custom-scrollbar pb-3 space-y-0.5">
        {mainNavItems.map((item, idx) => {
          const isActive = pathname === item.href

          return (
            <Link
              key={idx}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 h-[34px] rounded-lg text-xs transition-colors group",
                isActive
                  ? "bg-white text-slate-900 font-medium border border-slate-200/80 shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-normal"
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"
                )}
              />
              <span className="truncate">{item.title}</span>
              {item.badge}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Pinned Items */}
      <div className="p-3 pt-3 border-t border-slate-200 space-y-0.5 bg-slate-50 shrink-0 mt-auto">
        {bottomNavItems.map((item, idx) => {
          const isActive = pathname === item.href

          return (
            <Link
              key={idx}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 h-[34px] rounded-lg text-xs transition-colors group",
                isActive
                  ? "bg-white text-slate-900 font-medium border border-slate-200/80 shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-normal"
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"
                )}
              />
              <span className="truncate">{item.title}</span>
              {item.badge}
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
