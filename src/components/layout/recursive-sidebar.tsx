
"use client"

import * as React from "react"
import { 
  LayoutDashboard, 
  Server, 
  CreditCard, 
  History, 
  Users, 
  Settings, 
  ChevronRight, 
  ChevronDown,
  Globe,
  Database,
  Mail,
  ShieldCheck,
  Building2
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

interface NavItem {
  title: string
  href?: string
  icon?: React.ElementType
  children?: NavItem[]
}

const navItems: NavItem[] = [
  {
    title: "Account",
    icon: Building2,
    children: [
      { title: "Profile Settings", href: "/account/profile" },
      { title: "API Tokens", href: "/account/tokens" },
    ]
  },
  {
    title: "Organizations",
    icon: Users,
    children: [
      { title: "Manage Members", href: "/org/members" },
      { title: "Institutions", href: "/org/institutions" },
    ]
  },
  {
    title: "Services",
    icon: Server,
    children: [
      { title: "Infrastructure", icon: Globe, href: "/services/dns" },
      { title: "Google Workspace", icon: Mail, href: "/services/workspace" },
      { title: "Web Hosting", icon: Database, href: "/services/hosting" },
    ]
  },
  {
    title: "Administrative",
    icon: ShieldCheck,
    children: [
      { title: "Workflow States", href: "/admin/workflows" },
      { title: "Quota Audit", href: "/admin/quota" },
      { title: "System Health", href: "/admin/health" },
    ]
  },
  {
    title: "Billing",
    icon: CreditCard,
    href: "/billing"
  }
]

function NavMenuItem({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const [isOpen, setIsOpen] = React.useState(depth === 0)
  const pathname = usePathname()
  const isActive = item.href === pathname
  const hasChildren = item.children && item.children.length > 0

  return (
    <div className="w-full">
      {hasChildren ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center w-full px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-100 group",
            depth === 0 ? "text-slate-900 mt-2" : "text-slate-600"
          )}
        >
          {item.icon && <item.icon className="w-4 h-4 mr-3 text-slate-400 group-hover:text-primary transition-colors" />}
          <span className="flex-1 text-left">{item.title}</span>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>
      ) : (
        <Link
          href={item.href || "#"}
          className={cn(
            "flex items-center w-full px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-100 group",
            isActive ? "bg-primary/5 text-primary border-r-2 border-primary" : "text-slate-600",
            depth > 0 && "pl-11"
          )}
        >
          {item.icon && <item.icon className="w-4 h-4 mr-3 text-slate-400 group-hover:text-primary transition-colors" />}
          <span className="flex-1 text-left">{item.title}</span>
        </Link>
      )}
      
      {hasChildren && isOpen && (
        <div className="mt-1">
          {item.children?.map((child, idx) => (
            <NavMenuItem key={idx} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function RecursiveSidebar() {
  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="p-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Globe className="text-white w-5 h-5" />
          </div>
          <span className="font-headline font-bold text-xl tracking-tight text-slate-900">
            EduSphere
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Main Menu
        </div>
        <Link
          href="/"
          className="flex items-center px-4 py-2 mx-2 mb-2 rounded-md text-sm font-medium transition-colors hover:bg-slate-100 text-slate-900"
        >
          <LayoutDashboard className="w-4 h-4 mr-3 text-primary" />
          Dashboard
        </Link>
        <nav className="flex-1">
          {navItems.map((item, idx) => (
            <NavMenuItem key={idx} item={item} />
          ))}
        </nav>
      </div>
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
            <img src="https://picsum.photos/seed/admin/40" alt="Avatar" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">Sagar Poudel</p>
            <p className="text-[10px] text-slate-500 truncate">Super Admin</p>
          </div>
          <Settings className="w-4 h-4 text-slate-400 cursor-pointer hover:text-slate-600" />
        </div>
      </div>
    </div>
  )
}
