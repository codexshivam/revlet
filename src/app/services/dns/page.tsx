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
  RefreshCw, 
  CheckCircle2, 
  Loader2, 
  Server,
  Globe,
  AlertCircle,
  Activity,
  Copy,
  Check,
  Clock
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
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore"
import { 
  getZoneDetails, 
  listDNSRecords, 
  createDNSRecord, 
  updateDNSRecord, 
  deleteDNSRecord,
  checkZoneActivation,
  createZone
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
  cloudflareZoneId?: string
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
  const [isSettingUp, setIsSettingUp] = useState(false)
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [copiedNS, setCopiedNS] = useState<string | null>(null)
  
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
      const zone = await getZoneDetails(zoneId)
      setZoneDetails(zone)
      
      const dns = await listDNSRecords(zoneId)
      setRecords(dns)
    } catch (error: any) {
      console.warn('Network sync issue:', error.message)
      toast({
        variant: "destructive",
        title: "Sync Error",
        description: "Could not fetch data from the network edge."
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

  const handleRefreshActivation = useCallback(async () => {
    if (!zoneId) return
    setIsRefreshing(true)
    try {
      await checkZoneActivation(zoneId)
      await fetchDNSData()
      toast({
        title: "Connection Checked",
        description: "Node status check initiated. This may take a few minutes to update globally."
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Check Failed",
        description: "Could not verify node status."
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [zoneId, fetchDNSData, toast])

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
      if (editingRecord) {
        await updateDNSRecord(zoneId, editingRecord.id, formData)
        toast({ title: "Record Updated", description: "Changes have been deployed globally." })
      } else {
        await createDNSRecord(zoneId, formData)
        toast({ title: "Record Created", description: "The new record is now propagating." })
      }
      setIsDialogOpen(false)
      fetchDNSData()
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
      await deleteDNSRecord(zoneId, id)
      toast({ title: "Record Removed", description: "The configuration has been deleted." })
      fetchDNSData()
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Delete Failed", 
        description: "Could not remove the record." 
      })
    }
  }

  const handleSetupDNS = async () => {
    if (!selectedOrg) return
    setIsSettingUp(true)
    
    try {
      const newZone = await createZone(selectedOrg.domain)
      const orgRef = doc(db, "organizations", selectedOrg.id)
      await updateDoc(orgRef, {
        cloudflareZoneId: newZone.id
      })
      toast({
        title: "Infrastructure Initialized",
        description: "Domain added to the global network. Please update your nodes as shown.",
      })
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Setup Failed",
        description: error.message || "Ensure the domain is valid and not already managed."
      })
    } finally {
      setIsSettingUp(false)
    }
  }

  const handleCopyNS = (ns: string) => {
    navigator.clipboard.writeText(ns)
    setCopiedNS(ns)
    setTimeout(() => setCopiedNS(null), 2000)
    toast({ title: "Copied", description: "Node address copied to clipboard." })
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
               {zoneId && zoneDetails?.status === 'active' && (
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

        {selectedOrg && !zoneId ? (
          <Card className="bg-white border-slate-200 shadow-sm border-dashed">
            <CardContent className="p-20 flex flex-col items-center text-center gap-6">
              <div className="w-20 h-20 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shadow-sm">
                <Globe className="w-10 h-10 text-slate-200" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-bold text-slate-900">Initialize Domain Setup</h3>
                <p className="text-slate-500 max-w-lg mx-auto leading-relaxed text-sm">
                  Connect <span className="font-bold text-slate-900">{selectedOrg.domain}</span> to our global edge network to enable web and mail services.
                </p>
              </div>
              <Button 
                onClick={handleSetupDNS} 
                size="lg" 
                disabled={isSettingUp}
                className="font-bold px-10 h-12 shadow-xl shadow-primary/10"
              >
                {isSettingUp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Setup Domain Now
              </Button>
            </CardContent>
          </Card>
        ) : selectedOrg && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="md:col-span-2 bg-white border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-400" />
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Server Nodes</CardTitle>
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
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Assigned Nodes</p>
                       <div className="space-y-2">
                         {(zoneDetails?.nameServers || []).map((ns: string) => (
                           <div key={ns} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg group">
                             <code className="text-xs font-mono font-bold text-slate-700">{ns}</code>
                             <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-slate-400 hover:text-primary"
                                onClick={() => handleCopyNS(ns)}
                              >
                                {copiedNS === ns ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </Button>
                           </div>
                         ))}
                         {!zoneDetails?.nameServers?.length && <p className="text-xs text-slate-400 italic">Nodes will appear once initialized.</p>}
                       </div>
                     </div>
                     <div className="space-y-4 flex flex-col justify-center border-l border-slate-100 pl-8">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-slate-900">Infrastructure Connection</h4>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            Point your domain at your registrar to these nodes. Propagation can take up to 24 hours.
                          </p>
                        </div>
                        <Button 
                          onClick={handleRefreshActivation} 
                          disabled={isRefreshing}
                          className="w-full bg-slate-900 text-white font-bold gap-2 h-10 shadow-lg"
                        >
                          {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          Check Node Connection
                        </Button>
                     </div>
                   </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 text-white shadow-xl border-none">
                <CardContent className="p-8 space-y-4 flex flex-col justify-between h-full">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-headline font-bold text-lg">Network Edge Health</h4>
                    <p className="text-xs text-slate-400 leading-relaxed mt-1">
                      {zoneDetails?.status === 'active' 
                        ? "Your domain is fully integrated and protected by the global security layer."
                        : "Waiting for nameserver updates. DNS records will sync once the nodes are active."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

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
                {isLoadingRecords ? (
                  <div className="flex flex-col items-center justify-center py-32 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Synchronizing Records...</p>
                  </div>
                ) : zoneDetails?.status !== 'active' ? (
                  <div className="p-24 text-center space-y-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Clock className="w-6 h-6 text-amber-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Activation Required</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">Record management will be available once the global nodes are successfully connected.</p>
                    </div>
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="p-24 text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-slate-100 mx-auto" />
                    <p className="text-sm font-bold text-slate-400">No DNS records found.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow className="border-b border-slate-100">
                        <TableHead className="text-[10px] font-bold uppercase py-4 pl-6 w-20">Type</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 w-40">Name</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4">Value</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 w-24">Shield</TableHead>
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
                          <TableCell className="font-bold text-xs text-slate-800">
                            {rec.name}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-[11px] text-slate-500 truncate max-w-[250px]">{rec.content}</span>
                              {rec.priority !== undefined && <span className="text-[9px] font-bold text-slate-400 uppercase">Priority: {rec.priority}</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                             {rec.proxied ? (
                               <div className="flex items-center gap-1.5 text-amber-500" title="Security Shield Active">
                                 <ShieldCheck className="w-3.5 h-3.5" />
                                 <span className="text-[9px] font-bold uppercase tracking-tighter">On</span>
                               </div>
                             ) : (
                               <div className="flex items-center gap-1.5 text-slate-300" title="Shield Disabled">
                                 <Globe className="w-3.5 h-3.5" />
                                 <span className="text-[9px] font-bold uppercase tracking-tighter">Off</span>
                               </div>
                             )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex items-center justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-300 hover:text-primary transition-colors"
                                onClick={() => {
                                  setEditingRecord(rec)
                                  setFormData(rec)
                                  setIsDialogOpen(true)
                                }}
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
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
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
                  <div className="col-span-3 relative">
                    <Input 
                      placeholder="e.g. www or @" 
                      className="h-10 font-bold text-xs border-slate-200" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right text-[10px] font-bold uppercase text-slate-500">Value</Label>
                  <Input 
                    placeholder="e.g. 192.168.1.1" 
                    className="col-span-3 h-10 font-bold text-xs border-slate-200" 
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
                     <Label className="text-xs font-bold text-slate-900">Security Shield</Label>
                     <p className="text-[10px] text-slate-400 font-medium">Protects your server from direct threats.</p>
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
