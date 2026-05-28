
"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  Info, 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Server,
  ExternalLink,
  ChevronDown
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot } from "firebase/firestore"
import { 
  getZoneDetails, 
  listDNSRecords, 
  createDNSRecord, 
  updateDNSRecord, 
  deleteDNSRecord,
  checkZoneActivation 
} from "@/app/actions/cloudflare-dns"

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
  cloudflareZoneId: string
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
  const [isRefreshing, setIsRefreshing] = useState(false)
  
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

  const selectedOrg = orgs.find(o => o.id === selectedOrgId)

  // Fetch Orgs
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

  const fetchDNSData = useCallback(async () => {
    if (!selectedOrg?.cloudflareZoneId) return
    setIsLoadingRecords(true)
    try {
      const [zone, dns] = await Promise.all([
        getZoneDetails(selectedOrg.cloudflareZoneId),
        listDNSRecords(selectedOrg.cloudflareZoneId)
      ])
      setZoneDetails(zone)
      setRecords(dns)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Cloudflare Sync Failed",
        description: error.message || "Could not retrieve records from Cloudflare."
      })
    } finally {
      setIsLoadingRecords(false)
    }
  }, [selectedOrg?.cloudflareZoneId, toast])

  // Initial fetch on org change
  useEffect(() => {
    if (selectedOrg?.cloudflareZoneId) {
      fetchDNSData()
    } else {
      setRecords([])
      setZoneDetails(null)
    }
  }, [selectedOrg, fetchDNSData])

  const handleRefreshActivation = async () => {
    if (!selectedOrg?.cloudflareZoneId) return
    setIsRefreshing(true)
    try {
      await checkZoneActivation(selectedOrg.cloudflareZoneId)
      await fetchDNSData()
      toast({
        title: "Refresh Initiated",
        description: "Cloudflare has been notified to check for nameserver updates."
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: error.message
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleSaveRecord = async () => {
    if (!selectedOrg?.cloudflareZoneId) return
    
    if (!formData.name || !formData.content) {
      toast({ variant: "destructive", title: "Missing details", description: "Name and content are required." })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingRecord) {
        await updateDNSRecord(selectedOrg.cloudflareZoneId, editingRecord.id, formData)
        toast({ title: "Record Updated", description: "Changes propagated successfully." })
      } else {
        await createDNSRecord(selectedOrg.cloudflareZoneId, formData)
        toast({ title: "Record Created", description: "New DNS record is now live." })
      }
      setIsDialogOpen(false)
      fetchDNSData()
    } catch (error: any) {
      toast({ variant: "destructive", title: "Cloudflare Error", description: error.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRecord = async (id: string) => {
    if (!selectedOrg?.cloudflareZoneId) return
    if (!confirm("Are you sure you want to delete this DNS record?")) return

    try {
      await deleteDNSRecord(selectedOrg.cloudflareZoneId, id)
      toast({ title: "Record Deleted" })
      fetchDNSData()
    } catch (error: any) {
      toast({ variant: "destructive", title: "Deletion Failed", description: error.message })
    }
  }

  const openAddDialog = () => {
    setEditingRecord(null)
    setFormData({ type: "A", name: "", content: "", ttl: "Auto", proxied: true, priority: 10 })
    setIsDialogOpen(true)
  }

  const openEditDialog = (record: DNSRecord) => {
    setEditingRecord(record)
    setFormData(record)
    setIsDialogOpen(true)
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
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identifying Cloud Infrastructure...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Engineering</span>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Authoritative DNS Management</h1>
            <div className="flex items-center gap-3">
               <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                 <SelectTrigger className="w-[280px] bg-white font-bold text-xs h-10 shadow-sm">
                   <SelectValue placeholder="Select Institution" />
                 </SelectTrigger>
                 <SelectContent>
                   {orgs.map(org => (
                     <SelectItem key={org.id} value={org.id} className="text-xs">{org.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <Button onClick={openAddDialog} className="bg-slate-900 hover:bg-black text-white font-bold h-10 px-6">
                 <Plus className="w-4 h-4 mr-2" />
                 Provision Record
               </Button>
            </div>
          </div>
        </div>

        {selectedOrg && !selectedOrg.cloudflareZoneId && (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-8 flex items-center gap-4">
              <AlertCircle className="w-8 h-8 text-amber-500 shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-amber-900">Cloudflare Integration Missing</h3>
                <p className="text-xs text-amber-700/80 mt-0.5">Please add a Cloudflare Zone ID to this organization in Account Home to enable DNS management features.</p>
              </div>
              <Button variant="outline" size="sm" className="bg-white border-amber-200 text-amber-700 font-bold" onClick={() => router.push('/account/home')}>Configure Now</Button>
            </CardContent>
          </Card>
        )}

        {selectedOrg?.cloudflareZoneId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Nameserver Status Card */}
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-400" />
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Authoritative Nameservers</CardTitle>
                  </div>
                  <Badge className={cn(
                    "text-[9px] font-bold px-2 py-0.5 border shadow-none",
                    zoneDetails?.status === 'active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                  )}>
                    {zoneDetails?.status === 'active' ? "ACTIVE & PROTECTED" : "PENDING DEPLOYMENT"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-8">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-4">
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Assigned Cloudflare Nameservers</p>
                       <div className="space-y-2">
                         {zoneDetails?.nameServers?.map((ns: string) => (
                           <div key={ns} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg group hover:border-primary/20 transition-all">
                             <code className="text-xs font-mono font-bold text-slate-700">{ns}</code>
                             <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                           </div>
                         )) || <p className="text-xs text-slate-400 italic">No nameservers assigned yet.</p>}
                       </div>
                     </div>
                     <div className="space-y-6 flex flex-col justify-center border-l border-slate-100 pl-8">
                        <div className="space-y-2">
                          <h4 className="text-sm font-bold text-slate-900">Activation Status</h4>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {zoneDetails?.status === 'active' 
                              ? "Your domain is successfully pointing to our infrastructure and is protected by Cloudflare WAF."
                              : "Point your domain nameservers at your registrar to the assigned nodes on the left to activate management."}
                          </p>
                        </div>
                        <Button 
                          onClick={handleRefreshActivation} 
                          disabled={isRefreshing}
                          className="w-full bg-slate-900 text-white font-bold gap-2 h-11"
                        >
                          {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Force Activation Check
                        </Button>
                     </div>
                   </div>
                </CardContent>
              </Card>

              {/* DNS Records Table */}
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone File Records</CardTitle>
                    <Badge variant="outline" className="text-[9px] font-bold h-5 px-1.5 bg-white">{records.length}</Badge>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input 
                      placeholder="Filter records..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-8 text-xs w-48 bg-white border-slate-200" 
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingRecords ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Synchronizing with Cloudflare edge...</p>
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="p-20 text-center space-y-2">
                      <Info className="w-8 h-8 text-slate-100 mx-auto" />
                      <p className="text-sm font-bold text-slate-400">No zone records found.</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-b border-slate-100">
                          <TableHead className="text-[10px] font-bold uppercase py-4 pl-6 w-20">Type</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 w-40">Name</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4">Content / Target</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 w-24">Proxy</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-6 w-32">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.map((rec) => (
                          <TableRow key={rec.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                            <TableCell className="pl-6">
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
                            <TableCell className="font-bold text-xs text-slate-800">
                              {rec.name.split('.')[0] === selectedOrg?.domain.split('.')[0] ? "@" : rec.name.replace(`.${selectedOrg?.domain}`, '')}
                            </TableCell>
                            <TableCell className="max-w-md">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono text-[11px] text-slate-500 truncate">{rec.content}</span>
                                {rec.priority !== undefined && <span className="text-[9px] font-bold text-slate-400 uppercase">Priority: {rec.priority}</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                               {rec.proxied ? (
                                 <div className="flex items-center gap-1.5 text-amber-500" title="Cloudflare Proxied">
                                   <ShieldCheck className="w-3.5 h-3.5" />
                                   <span className="text-[9px] font-bold uppercase">Proxied</span>
                                 </div>
                               ) : (
                                 <div className="flex items-center gap-1.5 text-slate-300" title="DNS Only">
                                   <Globe className="w-3.5 h-3.5" />
                                   <span className="text-[9px] font-bold uppercase">DNS Only</span>
                                 </div>
                               )}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <div className="flex items-center justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-300 hover:text-primary transition-colors"
                                  onClick={() => openEditDialog(rec)}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-300 hover:text-destructive transition-colors"
                                  onClick={() => handleDeleteRecord(rec.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-8">
               <Card className="bg-slate-900 text-white shadow-xl shadow-slate-200 overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Globe className="w-24 h-24" />
                  </div>
                  <CardContent className="p-8 space-y-6 relative z-10">
                    <div className="space-y-2">
                      <h4 className="font-headline font-bold text-xl">Cloud Edge Network</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Your DNS is managed via Cloudflare's Global Anycast Network, providing <span className="text-white font-bold">100% uptime</span> and localized performance across 300+ cities globally.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3">
                       <Button variant="outline" className="w-full border-slate-700 hover:bg-slate-800 text-xs font-bold gap-2 text-white h-10">
                         <Info className="w-3.5 h-3.5" />
                         DNS Learning Hub
                       </Button>
                       <Button variant="outline" className="w-full border-slate-700 hover:bg-slate-800 text-xs font-bold gap-2 text-white h-10">
                         <ExternalLink className="w-3.5 h-3.5" />
                         View Global Propagation
                       </Button>
                    </div>
                  </CardContent>
               </Card>

               <Card className="bg-white border-slate-200 shadow-sm">
                 <CardHeader>
                   <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configuration Safety</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 flex gap-3">
                       <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                       <p className="text-[10px] text-slate-500 leading-relaxed">
                         Changes made here take effect <span className="text-slate-900 font-bold">instantly</span> on Cloudflare nodes. Please verify sensitive records (MX/TXT) before committing.
                       </p>
                    </div>
                    <div className="flex items-center justify-between px-2">
                      <span className="text-xs font-bold text-slate-600">Auto-propagation</span>
                      <Switch checked={true} disabled />
                    </div>
                 </CardContent>
               </Card>
            </div>
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <DialogTitle className="font-headline font-bold text-xl">
                {editingRecord ? "Modify DNS Record" : "Provision DNS Record"}
              </DialogTitle>
              <p className="text-slate-400 text-xs mt-1">Configure authoritative parameters for {selectedOrg?.domain}.</p>
            </DialogHeader>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500">Record Type</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={(v) => setFormData({...formData, type: v})}
                  >
                    <SelectTrigger className="col-span-3 h-10 font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"].map(t => (
                        <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500">Hostname</Label>
                  <div className="col-span-3 relative">
                    <Input 
                      placeholder="e.g. www or @" 
                      className="h-10 pr-12 font-bold text-xs" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300">
                      .{selectedOrg?.domain}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500">IPv4 / Target</Label>
                  <Input 
                    placeholder="e.g. 192.168.1.1" 
                    className="col-span-3 h-10 font-bold text-xs" 
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                  />
                </div>

                {formData.type === "MX" && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right text-[10px] font-bold uppercase text-slate-500">Priority</Label>
                    <Input 
                      type="number" 
                      className="col-span-3 h-10 font-bold text-xs" 
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: parseInt(e.target.value)})}
                    />
                  </div>
                )}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500">TTL</Label>
                  <Select value={formData.ttl} onValueChange={(v) => setFormData({...formData, ttl: v})}>
                    <SelectTrigger className="col-span-3 h-10 text-xs font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Auto">Auto</SelectItem>
                      <SelectItem value="60">60 seconds</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                      <SelectItem value="3600">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-lg mt-2">
                   <div className="space-y-0.5">
                     <Label className="text-xs font-bold text-slate-900">Proxy Status</Label>
                     <p className="text-[10px] text-slate-400">Hide origin IP and enable Cloudflare performance.</p>
                   </div>
                   <Switch 
                    checked={formData.proxied} 
                    onCheckedChange={(v) => setFormData({...formData, proxied: v})} 
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-xs font-bold uppercase text-slate-400">Abort</Button>
              <Button onClick={handleSaveRecord} disabled={isSubmitting} className="px-8 bg-slate-900 hover:bg-black text-white font-bold h-11">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : editingRecord ? "Update Record" : "Provision Record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
