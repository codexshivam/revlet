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
  X,
  ArrowRight,
  ChevronDown,
  ChevronUp
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
import { collection, query, where, onSnapshot, doc, updateDoc, deleteField } from "firebase/firestore"
import { 
  getZoneDetails, 
  listDNSRecords, 
  createDNSRecord, 
  updateDNSRecord, 
  deleteDNSRecord,
  createZone
} from "@/app/actions/cloudflare-dns"
import Link from "next/link"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { useActiveOrg } from "@/hooks/use-active-org"
import { Skeleton } from "@/components/ui/skeleton"
import { containsMaliciousScript } from "@/lib/security/sanitize"

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

function DNSRecordsSkeleton() {
  return (
    <div className="w-full divide-y divide-slate-100 animate-pulse bg-white">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-6 py-5 px-6">
          {/* Record Type Badge skeleton */}
          <div className="h-5 w-14 bg-slate-200 rounded shrink-0" />
          
          {/* Record Name skeleton */}
          <div className="h-4 w-40 bg-slate-150 rounded shrink-0" />
          
          {/* Record Value Target skeleton */}
          <div className="flex-1 min-w-0">
            <div className="h-4 w-[60%] bg-slate-100 rounded" />
          </div>
          
          {/* Proxied toggle skeleton */}
          <div className="h-4 w-12 bg-slate-100 rounded hidden md:block shrink-0" />
          
          {/* Actions skeleton */}
          <div className="flex justify-end gap-1.5 shrink-0">
            <div className="h-8 w-8 bg-slate-100 rounded-md" />
            <div className="h-8 w-8 bg-slate-100 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
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
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false)
  const [isNameserversExpanded, setIsNameserversExpanded] = useState(true)
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
    if (!zoneId || !selectedOrg?.id || !user) return
    setIsLoadingRecords(true)
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      const zoneRes = await getZoneDetails(idToken, orgId, zoneId)
      if (zoneRes.success && zoneRes.data) {
        setZoneDetails(zoneRes.data)
        // Auto-collapse if active
        setIsNameserversExpanded(zoneRes.data.status !== 'active')
      } else {
        // If Cloudflare auto-deleted the zone after 28 days of inactivity (or manual deletion)
        const errMsg = zoneRes.error?.toLowerCase() || "";
        if (errMsg.includes("not found") || errMsg.includes("404") || errMsg.includes("1003") || errMsg.includes("403") || errMsg.includes("access denied")) {
          if (selectedOrg?.id) {
            const orgRef = doc(db, "organizations", selectedOrg.id)
            await updateDoc(orgRef, {
              cloudflareZoneId: deleteField(),
              dnsRequested: deleteField()
            })
            toast({ 
              title: "Configuration Expired", 
              description: "The pending domain configuration expired and was removed by the network. Please connect the domain again." 
            })
            return // Stop execution
          }
        }
      }
      
      const dnsRes = await listDNSRecords(idToken, orgId, zoneId)
      if (dnsRes.success && dnsRes.data) {
        setRecords(dnsRes.data)
      } else {
        const dnsErrMsg = dnsRes.error?.toLowerCase() || "";
        if (dnsErrMsg.includes("403") || dnsErrMsg.includes("access denied") || dnsErrMsg.includes("not found") || dnsErrMsg.includes("404")) {
          if (selectedOrg?.id) {
            const orgRef = doc(db, "organizations", selectedOrg.id)
            await updateDoc(orgRef, {
              cloudflareZoneId: deleteField(),
              dnsRequested: deleteField()
            })
            toast({ 
              title: "Configuration Expired", 
              description: "The domain configuration was removed from the edge network." 
            })
            return // Stop execution
          }
        }
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
    } else if (containsMaliciousScript(nameVal)) {
      errors.name = "Record name cannot contain script tags or executable characters."
    }

    const contentVal = formData.content.trim()
    if (containsMaliciousScript(contentVal)) {
      errors.content = "Record content cannot contain executable script tags or event handlers."
    }
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

    if (!user || !selectedOrg?.id || !zoneId) {
      toast({
        variant: "destructive",
        title: "Session Required",
        description: "User session or organization is not available."
      })
      return
    }

    setIsSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      let res;
      if (editingRecord) {
        res = await updateDNSRecord(idToken, orgId, zoneId, editingRecord.id, formData)
      } else {
        res = await createDNSRecord(idToken, orgId, zoneId, formData)
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
    if (!zoneId || !selectedOrg?.id || !user) return

    try {
      const idToken = await user.getIdToken()
      const res = await deleteDNSRecord(idToken, selectedOrg.id, zoneId, id)
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
    if (!selectedOrg || !user) return
    setIsRequesting(true)
    
    try {
      const idToken = await user.getIdToken()
      // Provision domain directly
      const zoneRes = await createZone(idToken, selectedOrg.id, selectedOrg.domain)
      if (!zoneRes.success || !zoneRes.data) {
        throw new Error(zoneRes.error)
      }

      // Update organization with the newly created Zone ID
      const orgRef = doc(db, "organizations", selectedOrg.id)
      await updateDoc(orgRef, {
        cloudflareZoneId: zoneRes.data.id,
        dnsRequested: true
      })
      
      toast({
        title: "Domain Connected",
        description: `Successfully provisioned ${selectedOrg.domain}. Please update your registrar.`,
      })
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Connection Failed",
        description: error.message || "Could not connect domain at this time."
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
    if (!importFile || !zoneId || !selectedOrg?.id || !user) return
    setIsSubmitting(true)
    
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
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
              await createDNSRecord(idToken, orgId, zoneId, {
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
      }
      reader.readAsText(importFile)
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import Failed", description: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredRecords = records.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    r.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isProxyAllowed = (type: string) => PROXY_SUPPORTED_TYPES.includes(type)

  if (isLoadingOrgs) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-64 mt-1" />
          </div>
          
          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-4 sm:px-6">
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
                <div className="space-y-4 md:pl-8 border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-full max-w-sm" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-4 sm:px-6">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-full sm:w-48" />
            </CardHeader>
            <CardContent className="p-0">
              <DNSRecordsSkeleton />
            </CardContent>
          </Card>
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
            <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 shrink-0">
               {zoneId && (
                 <div className="flex flex-wrap gap-2 w-full sm:w-auto">
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
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm rounded-xl">
              <CardContent className="p-8 sm:p-16 flex flex-col items-center text-center gap-6">
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
        ) : selectedOrg && !zoneId ? (
          <div className="max-w-5xl mx-auto py-12 animate-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-12 text-center">
              <div className="space-y-4">
                <h2 className="text-4xl font-headline font-bold text-slate-900 leading-tight">
                  Premium Domain Infrastructure
                </h2>
                <p className="text-slate-500 text-lg leading-relaxed max-w-2xl mx-auto">
                  Unlock advanced security, ultra-fast propagation, and centralized management by activating your organization&apos;s global network context.
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
                  className="font-bold px-12 h-14 shadow-xl shadow-primary/20 text-lg group w-full sm:w-auto"
                >
                  {isRequesting ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <Globe className="w-5 h-5 mr-3 group-hover:rotate-12 transition-transform" />}
                  Activate Global Network
                </Button>
              </div>
            </div>
          </div>
        ) : selectedOrg && zoneId && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
              <CardHeader 
                className={cn(
                  "bg-slate-50/50 flex flex-row items-center justify-between py-4 px-4 sm:px-6 cursor-pointer hover:bg-slate-50 transition-colors",
                  isNameserversExpanded ? "border-b border-slate-100" : ""
                )}
                onClick={() => setIsNameserversExpanded(!isNameserversExpanded)}
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Network Nameservers</CardTitle>
                </div>
                <div className="flex items-center gap-4">
                  <Badge className={cn(
                     "text-[9px] font-bold px-2 py-0.5 border shadow-none",
                     zoneDetails?.status === 'active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                  )}>
                    {zoneDetails?.status?.toUpperCase() || "PENDING"}
                  </Badge>
                  {isNameserversExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </CardHeader>
              
              <div 
                className={cn(
                  "grid transition-all duration-300 ease-in-out",
                  isNameserversExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <CardContent className="p-4 sm:p-6">
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
                     <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 pl-0 md:pl-8 space-y-5">
                        <div className="space-y-2">
                          {zoneDetails?.status !== 'active' && (
                            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100 text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                              </span>
                              Action Required
                            </div>
                          )}
                          <h4 className="text-base font-headline font-bold text-slate-900">Configure Registrar</h4>
                          <p className="text-xs text-slate-500 leading-relaxed font-medium">
                            Your edge network is ready. Complete the setup by pointing your domain registrar to our global nameservers.
                          </p>
                        </div>
                        
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                          <Button 
                            className="w-full justify-between font-bold text-xs bg-white border border-slate-200 h-11 hover:border-blue-200 hover:bg-blue-50 text-slate-700 hover:text-blue-700 transition-all group shadow-sm rounded-lg"
                            onClick={() => setIsInstructionsOpen(true)}
                          >
                            <span className="flex items-center gap-2.5 overflow-hidden">
                              <div className="p-1.5 bg-slate-100 rounded-md group-hover:bg-blue-100 transition-colors shrink-0">
                                <FileText className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-600" />
                              </div>
                              <span className="truncate max-w-[130px] sm:max-w-none text-left">Setup Instructions</span>
                            </span>
                            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 group-hover:text-blue-500 shrink-0">
                              Start <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </Button>
                          <div className="flex gap-2.5 items-start">
                            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                              DNS propagation typically takes 1-2 hours depending on your registrar.
                            </p>
                          </div>
                        </div>
                     </div>
                   </div>
                  </CardContent>
                </div>
              </div>
            </Card>

            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-4 sm:px-6">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DNS Records</CardTitle>
                  <Badge variant="outline" className="text-[9px] font-bold h-5 px-1.5 bg-white border-slate-200">{records.length}</Badge>
                </div>
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input 
                    placeholder="Search records..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs w-full sm:w-48 bg-white border-slate-200 font-medium" 
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <TooltipProvider>
                  {isLoadingRecords ? (
                    <DNSRecordsSkeleton />
                  ) : filteredRecords.length === 0 ? (
                    <div className="p-24 text-center space-y-3">
                      <AlertCircle className="w-8 h-8 text-slate-100 mx-auto" />
                      <p className="text-sm font-bold text-slate-400">No active DNS records found.</p>
                    </div>
                  ) : (
                    <>
                      {/* DESKTOP TABLE VIEW */}
                      <div className="hidden md:block">
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
                      </div>

                      {/* MOBILE RESPONSIVE CARD LIST VIEW */}
                      <div className="block md:hidden space-y-6 py-6 px-4">
                        {filteredRecords.map((rec) => (
                          <div 
                            key={rec.id}
                            className="bg-white border border-slate-200 rounded-xl p-6 relative overflow-hidden transition-all shadow-sm flex flex-col gap-4"
                          >
                            {/* Left status color indicator strip based on record type */}
                            <div 
                              className={cn(
                                "absolute left-0 top-0 bottom-0 w-[5px]",
                                rec.type === "A" || rec.type === "AAAA" ? "bg-blue-500" :
                                rec.type === "CNAME" ? "bg-emerald-500" :
                                rec.type === "MX" ? "bg-amber-500" : "bg-slate-400"
                              )}
                            />

                            {/* Top Row: Type Badge & Proxy indicator */}
                            <div className="flex items-start justify-between gap-3">
                              <Badge className={cn(
                                "font-mono text-[9px] font-bold px-2.5 py-0.5 h-6 border shadow-none uppercase tracking-wider",
                                rec.type === "A" ? "bg-blue-50 text-blue-600 border-blue-100" :
                                rec.type === "MX" ? "bg-amber-50 text-amber-600 border-amber-100" :
                                rec.type === "TXT" ? "bg-slate-50 text-slate-500 border-slate-200" :
                                "bg-emerald-50 text-emerald-600 border-emerald-100"
                              )}>
                                {rec.type}
                              </Badge>

                              {/* Proxy badge */}
                              {!isProxyAllowed(rec.type) ? (
                                <span className="text-[10px] text-slate-300 font-bold">—</span>
                              ) : rec.proxied ? (
                                <div className="flex items-center gap-1 text-amber-500 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5 h-6">
                                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-[8px] font-bold uppercase tracking-wider">Proxied</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5 h-6">
                                  <Globe className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-[8px] font-bold uppercase tracking-wider">DNS Only</span>
                                </div>
                              )}
                            </div>

                            {/* Middle details: Name and Target Value */}
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider leading-none">Name</p>
                                <p 
                                  className="font-bold text-slate-800 text-sm break-all leading-snug hover:underline cursor-pointer"
                                  onClick={() => handleCopyText(rec.name)}
                                >
                                  {rec.name}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider leading-none">Value / Target</p>
                                <p 
                                  className="font-mono text-xs text-slate-500 break-all leading-relaxed whitespace-pre-wrap hover:underline cursor-pointer"
                                  onClick={() => handleCopyText(rec.content)}
                                >
                                  {rec.content}
                                </p>
                                {rec.priority !== undefined && (
                                  <span className="inline-block text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 mt-1">
                                    Priority: {rec.priority}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Bottom Row: Actions */}
                            <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                              <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">TTL: {rec.ttl === "Auto" ? "Auto" : rec.ttl}</span>
                              <div className="flex gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-slate-400 hover:bg-primary hover:text-white transition-all rounded-lg"
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
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-slate-400 hover:bg-destructive hover:text-white transition-all rounded-lg"
                                  onClick={() => {
                                    setDeletingRecordId(rec.id)
                                    setIsDeleteOpen(true)
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </TooltipProvider>
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={isInstructionsOpen} onOpenChange={setIsInstructionsOpen}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden border border-slate-200 shadow-xl bg-white rounded-xl">
            <DialogHeader className="bg-white px-8 py-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <DialogTitle className="font-headline font-bold text-xl text-slate-900">
                  Domain Configuration Guide
                </DialogTitle>
                <div className="text-sm font-medium text-slate-500">
                  Setting up <strong className="text-slate-900">{selectedOrg?.domain}</strong>
                </div>
              </div>
            </DialogHeader>
            <div className="px-8 py-8 bg-white max-h-[70vh] overflow-y-auto">
              {selectedOrg?.domain?.endsWith('.np') ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 1</div>
                      <h4 className="text-sm font-bold text-slate-900">Access Registry</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Go to <a href="https://register.com.np" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">register.com.np</a> and log in.
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 2</div>
                      <h4 className="text-sm font-bold text-slate-900">Select Domain</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Click on <strong>{selectedOrg?.domain}</strong> and find <strong>Name Servers</strong>.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 3</div>
                      <h4 className="text-sm font-bold text-slate-900">Update Servers</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Replace existing entries with edge nameservers. Leave IPs blank.
                      </p>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                    <h4 className="text-sm font-bold text-slate-900 mb-4">Assigned Edge Nameservers</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(zoneDetails?.nameServers || ['Pending...', 'Pending...']).map((ns: string, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{i === 0 ? "Primary" : "Secondary"}</div>
                            <code className="text-sm font-mono font-bold text-slate-800">{ns}</code>
                          </div>
                          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-bold" onClick={() => handleCopyText(ns)}>Copy</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="text-sm text-slate-500 bg-amber-50/50 p-4 rounded-lg border border-amber-100/50">
                    <strong>Note:</strong> Mercantile propagation takes 12-24 hours.
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 1</div>
                      <h4 className="text-sm font-bold text-slate-900">Log into Registrar</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Sign into where you purchased <strong>{selectedOrg?.domain}</strong>.
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 2</div>
                      <h4 className="text-sm font-bold text-slate-900">Find DNS Settings</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Navigate to Custom Nameservers for your domain.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 3</div>
                      <h4 className="text-sm font-bold text-slate-900">Replace Servers</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Use exclusively the nameservers provided below.
                      </p>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                    <h4 className="text-sm font-bold text-slate-900 mb-4">Assigned Edge Nameservers</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(zoneDetails?.nameServers || ['Pending...', 'Pending...']).map((ns: string, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{i === 0 ? "Primary" : "Secondary"}</div>
                            <code className="text-sm font-mono font-bold text-slate-800">{ns}</code>
                          </div>
                          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs font-bold" onClick={() => handleCopyText(ns)}>Copy</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="text-sm text-slate-500 bg-blue-50/50 p-4 rounded-lg border border-blue-100/50">
                    <strong>Propagation Time:</strong> Typically 1-2 hours, up to 24 hours depending on registrar.
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="px-8 py-4 bg-white border-t border-slate-100">
              <Button onClick={() => setIsInstructionsOpen(false)} className="w-full sm:w-auto font-bold bg-slate-900 hover:bg-black text-white px-8">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
