"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  Globe, 
  Database, 
  Mail, 
  Users, 
  Settings, 
  ShieldCheck,
  Briefcase,
  LayoutDashboard
} from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  title: string
  href?: string
  icon?: React.ElementType
  children?: NavItem[]
}

const navItems: NavItem[] = [
  {
    title: "ACCOUNT",
    icon: Briefcase,
    children: [
      { title: "Account Home", href: "/account/home" },
      { title: "Manage Payments", href: "/account/billing" },
    ]
  },
  {
    title: "SERVICES",
    icon: LayoutDashboard,
    children: [
      { title: "DNS Management", icon: Globe, href: "/services/dns" },
      { title: "Website Management", icon: Database, href: "/services/website" },
      { title: "Google Workspace", icon: Mail, href: "/services/workspace" },
    ]
  },
  {
    title: "MANAGEMENT",
    icon: ShieldCheck,
    children: [
      { title: "Team Management", icon: Users, href: "/management/team" },
      { title: "Settings", icon: Settings, href: "/management/settings" },
    ]
  }
]

export function RecursiveSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col pt-12 shrink-0">
      <div className="px-6 mb-8">
        <Link href="/account/home" className="flex flex-col gap-0 group">
          <span className="font-body font-black text-2xl tracking-[0.2em] text-slate-900 leading-none ml-[0.2em]">
            REVLET
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 custom-scrollbar">
        {navItems.map((section, idx) => (
          <div key={idx} className="mb-6">
            <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              {section.title}
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className="space-y-1">
              {section.children?.map((item, childIdx) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={childIdx}
                    href={item.href || "#"}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all group",
                      isActive 
                        ? "bg-white text-primary shadow-sm border border-slate-200" 
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    {item.icon && (
                      <item.icon className={cn(
                        "w-4 h-4 transition-colors",
                        isActive ? "text-primary" : "text-slate-400 group-hover:text-slate-600"
                      )} />
                    )}
                    {item.title}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
