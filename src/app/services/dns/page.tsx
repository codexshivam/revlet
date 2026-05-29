"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
  Download,
  Upload,
  FileText,
  X
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

import { useActiveOrg } from "@/hooks/use-active-org"

const SUPPORTED_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR", "NAPTR"]
const PROXY_SUPPORTED_TYPES = ["A", "AAAA", "CNAME"]

type DNSRecord = {
  id: string
  type: string
  name: string
  content: string
  ttl: string
  proxied: boolean
  priority?: number
}

export default function DNSManagementPage() {
  const { toast } = useToast()
  const { user } = useUser()
  const db = useFirestore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()

  const [records, setRecords] = useState<DNSRecord[]>([])
  const [zoneDetails, setZoneDetails] = useState<any>(null)
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
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

  // Validation & confirmation states
  const [formErrors, setFormErrors] = useState<{ name?: string; content?: string; priority?: string }>({})
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  const [importConfirmed, setImportConfirmed] = useState(false)

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [proxyAllImported, setProxyAllImported] = useState(true)

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
    if (zoneId) {
      fetchDNSData()
    } else {
      setRecords([])
      setZoneDetails(null)
    }
  }, [zoneId, fetchDNSData])

  const handleInputChange = (field: string, value: any) => {
    const updatedForm = { ...formData, [field]: value }
    setFormData(updatedForm)

    const errors = { ...formErrors }
    delete errors[field as keyof typeof errors]

    if (field === 'name') {
      const cleanVal = String(value).trim()
      if (!cleanVal) {
        errors.name = "Record name is required."
      } else if (cleanVal.includes("://")) {
        errors.name = "Name should not contain protocol prefixes (e.g. http://)."
      } else if (/\s/.test(cleanVal)) {
        errors.name = "Name cannot contain spaces."
      }
    }

    if (field === 'content') {
      const cleanVal = String(value).trim()
      if (!cleanVal) {
        errors.content = "Record value target is required."
      } else {
        const type = updatedForm.type
        if (type === "A") {
          const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
          if (!ipv4Regex.test(cleanVal)) {
            errors.content = "Must be a valid IPv4 address (e.g., 192.168.1.1)."
          }
        } else if (type === "AAAA") {
          const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/
          if (!ipv6Regex.test(cleanVal)) {
            errors.content = "Must be a valid IPv6 address."
          }
        } else if (type === "CNAME") {
          if (cleanVal.includes("://")) {
            errors.content = "CNAME target cannot contain protocol prefixes."
          } else {
            const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
            if (ipv4Regex.test(cleanVal)) {
              errors.content = "CNAME targets must be hostnames, not IP addresses."
            }
          }
        }
      }
    }

    if (field === 'priority' && updatedForm.type === 'MX') {
      const priorityVal = parseInt(value)
      if (isNaN(priorityVal) || priorityVal < 0 || priorityVal > 65535) {
        errors.priority = "Priority must be an integer between 0 and 65535."
      }
    }

    setFormErrors(errors)
  }

  const handleTypeChange = (value: string) => {
    const isStandardProxy = PROXY_SUPPORTED_TYPES.includes(value)
    setFormData({ ...formData, type: value, proxied: isStandardProxy })
    setFormErrors({}) // Clear error states on type toggle
  }

  const handleSaveRecord = async () => {
    if (!zoneId) return

    // Standard empty check
    if (!formData.name?.trim() || !formData.content?.trim()) {
      toast({ 
        variant: "destructive", 
        title: "Validation Failed", 
        description: "Name and Target Content fields cannot be empty." 
      })
      return
    }

    // Run custom deep validation
    const errors: typeof formErrors = {}
    
    const nameVal = formData.name.trim()
    if (nameVal.includes("://")) {
      errors.name = "Name should not contain protocol prefixes."
    } else if (/\s/.test(nameVal)) {
      errors.name = "Name cannot contain spaces."
    }

    const contentVal = formData.content.trim()
    const type = formData.type
    if (type === "A") {
      const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      if (!ipv4Regex.test(contentVal)) errors.content = "Must be a valid IPv4 address."
    } else if (type === "AAAA") {
      const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/
      if (!ipv6Regex.test(contentVal)) errors.content = "Must be a valid IPv6 address."
    } else if (type === "CNAME") {
      if (contentVal.includes("://")) {
        errors.content = "CNAME target cannot contain protocol prefixes."
      } else {
        const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
        if (ipv4Regex.test(contentVal)) errors.content = "CNAME targets must be hostnames, not IP addresses."
      }
    }

    if (type === "MX") {
      const priorityVal = parseInt(String(formData.priority))
      if (isNaN(priorityVal) || priorityVal < 0 || priorityVal > 65535) {
        errors.priority = "Priority must be an integer between 0 and 65535."
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      toast({ 
        variant: "destructive", 
        title: "Validation Failed", 
        description: "Please resolve form input errors before submitting." 
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

  const handleExportBIND = () => {
    if (!selectedOrg) return
    const content = records.map(r => {
      const ttl = r.ttl === 'Auto' ? '1' : r.ttl
      return `${r.name}\t${ttl}\tIN\t${r.type}\t${r.content}`
    }).join('\n')
    
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedOrg.domain}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    toast({ title: "Export Complete", description: "BIND zone file has been generated." })
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImportFile(file)
      setImportConfirmed(false)
    }
  }

  const processImport = async () => {
    if (!importFile || !zoneId) return
    setIsSubmitting(true)
    
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n')
      let count = 0
      
      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length >= 4) {
          // Very basic BIND parser: name [ttl] IN type content
          const name = parts[0]
          const type = parts.includes('IN') ? parts[parts.indexOf('IN') + 1] : parts[2]
          const content = parts.slice(parts.indexOf(type) + 1).join(' ')
          
          if (SUPPORTED_TYPES.includes(type)) {
            const isProxied = proxyAllImported && PROXY_SUPPORTED_TYPES.includes(type)
            await createDNSRecord(zoneId, {
              name,
              type,
              content,
              ttl: "Auto",
              proxied: isProxied
            })
            count++
          }
        }
      }
      
      toast({ title: "Import Complete", description: `Successfully queued ${count} records for propagation.` })
      setIsImportDialogOpen(false)
      setImportFile(null)
      fetchDNSData()
      setIsSubmitting(false)
    }
    reader.readAsText(importFile)
  }

  const filteredRecords = records.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isProxyAllowed = (type: string) => PROXY_SUPPORTED_TYPES.includes(type)

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
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Services</span>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Domain Management</h1>
            <div className="flex items-center gap-3">
               {zoneId && (
                 <div className="flex gap-2">
                   <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} className="h-10 font-bold text-xs border-slate-200">
                     <Upload className="w-4 h-4 mr-2" />
                     Import
                   </Button>
                   <Button variant="outline" onClick={handleExportBIND} className="h-10 font-bold text-xs border-slate-200">
                     <Download className="w-4 h-4 mr-2" />
                     Export
                   </Button>
                   <Button onClick={() => {
                     setEditingRecord(null)
                     setFormData({ type: "A", name: "", content: "", ttl: "Auto", proxied: true, priority: 10 })
                     setIsDialogOpen(true)
                   }} className="bg-slate-900 hover:bg-black text-white font-bold h-10 px-6 shadow-lg shadow-slate-200">
                     <Plus className="w-4 h-4 mr-2" />
                     Add Record
                   </Button>
                 </div>
               )}
            </div>
          </div>
        </div>

        {orgs.length === 0 ? (
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
              <CardContent className="p-16 flex flex-col items-center text-center gap-6">
                <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                  <Globe className="w-10 h-10 text-slate-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-headline font-bold text-slate-900">No Registered Organizations</h3>
                  <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                    To manage DNS edge configurations, you must first register your organization on the Account Home screen.
                  </p>
                </div>
                <Link href="/account/home">
                  <Button className="font-bold gap-2 h-11 px-6 bg-slate-900 hover:bg-black text-white transition-all shadow-md">
                    Go to Account Home
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        ) : selectedOrg && !selectedOrg.dnsRequested && !zoneId ? (
          <div className="max-w-5xl mx-auto py-12 animate-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-12 text-center">
              <div className="space-y-4">
                <h2 className="text-4xl font-headline font-bold text-slate-900 leading-tight">
                  Premium Domain Infrastructure
                </h2>
                <p className="text-slate-500 text-lg leading-relaxed max-w-2xl mx-auto">
                  Unlock advanced security, ultra-fast propagation, and centralized management by activating your organization's global network context.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
                {[
                  { title: "Advanced Security", desc: "Enterprise-grade DDoS protection and managed edge firewall rules.", icon: ShieldCheck, color: "bg-blue-50 text-blue-600 border-blue-100" },
                  { title: "Ultra-Fast DNS", desc: "Global Anycast network ensures sub-second propagation and resolution.", icon: Globe, color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
                  { title: "Edge Control", desc: "Manage MX, CNAME, and TXT records directly from your administrative dashboard.", icon: Server, color: "bg-purple-50 text-purple-600 border-purple-100" },
                  { title: "High Availability", desc: "Redundant global nameservers with a 99.9% uptime guarantee for all services.", icon: CheckCircle2, color: "bg-amber-50 text-amber-600 border-amber-100" }
                ].map((feature) => (
                  <div key={feature.title} className={cn("p-6 rounded-2xl border flex items-start gap-5 transition-all shadow-sm hover:shadow-md", feature.color)}>
                    <div className="p-3 bg-white rounded-xl shadow-sm shrink-0">
                      <feature.icon className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-base font-bold">{feature.title}</h4>
                      <p className="text-xs opacity-80 leading-relaxed font-medium">{feature.desc}</p>
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
              </div>
            </div>
          </div>
        ) : selectedOrg && selectedOrg.dnsRequested && !zoneId ? (
          <div className="w-full py-8">
            <Card className="bg-amber-50 border-amber-200 shadow-sm border-dashed">
              <CardContent className="p-12 md:p-20 flex flex-col items-center text-center gap-6">
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
                    We are currently configuring your secure edge environment for <span className="font-bold">{selectedOrg.domain}</span>. Once complete, your assigned network nameservers will appear here.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Link href="/support">
                    <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-yellow-500 hover:text-white hover:border-yellow-500 transition-colors font-bold gap-2 h-11 px-6">
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
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Network Nameservers</CardTitle>
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
                       {!zoneDetails?.nameServers?.length && <p className="text-xs text-slate-400 italic">Nameservers will appear once initialized.</p>}
                     </div>
                   </div>
                   <div className="space-y-4 flex flex-col justify-center border-l border-slate-100 pl-8">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-slate-900">Infrastructure Connection</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium">
                          Update your domain's name servers at your registrar to point to the nameservers listed above. 
                          Propagation typically occurs within 1-2 hours.
                        </p>
                      </div>
                      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-[10px] text-primary font-bold leading-relaxed">
                          Your records will only take effect after your registrar is pointed to these nameservers.
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
                               {!isProxyAllowed(rec.type) ? (
                                 <span className="text-[10px] text-slate-300 font-bold ml-1.5">—</span>
                               ) : rec.proxied ? (
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
                                  className="h-8 w-8 text-slate-400 hover:bg-primary hover:text-white transition-all rounded-md"
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
                                  className="h-8 w-8 text-slate-400 hover:bg-destructive hover:text-white transition-all rounded-md"
                                  onClick={() => {
                                    setDeletingRecordId(rec.id)
                                    setIsDeleteOpen(true)
                                  }}
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

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) setFormErrors({}) // Clear errors on close
        }}>
          <DialogContent className="max-w-md p-0 overflow-hidden border border-slate-200/80 shadow-2xl bg-white rounded-xl">
            <DialogHeader className="bg-white border-b border-slate-100 px-5 py-4">
              <DialogTitle className="font-headline font-bold text-base text-slate-900">
                {editingRecord ? "Edit DNS Record" : "Create DNS Record"}
              </DialogTitle>
              <p className="text-slate-400 text-[10px] mt-0.5 uppercase font-bold tracking-wider">Zone: {selectedOrg?.domain}</p>
            </DialogHeader>
            <div className="px-5 py-4 space-y-3.5">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Record Type</Label>
                  <Select 
                    value={formData.type} 
                    onValueChange={handleTypeChange}
                  >
                    <SelectTrigger className="h-9 font-bold border-slate-200 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_TYPES.map(t => (
                        <SelectItem key={t} value={t} className="text-xs font-bold">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Name (e.g. @ or www)</Label>
                  <Input 
                    placeholder="e.g. www" 
                    className={cn(
                      "h-9 font-semibold text-xs border-slate-200 transition-all",
                      formErrors.name && "border-red-400 focus-visible:ring-red-500 bg-red-50/20"
                    )}
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                  {formErrors.name && <p className="text-[9px] text-red-500 font-bold uppercase tracking-wide">{formErrors.name}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Value / Target</Label>
                  <Input 
                    placeholder="e.g. 192.168.1.1" 
                    className={cn(
                      "h-9 font-semibold text-xs border-slate-200 transition-all",
                      formErrors.content && "border-red-400 focus-visible:ring-red-500 bg-red-50/20"
                    )}
                    value={formData.content}
                    onChange={(e) => handleInputChange('content', e.target.value)}
                  />
                  {formErrors.content && <p className="text-[9px] text-red-500 font-bold uppercase tracking-wide">{formErrors.content}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  {formData.type === "MX" ? (
                    <div className="space-y-1">
                      <Label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Priority</Label>
                      <Input 
                        type="number" 
                        className={cn(
                          "h-9 font-semibold text-xs border-slate-200 transition-all",
                          formErrors.priority && "border-red-400 focus-visible:ring-red-500 bg-red-50/20"
                        )}
                        value={formData.priority}
                        onChange={(e) => handleInputChange('priority', e.target.value)}
                      />
                      {formErrors.priority && <p className="text-[9px] text-red-500 font-bold uppercase tracking-wide">{formErrors.priority}</p>}
                    </div>
                  ) : <div />}

                  <div className="space-y-1">
                    <Label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">TTL</Label>
                    <Select value={formData.ttl} onValueChange={(v) => setFormData({...formData, ttl: v})}>
                      <SelectTrigger className="h-9 text-xs font-semibold border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Auto" className="text-xs font-bold">Auto</SelectItem>
                        <SelectItem value="60" className="text-xs font-bold">1 minute</SelectItem>
                        <SelectItem value="300" className="text-xs font-bold">5 minutes</SelectItem>
                        <SelectItem value="3600" className="text-xs font-bold">1 hour</SelectItem>
                        <SelectItem value="86400" className="text-xs font-bold">1 day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isProxyAllowed(formData.type!) && (
                  <div className="flex items-center justify-between p-3 bg-slate-50/50 border border-slate-100 rounded-lg transition-all">
                     <div className="space-y-0.5">
                       <div className="flex items-center gap-1.5">
                          <Label className="text-xs font-bold text-slate-800">Proxied</Label>
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                       </div>
                       <p className="text-[9px] text-slate-400 font-medium leading-none">Route traffic through the edge.</p>
                     </div>
                     <Switch 
                      checked={formData.proxied} 
                      onCheckedChange={(v) => setFormData({...formData, proxied: v})} 
                    />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="bg-white border-t border-slate-100/60 px-5 py-3 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-9">Cancel</Button>
              <Button onClick={handleSaveRecord} disabled={isSubmitting} className="h-9 px-6 bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md rounded-lg">
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : editingRecord ? "Save Changes" : "Save Record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
          setIsImportDialogOpen(open)
          if (!open) {
            setImportFile(null)
            setImportConfirmed(false)
          }
        }}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <DialogTitle className="font-headline font-bold text-xl">Import DNS Records</DialogTitle>
              <p className="text-white/60 text-xs mt-1">Upload a BIND zone file to bulk import records.</p>
            </DialogHeader>
            <div className="p-6 space-y-6">
              <div 
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer",
                  importFile ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary hover:bg-slate-50"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".txt,.zone" 
                  onChange={handleImportFile} 
                />
                <div className="p-4 bg-white rounded-full shadow-sm">
                  <FileText className={cn("w-8 h-8", importFile ? "text-primary" : "text-slate-300")} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-700">
                    {importFile ? importFile.name : "Select a file or drag it here"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Supports BIND Zone Format</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-slate-900">Proxy imported records</Label>
                  <p className="text-[10px] text-slate-400 font-medium">Apply network proxying where supported.</p>
                </div>
                <Switch 
                  checked={proxyAllImported} 
                  onCheckedChange={setProxyAllImported} 
                />
              </div>

              {/* High-fidelity Import Confirmation Block */}
              {importFile && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-amber-900">Review Import Action</p>
                      <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                        Bulk-importing records from <span className="font-bold">{importFile.name}</span> will populate new settings directly to your Cloudflare network edge zone.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 pl-6 mt-1">
                    <input 
                      type="checkbox" 
                      id="confirm-chk"
                      checked={importConfirmed}
                      onChange={(e) => setImportConfirmed(e.target.checked)}
                      className="h-3.5 w-3.5 text-primary border-slate-300 rounded focus:ring-primary cursor-pointer"
                    />
                    <label htmlFor="confirm-chk" className="text-[10px] font-bold text-slate-600 cursor-pointer select-none uppercase tracking-wider">
                      I confirm and authorize this import
                    </label>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
              <Button 
                onClick={processImport} 
                disabled={isSubmitting || !importFile || !importConfirmed} 
                className="px-8 bg-slate-900 hover:bg-black text-white font-bold h-11 shadow-lg shadow-slate-200"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Start Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Premium Deletion Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white animate-in zoom-in duration-300">
            <DialogHeader className="bg-red-600 text-white p-6">
              <DialogTitle className="font-headline font-bold text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 animate-bounce text-white" />
                Confirm DNS Record Deletion
              </DialogTitle>
              <p className="text-red-100 text-xs mt-1">This operation is irreversible and propagates instantly.</p>
            </DialogHeader>
            <div className="p-6 space-y-3">
              <p className="text-sm font-medium text-slate-700 leading-relaxed">
                Are you absolutely sure you want to permanently remove this record from your DNS zone settings? 
                Any traffic routed through this hostname will be interrupted.
              </p>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setIsDeleteOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
              <Button 
                onClick={async () => {
                  if (deletingRecordId) {
                    await handleDeleteRecord(deletingRecordId)
                    setIsDeleteOpen(false)
                    setDeletingRecordId(null)
                  }
                }} 
                className="px-6 bg-red-600 hover:bg-red-700 text-white font-bold h-10 shadow-lg shadow-red-200"
              >
                Confirm Removal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
