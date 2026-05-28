"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  ShieldCheck, 
  Loader2, 
  Server,
  Globe,
  AlertCircle,
  Clock,
  MessageSquare,
  Info,
  CheckCircle2,
  Shield
} from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore"
import { 
  getZoneDetails, 
  listDNSRecords, 
  createDNSRecord, 
  updateDNSRecord, 
  deleteDNSRecord
} from "@/app/actions/cloudflare-dns"
import Link from "next/link"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type DNSRecord = {
  id: string
  type: string
  name: string
  content: string
  ttl: string
  proxied: boolean
  priority?: number
}

interface Organization {
  id: string
  name: string
  domain: string
  cloudflareZoneId?: string
  dnsRequested?: boolean
}

export default function DNSManagementPage() {
  const { toast } = useToast()
  const { user } = useUser()
  const db = useFirestore()

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true)

  const [records, setRecords] = useState<DNSRecord[]>([])
  const [zoneDetails, setZoneDetails] = useState<any>(null)
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  
  const [formData, setFormData] = useState<Partial<DNSRecord>>({
    type: "A",
    name: "",
    content: "",
    ttl: "Auto",
    proxied: true,
    priority: 10
  })

  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])
  const zoneId = selectedOrg?.cloudflareZoneId

  const fetchDNSData = useCallback(async () => {
    if (!zoneId) return
    setIsLoadingRecords(true)
    try {
      const zoneRes = await getZoneDetails(zoneId)
      if (zoneRes.success) {
        setZoneDetails(zoneRes.data)
      }
      
      const dnsRes = await listDNSRecords(zoneId)
      if (dnsRes.success) {
        setRecords(dnsRes.data)
      } else {
        throw new Error(dnsRes.error)
      }
    } catch (error: any) {
      console.warn('Network sync issue:', error.message)
      toast({
        variant: "destructive",
        title: "Sync Error",
        description: error.message || "Could not fetch data from the network edge."
      })
    } finally {
      setIsLoadingRecords(false)
    }
  }, [zoneId, toast])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, "organizations"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Organization[]
      setOrgs(fetched)
      if (fetched.length > 0 && !selectedOrgId) {
        setSelectedOrgId(fetched[0].id)
      }
      setIsLoadingOrgs(false)
    })
    return unsub
  }, [user, db, selectedOrgId])

  useEffect(() => {
    if (zoneId) {
      fetchDNSData()
    } else {
      setRecords([])
      setZoneDetails(null)
    }
  }, [zoneId, fetchDNSData])

  const handleSaveRecord = async () => {
    if (!zoneId) return
    
    if (!formData.name || !formData.content) {
      toast({ 
        variant: "destructive", 
        title: "Missing Details", 
        description: "Please provide both a name and a value for the record." 
      })
      return
    }

    setIsSubmitting(true)
    try {
      let res;
      if (editingRecord) {
        res = await updateDNSRecord(zoneId, editingRecord.id, formData)
      } else {
        res = await createDNSRecord(zoneId, formData)
      }
      
      if (res.success) {
        toast({ title: editingRecord ? "Record Updated" : "Record Created", description: "Changes have been deployed globally." })
        setIsDialogOpen(false)
        fetchDNSData()
      } else {
        throw new Error(res.error)
      }
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Update Error", 
        description: error.message || "Could not save the record." 
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRecord = async (id: string) => {
    if (!zoneId) return
    if (!confirm("Are you sure you want to permanently remove this record?")) return

    try {
      const res = await deleteDNSRecord(zoneId, id)
      if (res.success) {
        toast({ title: "Record Removed", description: "The configuration has been deleted." })
        fetchDNSData()
      } else {
        throw new Error(res.error)
      }
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Delete Failed", 
        description: error.message || "Could not remove the record." 
      })
    }
  }

  const handleRequestDNS = async () => {
    if (!selectedOrg) return
    setIsRequesting(true)
    
    try {
      const orgRef = doc(db, "organizations", selectedOrg.id)
      await updateDoc(orgRef, {
        dnsRequested: true
      })
      
      toast({
        title: "Activation Requested",
        description: "Your network management request has been sent to the infrastructure team.",
      })
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Request Failed",
        description: "Could not submit activation request at this time."
      })
    } finally {
      setIsRequesting(false)
    }
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: "Copied to Clipboard", description: `"${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" copied.` })
  }

  const filteredRecords = records.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (isLoadingOrgs) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Infrastructure...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Network</span>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Domain Management</h1>
            <div className="flex items-center gap-3">
               <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                 <SelectTrigger className="w-full md:w-[280px] bg-white font-bold text-xs h-10 shadow-sm border-slate-200">
                   <SelectValue placeholder="Select Institution" />
                 </SelectTrigger>
                 <SelectContent>
                   {orgs.map(org => (
                     <SelectItem key={org.id} value={org.id} className="text-xs">{org.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               {zoneId && (
                 <Button onClick={() => {
                   setEditingRecord(null)
                   setFormData({ type: "A", name: "", content: "", ttl: "Auto", proxied: true, priority: 10 })
                   setIsDialogOpen(true)
                 }} className="bg-slate-900 hover:bg-black text-white font-bold h-10 px-6 shadow-lg shadow-slate-200">
                   <Plus className="w-4 h-4 mr-2" />
                   Add Record
                 </Button>
               )}
            </div>
          </div>
        </div>

        {selectedOrg && !selectedOrg.dnsRequested && !zoneId ? (
          <div className="max-w-4xl mx-auto py-12 animate-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-12 text-center">
              <div className="space-y-4">
                <Badge variant="secondary" className="bg-primary/10 text-primary font-bold px-3 py-1">
                  Premium Infrastructure
                </Badge>
                <h2 className="text-4xl font-headline font-bold text-slate-900 leading-tight">
                  Professional Domain Infrastructure
                </h2>
                <p className="text-slate-500 text-lg leading-relaxed max-w-2xl mx-auto">
                  Connect your institution's domain to our professional global network. Unlock advanced security, performance, and simplified management.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto text-left">
                {[
                  { title: "Advanced Security", desc: "Enterprise DDoS Protection & WAF", icon: ShieldCheck },
                  { title: "Ultra-Fast DNS", desc: "Global Propagation in seconds", icon: Globe },
                  { title: "Record Management", desc: "MX, CNAME & TXT edge control", icon: Server },
                  { title: "99.9% Uptime", desc: "Redundant node infrastructure", icon: CheckCircle2 }
                ].map((feature) => (
                  <div key={feature.title} className="p-4 bg-white border border-slate-200 rounded-xl flex items-center gap-4 hover:border-primary/20 transition-all shadow-sm">
                    <div className="p-2.5 bg-primary/5 rounded-lg">
                      <feature.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{feature.title}</h4>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-8 flex flex-col items-center">
                <Button 
                  onClick={handleRequestDNS} 
                  size="lg" 
                  disabled={isRequesting}
                  className="font-bold px-12 h-14 shadow-xl shadow-primary/20 text-lg group"
                >
                  {isRequesting ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <Globe className="w-5 h-5 mr-3 group-hover:rotate-12 transition-transform" />}
                  Activate Global Network
                </Button>
                <p className="text-[10px] text-slate-400 mt-6 font-medium uppercase tracking-widest">
                  Estimated Setup Time: 2-4 Hours • Managed Activation
                </p>
              </div>
            </div>
          </div>
        ) : selectedOrg && selectedOrg.dnsRequested && !zoneId ? (
          <div className="max-w-4xl mx-auto py-20">
            <Card className="bg-amber-50 border-amber-200 shadow-sm border-dashed">
              <CardContent className="p-20 flex flex-col items-center text-center gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-white border border-amber-100 flex items-center justify-center shadow-sm relative">
                    <Clock className="w-10 h-10 text-amber-500" />
                    <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white font-bold border-2 border-white">
                      PENDING
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-headline font-bold text-amber-900">Infrastructure Provisioning</h3>
                  <p className="text-amber-700/80 max-w-lg mx-auto text-sm leading-relaxed font-medium">
                    We are currently configuring your secure edge environment for <span className="font-bold">{selectedOrg.domain}</span>. Once complete, your assigned network nodes will appear here.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Link href="/support">
                    <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 font-bold gap-2 h-11 px-6">
                      <MessageSquare className="w-4 h-4" />
                      Contact Network Desk
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : selectedOrg && zoneId && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-4 px-6">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Network Nodes</CardTitle>
                </div>
                <Badge className={cn(
                  "text-[9px] font-bold px-2 py-0.5 border shadow-none",
                  zoneDetails?.status === 'active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                )}>
                  {zoneDetails?.status?.toUpperCase() || "PENDING"}
                </Badge>
              </CardHeader>
              <CardContent className="p-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-3">
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Assigned Name Servers</p>
                     <div className="space-y-2">
                       {(zoneDetails?.nameServers || []).map((ns: string) => (
                         <div 
                           key={ns} 
                           className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg group hover:border-primary/20 cursor-pointer transition-all"
                           onClick={() => handleCopyText(ns)}
                         >
                           <code className="text-xs font-mono font-bold text-slate-700">{ns}</code>
                           <Globe className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
                         </div>
                       ))}
                       {!zoneDetails?.nameServers?.length && <p className="text-xs text-slate-400 italic">Nodes will appear once initialized.</p>}
                     </div>
                   </div>
                   <div className="space-y-4 flex flex-col justify-center border-l border-slate-100 pl-8">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-slate-900">Infrastructure Connection</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium">
                          Update your domain's name servers at your registrar to point to the nodes listed above. 
                          Propagation typically occurs within 1-2 hours.
                        </p>
                      </div>
                      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-[10px] text-primary font-bold leading-relaxed">
                          Your records will only take effect after your registrar is pointed to these nodes.
                        </p>
                      </div>
                   </div>
                 </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-4 px-6">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DNS Records</CardTitle>
                  <Badge variant="outline" className="text-[9px] font-bold h-5 px-1.5 bg-white border-slate-200">{records.length}</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input 
                    placeholder="Search records..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs w-48 bg-white border-slate-200 font-medium" 
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <TooltipProvider>
                  {isLoadingRecords ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Synchronizing Records...</p>
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="p-24 text-center space-y-3">
                      <AlertCircle className="w-8 h-8 text-slate-100 mx-auto" />
                      <p className="text-sm font-bold text-slate-400">No active DNS records found.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-b border-slate-100">
                          <TableHead className="text-[10px] font-bold uppercase py-4 pl-6 w-20">Type</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 w-40">Name</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4">Value</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 w-28">
                            <div className="flex items-center gap-1.5">
                              Proxied
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-3 shadow-xl">
                                  <p className="text-xs font-medium leading-relaxed">
                                    Cloudflare responds to DNS queries. HTTP/S traffic is sent to the Cloudflare network and handled by security, caching, performance, and the developer platform.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-6 w-32">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.map((rec) => (
                          <TableRow key={rec.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                            <TableCell className="pl-6 py-4">
                              <Badge className={cn(
                                "font-mono text-[9px] font-bold px-2 py-0 h-5 border shadow-none",
                                rec.type === "A" ? "bg-blue-50 text-blue-600 border-blue-100" :
                                rec.type === "MX" ? "bg-amber-50 text-amber-600 border-amber-100" :
                                rec.type === "TXT" ? "bg-slate-50 text-slate-500 border-slate-200" :
                                "bg-emerald-50 text-emerald-600 border-emerald-100"
                              )}>
                                {rec.type}
                              </Badge>
                            </TableCell>
                            <TableCell 
                              className="font-bold text-xs text-slate-800 cursor-pointer hover:bg-slate-50/50 transition-all rounded p-2"
                              onClick={() => handleCopyText(rec.name)}
                            >
                              {rec.name}
                            </TableCell>
                            <TableCell 
                              className="max-w-md cursor-pointer hover:bg-slate-50/50 transition-all rounded p-2"
                              onClick={() => handleCopyText(rec.content)}
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono text-[11px] text-slate-500 whitespace-pre-wrap break-all leading-relaxed">
                                  {rec.content}
                                </span>
                                {rec.priority !== undefined && (
                                  <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">
                                    Priority: {rec.priority}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                               {rec.proxied ? (
                                 <div className="flex items-center gap-1.5 text-amber-500">
                                   <ShieldCheck className="w-4 h-4" />
                                   <span className="text-[9px] font-bold uppercase tracking-tighter">On</span>
                                 </div>
                               ) : (
                                 <div className="flex items-center gap-1.5 text-slate-400">
                                   <Globe className="w-4 h-4" />
                                   <span className="text-[9px] font-bold uppercase tracking-tighter">Off</span>
                                 </div>
                               )}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <div className="flex items-center justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-primary transition-colors"
                                  onClick={() => {
                                    setEditingRecord(rec)
                                    setFormData(rec)
                                    setIsDialogOpen(true)
                                  }}
                                >
                                  <Edit3 className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-destructive transition-colors"
                                  onClick={() => handleDeleteRecord(rec.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TooltipProvider>
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <DialogTitle className="font-headline font-bold text-xl">
                {editingRecord ? "Edit Record" : "Add Record"}
              </DialogTitle>
              <p className="text-slate-400 text-xs mt-1">Configure DNS parameters for {selectedOrg?.domain}.</p>
            </DialogHeader>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-5">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500">Type</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(v) => setFormData({...formData, type: v})}
                  >
                    <SelectTrigger className="col-span-3 h-10 font-bold border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"].map(t => (
                        <SelectItem key={t} value={t} className="text-xs font-bold">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500">Name</Label>
                  <div className="col-span-3">
                    <Input 
                      placeholder="e.g. www or @" 
                      className="h-10 font-bold text-xs border-slate-200" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 items-start gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500 mt-2.5">Value</Label>
                  <Textarea 
                    placeholder="e.g. 192.168.1.1 or mail.example.com" 
                    className="col-span-3 min-h-[100px] font-bold text-xs border-slate-200 leading-relaxed" 
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                  />
                </div>

                {formData.type === "MX" && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right text-[10px] font-bold uppercase text-slate-500">Priority</Label>
                    <Input 
                      type="number" 
                      className="col-span-3 h-10 font-bold text-xs border-slate-200" 
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: parseInt(e.target.value) || 0})}
                    />
                  </div>
                )}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500">TTL</Label>
                  <Select value={formData.ttl} onValueChange={(v) => setFormData({...formData, ttl: v})}>
                    <SelectTrigger className="col-span-3 h-10 text-xs font-bold border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Auto" className="text-xs font-bold">Auto</SelectItem>
                      <SelectItem value="60" className="text-xs font-bold">1 minute</SelectItem>
                      <SelectItem value="3600" className="text-xs font-bold">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-lg mt-2">
                   <div className="space-y-0.5">
                     <div className="flex items-center gap-2">
                        <Label className="text-xs font-bold text-slate-900">Proxied</Label>
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                     </div>
                     <p className="text-[10px] text-slate-400 font-medium">Hides your server's IP and protects it from direct threats via our security layer.</p>
                   </div>
                   <Switch 
                    checked={formData.proxied} 
                    onCheckedChange={(v) => setFormData({...formData, proxied: v})} 
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
              <Button onClick={handleSaveRecord} disabled={isSubmitting} className="px-8 bg-slate-900 hover:bg-black text-white font-bold h-11 shadow-lg shadow-slate-200">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : editingRecord ? "Save Changes" : "Add Record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
