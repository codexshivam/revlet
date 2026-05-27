
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Edit3, Trash2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"

const dnsRecords = [
  { type: "A", name: "@", value: "192.168.1.1", ttl: "3600" },
  { type: "CNAME", name: "www", value: "kvm.edu.np", ttl: "3600" },
  { type: "MX", name: "@", value: "aspmx.l.google.com", ttl: "14400" },
  { type: "TXT", name: "@", value: "v=spf1 include:_spf.google.com ~all", ttl: "3600" },
]

export default function DNSManagementPage() {
  const handleAddRecord = () => {
    toast({
      title: "DNS Record Created",
      description: "The new record has been added to the zone configuration.",
    })
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold text-slate-900">DNS Management</h1>
        
        <OrgSelector />

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-100 bg-slate-50/30">
            <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-widest">Active DNS Zone Configuration</CardTitle>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="font-bold h-8">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Record
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New DNS Record</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="type" className="text-right text-xs font-bold">Type</Label>
                    <Select defaultValue="A">
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">A</SelectItem>
                        <SelectItem value="CNAME">CNAME</SelectItem>
                        <SelectItem value="MX">MX</SelectItem>
                        <SelectItem value="TXT">TXT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right text-xs font-bold">Name</Label>
                    <Input id="name" placeholder="@ or subdomain" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="value" className="text-right text-xs font-bold">Value</Label>
                    <Input id="value" placeholder="IP or target domain" className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="ttl" className="text-right text-xs font-bold">TTL</Label>
                    <Input id="ttl" defaultValue="3600" className="col-span-3" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddRecord}>Create Record</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-200">
                  <TableHead className="text-[10px] font-bold uppercase py-3 pl-6">Type</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Host / Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Value / Target</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">TTL</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dnsRecords.map((rec, i) => (
                  <TableRow key={i} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                    <TableCell className="pl-6">
                      <Badge variant="outline" className="font-mono text-[10px] bg-slate-50 border-slate-200 font-bold px-2 py-0">
                        {rec.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-700 font-medium">{rec.name}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500 truncate max-w-xs">{rec.value}</TableCell>
                    <TableCell className="text-xs text-slate-400 font-medium">{rec.ttl}</TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-primary transition-colors">
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 transition-colors">
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
