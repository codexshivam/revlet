
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tag, MoreVertical, Plus, Building2, ExternalLink } from "lucide-react"

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
    name: "Pokhara University Affiliated College", 
    domains: 5, 
    services: ["DNS", "Workspace"],
    code: "PAC-005"
  }
]

export default function AccountHomePage() {
  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header Section based on Screenshot */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-500 font-medium">Account home</span>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-headline font-bold text-slate-900 tracking-tight">
              Revlet Platform
            </h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-10 w-10 bg-white border-slate-200 hover:bg-slate-50">
                <Tag className="w-4 h-4 text-slate-600" />
              </Button>
              <Button variant="outline" size="icon" className="h-10 w-10 bg-white border-slate-200 hover:bg-slate-50">
                <MoreVertical className="w-4 h-4 text-slate-600" />
              </Button>
              <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 shadow-sm">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Organization List Table */}
        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-[10px] font-bold uppercase py-4 pl-6">Institution Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Code</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Domains</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Active Services</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.code} className="group hover:bg-slate-50/50 transition-colors">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-slate-100 rounded border border-slate-200 group-hover:bg-primary/5 transition-colors">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 group-hover:text-primary" />
                        </div>
                        <span className="font-bold text-slate-800">{org.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] font-bold text-slate-400">
                      {org.code}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-medium text-slate-600">{org.domains}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {org.services.map((s) => (
                          <Badge key={s} variant="secondary" className="bg-slate-100 text-[9px] font-bold text-slate-500 border-slate-200 py-0 h-4 px-1.5">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
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
