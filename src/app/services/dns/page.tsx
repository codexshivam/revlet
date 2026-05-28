
"use client"

import { useState, useMemo } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Edit3, Trash2, Search, Info } from "lucide-react"
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
import { cn } from "@/lib/utils"

type DNSRecord = {
  id: string
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV" | "CAA"
  name: string
  content: string
  ttl: string
  priority?: number
  service?: string
  protocol?: string
  weight?: number
  port?: number
  tag?: string
  flag?: number
}

const initialRecords: DNSRecord[] = [
  { id: "1", type: "A", name: "@", content: "104.21.78.152", ttl: "3600" },
  { id: "2", type: "CNAME", name: "www", content: "kvm.edu.np", ttl: "3600" },
  { id: "3", type: "MX", name: "@", content: "mail.kvm.edu.np", priority: 10, ttl: "14400" },
  { id: "4", type: "TXT", name: "@", content: "v=spf1 include:_spf.google.com ~all", ttl: "3600" },
  { id: "5", type: "AAAA", name: "@", content: "2606:4700:3037::6815:4e98", ttl: "Auto" },
]

export default function DNSManagementPage() {
  const [records, setRecords] = useState<DNSRecord[]>(initialRecords)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null)
  
  // Form State
  const [formData, setFormData] = useState<Partial<DNSRecord>>({
    type: "A",
    name: "@",
    content: "",
    ttl: "Auto",
  })

  const openAddDialog = () => {
    setEditingRecord(null)
    setFormData({ type: "A", name: "@", content: "", ttl: "Auto" })
    setIsDialogOpen(true)
  }

  const openEditDialog = (record: DNSRecord) => {
    setEditingRecord(record)
    setFormData(record)
    setIsDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    setRecords(records.filter(r => r.id !== id))
    toast({
      title: "Record Deleted",
      description: "The DNS record has been removed from the zone.",
    })
  }

  const handleSave = () => {
    if (!formData.name || !formData.content) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please fill in all required fields.",
      })
      return
    }

    if (editingRecord) {
      setRecords(records.map(r => r.id === editingRecord.id ? { ...r, ...formData } as DNSRecord : r))
      toast({ title: "Record Updated", description: "Changes saved successfully." })
    } else {
      const newRecord: DNSRecord = {
        ...formData,
        id: Math.random().toString(36).substr(2, 9),
      } as DNSRecord
      setRecords([...records, newRecord])
      toast({ title: "Record Created", description: "New DNS record added to zone." })
    }
    setIsDialogOpen(false)
  }

  const renderDynamicFields = () => {
    switch (formData.type) {
      case "MX":
        return (
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-xs font-bold">Priority</Label>
            <Input 
              type="number" 
              value={formData.priority || ""} 
              onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) })}
              className="col-span-3" 
              placeholder="e.g. 10"
            />
          </div>
        )
      case "SRV":
        return (
          <>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs font-bold">Service</Label>
              <Input 
                value={formData.service || ""} 
                onChange={e => setFormData({ ...formData, service: e.target.value })}
                className="col-span-3" 
                placeholder="_sip"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs font-bold">Protocol</Label>
              <Input 
                value={formData.protocol || ""} 
                onChange={e => setFormData({ ...formData, protocol: e.target.value })}
                className="col-span-3" 
                placeholder="_tcp"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs font-bold">Priority</Label>
              <Input 
                type="number"
                value={formData.priority || ""} 
                onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="col-span-3" 
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs font-bold">Weight</Label>
              <Input 
                type="number"
                value={formData.weight || ""} 
                onChange={e => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                className="col-span-3" 
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs font-bold">Port</Label>
              <Input 
                type="number"
                value={formData.port || ""} 
                onChange={e => setFormData({ ...formData, port: parseInt(e.target.value) })}
                className="col-span-3" 
              />
            </div>
          </>
        )
      case "CAA":
        return (
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right text-xs font-bold">Tag</Label>
            <Select 
              value={formData.tag || "issue"} 
              onValueChange={v => setFormData({ ...formData, tag: v })}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="issue">issue (Single CA)</SelectItem>
                <SelectItem value="issuewild">issuewild (Wildcard CA)</SelectItem>
                <SelectItem value="iodef">iodef (Reporting)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-headline font-bold text-slate-900">DNS Management</h1>
          <Button onClick={openAddDialog} className="font-bold gap-2 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4" />
            Add Record
          </Button>
        </div>
        
        <OrgSelector />

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-100 bg-slate-50/30">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-bold text-slate-600 uppercase tracking-widest">Active Records</CardTitle>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-bold bg-slate-100 text-slate-500">
                {records.length} Total
              </Badge>
            </div>
            <div className="flex items-center gap-2">
               <div className="relative">
                 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                 <Input placeholder="Search records..." className="h-8 pl-8 text-xs w-48 bg-white" />
               </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-200">
                  <TableHead className="text-[10px] font-bold uppercase py-3 pl-6 w-24">Type</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 w-48">Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Content / Value</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 w-24">TTL</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 text-right pr-6 w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((rec) => (
                  <TableRow key={rec.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                    <TableCell className="pl-6">
                      <Badge className={cn(
                        "font-mono text-[10px] font-bold px-2 py-0 border shadow-none",
                        rec.type === "A" ? "bg-blue-50 text-blue-600 border-blue-100" :
                        rec.type === "MX" ? "bg-amber-50 text-amber-600 border-amber-100" :
                        rec.type === "TXT" ? "bg-slate-50 text-slate-600 border-slate-200" :
                        "bg-emerald-50 text-emerald-600 border-emerald-100"
                      )}>
                        {rec.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-700 font-bold">
                      {rec.name}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs text-slate-500 truncate max-w-md">{rec.content}</span>
                        {rec.priority !== undefined && (
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Priority: {rec.priority}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 font-medium">{rec.ttl}</TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-primary transition-colors"
                          onClick={() => openEditDialog(rec)}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-destructive transition-colors"
                          onClick={() => handleDelete(rec.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {records.length === 0 && (
              <div className="p-12 text-center">
                <Info className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No DNS records found for this domain.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="font-headline font-bold">
                {editingRecord ? "Edit DNS Record" : "Add New DNS Record"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-6">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-xs font-bold">Type</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(v: any) => setFormData({ ...formData, type: v })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A (IPv4)</SelectItem>
                    <SelectItem value="AAAA">AAAA (IPv6)</SelectItem>
                    <SelectItem value="CNAME">CNAME (Alias)</SelectItem>
                    <SelectItem value="MX">MX (Mail)</SelectItem>
                    <SelectItem value="TXT">TXT (Text)</SelectItem>
                    <SelectItem value="NS">NS (Nameserver)</SelectItem>
                    <SelectItem value="SRV">SRV (Service)</SelectItem>
                    <SelectItem value="CAA">CAA (Certificate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-xs font-bold">Name</Label>
                <div className="col-span-3 flex items-center">
                  <Input 
                    value={formData.name} 
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. @ or www" 
                  />
                  <div className="ml-2 group relative">
                    <Info className="w-4 h-4 text-slate-300 cursor-help" />
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                      Use @ for the root domain (e.g. institution.edu.np)
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-xs font-bold">
                  {formData.type === "CNAME" || formData.type === "MX" || formData.type === "NS" ? "Target" : "Content"}
                </Label>
                <Input 
                  value={formData.content} 
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  placeholder={
                    formData.type === "A" ? "192.168.1.1" : 
                    formData.type === "MX" ? "mail.example.com" :
                    "Value"
                  } 
                  className="col-span-3" 
                />
              </div>

              {renderDynamicFields()}

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right text-xs font-bold">TTL</Label>
                <Select 
                  value={formData.ttl} 
                  onValueChange={v => setFormData({ ...formData, ttl: v })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Auto">Auto</SelectItem>
                    <SelectItem value="60">1 min</SelectItem>
                    <SelectItem value="300">5 min</SelectItem>
                    <SelectItem value="3600">1 hour</SelectItem>
                    <SelectItem value="86400">1 day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="h-9 px-6 font-bold">Cancel</Button>
              <Button onClick={handleSave} className="h-9 px-6 font-bold">Save Record</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
