
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Edit3, Trash2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"

const dnsRecords = [
  { type: "A", name: "@", value: "192.168.1.1", ttl: "3600" },
  { type: "CNAME", name: "www", value: "kvm.edu.np", ttl: "3600" },
  { type: "MX", name: "@", value: "aspmx.l.google.com", ttl: "14400" },
  { type: "TXT", name: "@", value: "v=spf1 include:_spf.google.com ~all", ttl: "3600" },
]

export default function DNSManagementPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold text-slate-900">DNS Management</h1>
        
        <OrgSelector />

        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-600">Active DNS Zone Configurations</CardTitle>
            <Button size="sm" className="font-bold h-8">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Record
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="text-[10px] font-bold uppercase py-3">Type</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Host / Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Value / Target</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">TTL</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dnsRecords.map((rec, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px] bg-slate-50 border-slate-200 font-bold px-2">
                        {rec.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">{rec.name}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-700 truncate max-w-xs">{rec.value}</TableCell>
                    <TableCell className="text-xs text-slate-500">{rec.ttl}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-primary">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
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
