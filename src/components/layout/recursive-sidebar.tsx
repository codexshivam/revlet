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
  ExternalLink,
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

  const isWorkspaceActive = activeOrg?.workspaceStatus === "active"

  const isItemActive = (href: string) => {
    if (href === "/account/home") {
      return pathname === "/account/home" || pathname === "/"
    }
    if (href === "/services/workspace") {
      return pathname === "/services/workspace"
    }
    return pathname === href || pathname.startsWith(href + "/")
  }

  const generalItems: NavItem[] = [
    { title: "Account home", icon: LayoutDashboard, href: "/account/home" },
  ]

  const serviceItems: NavItem[] = [
    { title: "DNS management", icon: Globe, href: "/services/dns" },
    { title: "Email forwarding", icon: ArrowRightLeft, href: "/services/email-forwarding" },
    { title: "Email service", icon: Mail, href: "/services/email" },
    { title: "Infrastructure", icon: Server, href: "/services/infrastructure" },
  ]

  const workspaceItems: NavItem[] = [
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

  const renderNavList = (items: NavItem[]) => (
    <div className="space-y-0.5">
      {items.map((item, idx) => {
        const isActive = isItemActive(item.href)

        return (
          <Link
            key={idx}
            href={item.href}
            className={cn(
              "w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-xs transition-colors group",
              isActive
                ? "bg-white text-slate-950 font-semibold border border-slate-200 shadow-xs"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-medium"
            )}
          >
            <div className="flex items-center gap-2.5 truncate">
              <item.icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-slate-950 stroke-[2]" : "text-slate-500 group-hover:text-slate-700"
                )}
              />
              <span className="truncate">{item.title}</span>
            </div>
            {item.badge}
          </Link>
        )
      })}
    </div>
  )

  return (
    <aside
      className={cn(
        "w-60 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 select-none",
        mobile
          ? "w-full border-r-0 h-full max-h-full"
          : "hidden lg:flex h-screen max-h-screen sticky top-0"
      )}
    >
      {/* Brand Lockup */}
      <div className="px-5 pt-5 pb-4 shrink-0 flex items-center justify-between">
        <Link
          href="/account/home"
          className="inline-flex items-center hover:opacity-90 transition-opacity"
        >
          <span className="font-bold text-[18px] tracking-tight text-slate-950 font-headline">
            Revlet
          </span>
        </Link>
      </div>

      {/* Scrollable Navigation Sections */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 custom-scrollbar space-y-4 pb-3">
        {/* General */}
        <div>{renderNavList(generalItems)}</div>

        {/* Services */}
        <div>
          <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Services
          </div>
          {renderNavList(serviceItems)}
        </div>

        {/* Workspace (Education only) */}
        {workspaceItems.length > 0 && (
          <div className="pt-2 border-t border-slate-200/80">
            <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Workspace
            </div>
            {renderNavList(workspaceItems)}
          </div>
        )}
      </nav>

      {/* Bottom Pinned Items */}
      <div className="p-3 border-t border-slate-200 space-y-1 bg-slate-50 shrink-0 mt-auto">
        {bottomNavItems.map((item, idx) => {
          const isActive = isItemActive(item.href)

          return (
            <Link
              key={idx}
              href={item.href}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 h-[34px] rounded-lg text-xs transition-colors group",
                isActive
                  ? "bg-white text-slate-950 font-semibold border border-slate-200 shadow-xs"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-medium"
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-slate-950 stroke-[2]" : "text-slate-500 group-hover:text-slate-700"
                )}
              />
              <span className="truncate">{item.title}</span>
            </Link>
          )
        })}

        <a
          href="https://mail.revlet.me"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between px-2.5 h-[34px] rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-colors group"
          title="Open RevletMail Webmail"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Mail className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-slate-700 transition-colors" />
            <span className="truncate">RevletMail</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
        </a>
      </div>
    </aside>
  )
}
