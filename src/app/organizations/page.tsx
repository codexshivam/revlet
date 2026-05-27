
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Building2, Plus, ExternalLink } from "lucide-react"

const orgs = [
  { 
    name: "Kathmandu Vidya Mandir", 
    domains: 3, 
    services: ["DNS", "Hosting", "Workspace"],
    code: "KVM-001"
  },
  { 
    name: "Lalitpur Secondary School", 
    domains: 1, 
    services: ["DNS", "Hosting"],
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
          <Button className="font-bold gap-2">
            <Plus className="w-4 h-4" />
            Add Institution
          </Button>
        </div>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200">
            <CardTitle className="text-sm font-bold text-slate-600">Registered Educational Institutions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[10px] font-bold uppercase py-3">Code</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Institution Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Managed Domains</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Active Services</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.code} className="group hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-mono text-[10px] font-bold text-slate-400">
                      {org.code}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-slate-100 rounded border border-slate-200 group-hover:bg-primary/5 transition-colors">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 group-hover:text-primary" />
                        </div>
                        <span className="font-bold text-slate-800">{org.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-medium text-slate-600">{org.domains} Domains</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {org.services.map((s) => (
                          <Badge key={s} variant="secondary" className="bg-slate-100 text-[9px] font-bold text-slate-500 border-slate-200 py-0 h-4">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="h-8 font-bold text-xs gap-1.5 border-slate-200 hover:bg-primary hover:text-white transition-all">
                        Manage
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
