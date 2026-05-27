
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, Globe, Shield, ExternalLink } from "lucide-react"

const orgs = [
  { 
    name: "Kathmandu Vidya Mandir", 
    domains: 3, 
    services: ["DNS", "Web Hosting", "Google Workspace"],
    code: "KVM-001"
  },
  { 
    name: "Lalitpur Secondary School", 
    domains: 1, 
    services: ["DNS", "Web Hosting"],
    code: "LSS-002"
  },
  { 
    name: "Pokhara Affiliated College", 
    domains: 5, 
    services: ["DNS", "Workspace"],
    code: "PAC-005"
  }
]

export default function OrganizationsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-headline font-bold text-slate-900">Organization Directory</h1>
          <Button className="font-bold">Add Institution</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orgs.map((org) => (
            <Card key={org.code} className="bg-white border-slate-200 hover:border-primary transition-all duration-300 shadow-sm group">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-primary/5 group-hover:border-primary/20 transition-colors">
                    <Building2 className="w-6 h-6 text-slate-400 group-hover:text-primary" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{org.code}</span>
                </div>
                
                <div>
                  <h3 className="text-lg font-headline font-bold text-slate-900 leading-tight">{org.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">{org.domains} Managed Domains</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {org.services.map((s) => (
                    <span key={s} className="px-2 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-600 rounded-full border border-slate-200">
                      {s}
                    </span>
                  ))}
                </div>

                <Button className="w-full font-bold group-hover:bg-primary transition-colors">
                  Manage Organization
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
