
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MoreVertical, Plus, Building2, ExternalLink, Edit2, LogOut } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account home</span>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-headline font-bold text-slate-900 tracking-tight">
              Revlet Platform
            </h1>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 bg-white border-slate-200 hover:bg-slate-50 shadow-sm transition-all active:scale-95">
                    <MoreVertical className="w-4 h-4 text-slate-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="cursor-pointer gap-2 py-2.5">
                    <Edit2 className="w-4 h-4 text-slate-400" />
                    <span className="font-medium">Edit account name</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer gap-2 py-2.5 text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4" />
                    <span className="font-medium">Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 shadow-md shadow-primary/10 transition-all hover:-translate-y-0.5 active:translate-y-0">
                <Plus className="w-4 h-4 mr-2" />
                Add Organization
              </Button>
            </div>
          </div>
        </div>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl border-t-0">
          <div className="h-1.5 w-full bg-primary/10" />
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="text-[10px] font-bold uppercase py-5 pl-8 text-slate-400 tracking-widest">Institution Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Code</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Domains</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Active Services</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-5 text-right pr-8 text-slate-400 tracking-widest">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.code} className="group hover:bg-slate-50/50 transition-colors">
                    <TableCell className="pl-8 py-4">
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 group-hover:bg-primary/5 group-hover:border-primary/20 transition-all">
                          <Building2 className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                        </div>
                        <span className="font-bold text-slate-800 text-sm">{org.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {org.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {org.domains} Managed
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {org.services.map((s) => (
                          <Badge key={s} variant="secondary" className="bg-slate-100 text-[9px] font-bold text-slate-500 border-slate-200 py-0.5 h-5 px-2 tracking-tight group-hover:border-slate-300 transition-colors uppercase">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <Button size="sm" variant="outline" className="h-8 font-bold text-xs gap-2 border-slate-200 hover:bg-primary hover:text-white transition-all shadow-sm">
                        Manage
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="py-4 px-8 border-t border-slate-50 bg-slate-50/30">
              <p className="text-[10px] text-slate-400 font-medium">
                Total Organizations: {orgs.length} • Showing all records
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
