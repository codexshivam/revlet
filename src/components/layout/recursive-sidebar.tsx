"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  Globe, 
  Users, 
  Settings, 
  ShieldCheck,
  Briefcase,
  LayoutDashboard,
  Database,
  Mail,
  GraduationCap,
  HardDrive,
  Archive,
  UserMinus,
  BookOpen,
  Library,
  Network
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useAcademicClasses } from "@/hooks/use-academic-classes"

interface NavItem {
  title: string
  href?: string
  icon?: React.ElementType
  badge?: React.ReactNode
  children?: NavItem[]
}

export function RecursiveSidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const { activeOrg } = useActiveOrg()
  const { classes } = useAcademicClasses()

  const isWorkspaceActive = activeOrg?.workspaceStatus === 'active'

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
        { title: "Email Service", icon: Mail, href: "/services/email" },
        ...(activeOrg?.isEducation ? [{ title: "Google Workspace", icon: GraduationCap, href: "/services/workspace" }] : []),
      ]
    },
    // Conditional Google Workspace section (only when active and educational)
    ...(isWorkspaceActive && activeOrg?.isEducation ? [{
      title: "GOOGLE WORKSPACE",
      icon: GraduationCap,
      children: [
        { title: "Users", icon: Users, href: "/services/workspace/users" },
        { title: "Classes & Sections", icon: Library, href: "/management/academics" },
        { title: "Storage Policies", icon: HardDrive, href: "/services/workspace/storage" },
        { title: "Deactivated Users", icon: UserMinus, href: "/services/workspace/deactivated" },
        { title: "Alumni Manager", icon: GraduationCap, href: "/services/workspace/alumni" },
      ]
    }] : []),
    {
      title: "MANAGEMENT",
      icon: ShieldCheck,
      children: [
        { title: "Team Management", icon: Users, href: "/management/team" },
        { title: "Settings", icon: Settings, href: "/management/settings" },
      ]
    }
  ]

  return (
    <aside className={cn(
      "bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 transition-all",
      mobile ? "w-full pt-4 border-r-0 h-full" : "w-64 pt-6 hidden lg:flex"
    )}>
      <div className="px-6 mb-8">
        <Link href="/account/home" className="flex flex-col gap-0 group">
          <span className="font-headline font-bold text-[20px] tracking-[0.1em] text-[#191c1e] leading-none ml-[0.1em]">
            REVLET
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 custom-scrollbar pb-6">
        {navItems.map((section, idx) => {
          if (!section.children || section.children.length === 0) return null

          return (
            <div key={idx} className="mb-6 animate-in fade-in duration-300">
              <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                {section.title}
                <div className="flex-1 h-px bg-slate-200 animate-in slide-in-from-left duration-500" />
              </div>
              <div className="space-y-1">
                {section.children.map((item, childIdx) => {
                  const isActive = pathname === item.href
                  
                  return (
                    <div key={childIdx} className="space-y-0.5">
                      <Link
                        href={item.href || "#"}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold tracking-wide transition-all group relative",
                          isActive 
                            ? "bg-white text-[#191C1E] shadow-sm border border-slate-200/80" 
                            : "text-slate-600 hover:bg-slate-100 hover:text-[#191C1E]",
                          item.children ? "cursor-default" : ""
                        )}
                      >
                        {item.icon && (
                          <item.icon className={cn(
                            "w-3.5 h-3.5 transition-colors shrink-0",
                            isActive ? "text-[#191C1E]" : "text-slate-400 group-hover:text-slate-600"
                          )} />
                        )}
                        <span className="truncate">{item.title}</span>
                        {item.badge}
                      </Link>
                      
                      {/* Nested Children (Sections) */}
                      {item.children && item.children.length > 0 && (
                        <div className="pl-6 space-y-0.5 border-l border-slate-200/60 ml-4 mt-1 pb-2">
                          {item.children.map((subItem, subIdx) => (
                            <div
                              key={subIdx}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
                            >
                              <div className="w-1 h-1 rounded-full bg-slate-300" />
                              <span className="truncate">{subItem.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
