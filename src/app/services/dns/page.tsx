"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
  Info,
  Download,
  Upload,
  FileText,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lock,
  Shield,
  History,
  RotateCcw,
  Eye,
  EyeOff,
  MoreVertical,
  ShieldAlert,
  Copy,
  Check,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useUser, useFirestore } from "@/firebase"
import { doc, updateDoc, deleteField } from "firebase/firestore"
import {
  getZoneDetails,
  listDNSRecords,
  createDNSRecord,
  updateDNSRecord,
  deleteDNSRecord,
  createZone,
  verifyAndConnectCloudflareToken,
  disconnectCloudflareToken,
  createZoneSnapshot,
  listZoneSnapshots,
  rollbackZoneSnapshot,
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
    <div className="w-full divide-y divide-slate-100 bg-white">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 py-4 px-6">
          <Skeleton className="h-5 w-12 rounded" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16 hidden md:block" />
          <div className="flex gap-1 shrink-0">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-7 w-7 rounded-lg" />
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

  const { orgs, activeOrg: selectedOrg, loading: isLoadingOrgs } = useActiveOrg()

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
    priority: 10,
  })

  // Validation & confirmation states
  const [formErrors, setFormErrors] = useState<{ name?: string; content?: string; priority?: string }>({})
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  const [importConfirmed, setImportConfirmed] = useState(false)

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [proxyAllImported, setProxyAllImported] = useState(true)

  // BYOT Token state
  const [apiTokenInput, setApiTokenInput] = useState("")
  const [showTokenSecret, setShowTokenSecret] = useState(false)
  const [isConnectingToken, setIsConnectingToken] = useState(false)
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false)
  const [isDisconnectingToken, setIsDisconnectingToken] = useState(false)

  // Snapshots & Safe-Mode Rollback state
  const [isSnapshotsOpen, setIsSnapshotsOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<Array<{ id: string; createdAt: string; reason: string; recordCount: number }>>([])
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false)
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false)
  const [snapshotReason, setSnapshotReason] = useState("")
  const [selectedSnapshotForRollback, setSelectedSnapshotForRollback] = useState<{ id: string; createdAt: string; reason: string; recordCount: number } | null>(null)
  const [isRollbackConfirmOpen, setIsRollbackConfirmOpen] = useState(false)
  const [isRollingBack, setIsRollingBack] = useState(false)

  const [copiedText, setCopiedText] = useState<string | null>(null)

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
        setIsNameserversExpanded(zoneRes.data.status !== "active")
      } else {
        const errMsg = zoneRes.error?.toLowerCase() || ""
        if (
          errMsg.includes("not found") ||
          errMsg.includes("404") ||
          errMsg.includes("1003") ||
          errMsg.includes("403") ||
          errMsg.includes("access denied")
        ) {
          if (selectedOrg?.id) {
            const orgRef = doc(db, "organizations", selectedOrg.id)
            await updateDoc(orgRef, {
              cloudflareZoneId: deleteField(),
              dnsRequested: deleteField(),
            })
            toast({
              title: "Configuration expired",
              description: "The pending domain zone expired. Please reconnect the domain.",
            })
            return
          }
        }
        if (zoneRes.error) {
          throw new Error(zoneRes.error)
        }
      }

      const dnsRes = await listDNSRecords(idToken, orgId, zoneId)
      if (dnsRes.success && dnsRes.data) {
        setRecords(dnsRes.data)
      } else {
        const dnsErrMsg = dnsRes.error?.toLowerCase() || ""
        if (
          dnsErrMsg.includes("403") ||
          dnsErrMsg.includes("access denied") ||
          dnsErrMsg.includes("not found") ||
          dnsErrMsg.includes("404")
        ) {
          if (selectedOrg?.id) {
            const orgRef = doc(db, "organizations", selectedOrg.id)
            await updateDoc(orgRef, {
              cloudflareZoneId: deleteField(),
              dnsRequested: deleteField(),
            })
            toast({
              title: "Configuration expired",
              description: "The domain configuration was removed from the edge network.",
            })
            return
          }
        }
        throw new Error(dnsRes.error)
      }
    } catch (error: any) {
      console.warn("Network sync issue:", error?.message)
      const rawMsg = error?.message || ""
      const isInternalRscError =
        rawMsg.includes("Server Components render") || rawMsg.includes("digest")
      toast({
        variant: "destructive",
        title: "Sync error",
        description: isInternalRscError
          ? "Unable to sync DNS records with edge network."
          : rawMsg || "Could not fetch data from the network edge.",
      })
    } finally {
      setIsLoadingRecords(false)
    }
  }, [zoneId, selectedOrg?.id, user, db, toast])

  useEffect(() => {
    if (zoneId) {
      fetchDNSData()
    } else {
      setRecords([])
      setZoneDetails(null)
    }
  }, [zoneId, fetchDNSData])

  const handleInputChange = (field: string, value: any) => {
    let finalValue: any = value
    if (field === "priority") {
      if (value === "" || value === null || value === undefined) {
        finalValue = undefined
      } else {
        const parsed = parseInt(String(value), 10)
        finalValue = isNaN(parsed) ? undefined : parsed
      }
    }

    const updatedForm = { ...formData, [field]: finalValue }
    setFormData(updatedForm)

    const errors = { ...formErrors }
    delete errors[field as keyof typeof errors]

    if (field === "name") {
      const cleanVal = String(value).trim()
      if (!cleanVal) {
        errors.name = "Record name is required."
      } else if (cleanVal.includes("://")) {
        errors.name = "Name should not contain protocol prefixes (e.g. http://)."
      } else if (/\s/.test(cleanVal)) {
        errors.name = "Name cannot contain spaces."
      }
    }

    if (field === "content") {
      const cleanVal = String(value).trim()
      if (!cleanVal) {
        errors.content = "Value / target content is required."
      } else if (containsMaliciousScript(cleanVal)) {
        errors.content = "Script execution tags are prohibited in DNS records."
      }
    }

    if (field === "priority" && formData.type === "MX") {
      if (finalValue === undefined || finalValue < 0 || finalValue > 65535) {
        errors.priority = "Priority must be a valid integer between 0 and 65535."
      }
    }

    setFormErrors(errors)
  }

  const handleTypeChange = (type: string) => {
    const updatedForm: Partial<DNSRecord> = {
      ...formData,
      type,
      proxied: PROXY_SUPPORTED_TYPES.includes(type) ? formData.proxied : false,
      priority: type === "MX" ? (formData.priority !== undefined ? formData.priority : 10) : undefined,
    }
    setFormData(updatedForm)
  }

  const handleSaveRecord = async () => {
    if (!zoneId || !selectedOrg?.id || !user) return

    const errors: { name?: string; content?: string; priority?: string } = {}
    const cleanName = formData.name?.trim() || ""
    const cleanContent = formData.content?.trim() || ""

    if (!cleanName) {
      errors.name = "Record name is required."
    } else if (cleanName.includes("://")) {
      errors.name = "Name should not contain protocol prefixes (e.g. http://)."
    } else if (/\s/.test(cleanName)) {
      errors.name = "Name cannot contain spaces."
    }

    if (!cleanContent) {
      errors.content = "Record value / target is required."
    } else if (containsMaliciousScript(cleanContent)) {
      errors.content = "Script execution tags are prohibited."
    }

    if (formData.type === "MX") {
      if (formData.priority === undefined || isNaN(Number(formData.priority)) || formData.priority < 0 || formData.priority > 65535) {
        errors.priority = "Priority must be an integer between 0 and 65535."
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id

      if (editingRecord) {
        const res = await updateDNSRecord(idToken, orgId, zoneId, editingRecord.id, formData)
        if (res.success) {
          toast({ title: "Record updated", description: "Changes committed to edge network." })
          setIsDialogOpen(false)
          fetchDNSData()
        } else {
          throw new Error(res.error)
        }
      } else {
        const res = await createDNSRecord(idToken, orgId, zoneId, formData)
        if (res.success) {
          toast({ title: "Record created", description: "Record queued for edge propagation." })
          setIsDialogOpen(false)
          fetchDNSData()
        } else {
          throw new Error(res.error)
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Operation failed",
        description: error.message || "Could not save DNS record.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    if (!zoneId || !selectedOrg?.id || !user) return
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      const res = await deleteDNSRecord(idToken, orgId, zoneId, recordId)
      if (res.success) {
        toast({ title: "Record deleted", description: "Record removed from edge network." })
        fetchDNSData()
      } else {
        throw new Error(res.error)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message || "Could not delete record.",
      })
    }
  }

  const handleRequestDNS = async () => {
    if (!selectedOrg || !user) return
    setIsRequesting(true)
    try {
      const idToken = await user.getIdToken()
      const res = await createZone(idToken, selectedOrg.id, selectedOrg.domain)
      if (res.success) {
        toast({
          title: "DNS initialized",
          description: "Assigned edge nameservers to your domain.",
        })
      } else {
        throw new Error(res.error)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Initialization failed",
        description: error.message || "Could not request DNS edge zone.",
      })
    } finally {
      setIsRequesting(false)
    }
  }

  const handleConnectToken = async () => {
    if (!user || !selectedOrg?.id || !apiTokenInput.trim()) return
    setIsConnectingToken(true)
    try {
      const idToken = await user.getIdToken()
      const res = await verifyAndConnectCloudflareToken(idToken, selectedOrg.id, apiTokenInput.trim())
      if (res.success && res.data) {
        toast({
          title: "Domain connected",
          description: `Connected to Cloudflare zone ${res.data.zoneName}.`,
        })
        setApiTokenInput("")
        fetchDNSData()
      } else {
        throw new Error(res.error)
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Connection failed",
        description: err.message || "Failed to verify Cloudflare API token.",
      })
    } finally {
      setIsConnectingToken(false)
    }
  }

  const handleDisconnectToken = async () => {
    if (!user || !selectedOrg?.id) return
    setIsDisconnectingToken(true)
    try {
      const idToken = await user.getIdToken()
      const res = await disconnectCloudflareToken(idToken, selectedOrg.id)
      if (res.success) {
        toast({
          title: "DNS service disabled",
          description: "Domain credentials and zone connection removed from Revlet.",
        })
        setIsDisableDialogOpen(false)
        setRecords([])
        setZoneDetails(null)
      } else {
        throw new Error(res.error)
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Disable failed",
        description: err.message || "Could not disable DNS service.",
      })
    } finally {
      setIsDisconnectingToken(false)
    }
  }

  const loadSnapshots = async () => {
    if (!user || !selectedOrg?.id) return
    setIsLoadingSnapshots(true)
    try {
      const idToken = await user.getIdToken()
      const res = await listZoneSnapshots(idToken, selectedOrg.id)
      if (res.success && res.data) {
        setSnapshots(res.data)
      }
    } catch (err: any) {
      console.warn("Failed to load snapshots:", err)
    } finally {
      setIsLoadingSnapshots(false)
    }
  }

  const handleCreateSnapshot = async () => {
    if (!user || !selectedOrg?.id || !zoneId) return
    setIsCreatingSnapshot(true)
    try {
      const idToken = await user.getIdToken()
      const res = await createZoneSnapshot(idToken, selectedOrg.id, zoneId, snapshotReason.trim() || "Manual backup snapshot")
      if (res.success && res.data) {
        toast({
          title: "Snapshot created",
          description: `Preserved ${res.data.recordCount} zone records.`,
        })
        setSnapshotReason("")
        loadSnapshots()
      } else {
        throw new Error(res.error)
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Snapshot failed",
        description: err.message || "Could not take snapshot.",
      })
    } finally {
      setIsCreatingSnapshot(false)
    }
  }

  const handleExecuteRollback = async () => {
    if (!user || !selectedOrg?.id || !zoneId || !selectedSnapshotForRollback) return
    setIsRollingBack(true)
    try {
      const idToken = await user.getIdToken()
      const res = await rollbackZoneSnapshot(idToken, selectedOrg.id, zoneId, selectedSnapshotForRollback.id)
      if (res.success && res.data) {
        toast({
          title: "Zone restored",
          description: `Restored ${res.data.restoredCount} records (${res.data.deletedCount} extraneous records cleaned).`,
        })
        setIsRollbackConfirmOpen(false)
        setSelectedSnapshotForRollback(null)
        setIsSnapshotsOpen(false)
        fetchDNSData()
      } else {
        throw new Error(res.error)
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Rollback failed",
        description: err.message || "Failed to rollback zone.",
      })
    } finally {
      setIsRollingBack(false)
    }
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    toast({ title: "Copied to clipboard", description: text })
    setTimeout(() => setCopiedText(null), 2000)
  }

  const handleExportBIND = () => {
    if (!selectedOrg) return
    const content = records
      .map((r) => {
        const ttl = r.ttl === "Auto" ? "1" : r.ttl
        return `${r.name}\t${ttl}\tIN\t${r.type}\t${r.content}`
      })
      .join("\n")

    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${selectedOrg.domain}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({ title: "Export complete", description: "BIND zone file generated." })
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
        const lines = text.split("\n")
        let count = 0

        for (const line of lines) {
          const parts = line.split(/\s+/)
          if (parts.length >= 4) {
            const name = parts[0]
            const type = parts.includes("IN") ? parts[parts.indexOf("IN") + 1] : parts[2]
            const content = parts.slice(parts.indexOf(type) + 1).join(" ")

            if (SUPPORTED_TYPES.includes(type)) {
              const isProxied = proxyAllImported && PROXY_SUPPORTED_TYPES.includes(type)
              await createDNSRecord(idToken, orgId, zoneId, {
                name,
                type,
                content,
                ttl: "Auto",
                proxied: isProxied,
              })
              count++
            }
          }
        }

        toast({ title: "Import complete", description: `Queued ${count} records for propagation.` })
        setIsImportDialogOpen(false)
        setImportFile(null)
        fetchDNSData()
      }
      reader.readAsText(importFile)
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import failed", description: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredRecords = records.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isProxyAllowed = (type: string) => PROXY_SUPPORTED_TYPES.includes(type)

  if (isLoadingOrgs) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Card className="bg-white border-slate-200 shadow-none rounded-xl">
            <CardHeader className="border-b border-slate-100 py-4 px-6">
              <Skeleton className="h-4 w-40" />
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
      <div className="space-y-8 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              DNS management
            </h1>
            <p className="text-sm text-slate-500">
              Authoritative DNS records and edge routing for {selectedOrg?.domain || "your domain"}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selectedOrg && zoneId && (
              <>
                <Button
                  onClick={() => {
                    setEditingRecord(null)
                    setFormData({ type: "A", name: "", content: "", ttl: "Auto", proxied: true, priority: 10 })
                    setIsDialogOpen(true)
                  }}
                  className="h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add record</span>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 bg-white border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-lg">
                    <DropdownMenuItem
                      onClick={() => {
                        loadSnapshots()
                        setIsSnapshotsOpen(true)
                      }}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <History className="w-4 h-4 text-slate-500" />
                      <span>Snapshots and rollback</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setIsImportDialogOpen(true)}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span>Import BIND zone</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleExportBIND}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-slate-500" />
                      <span>Export BIND zone</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setIsDisableDialogOpen(true)}
                      className="gap-2 text-destructive focus:text-destructive focus:bg-red-50 text-xs cursor-pointer"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      <span>Disable DNS service</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {/* STATE 1: No organizations */}
        {orgs.length === 0 ? (
          <Card className="bg-white border-slate-200 border-dashed shadow-none rounded-xl py-12">
            <CardContent className="flex flex-col items-center text-center gap-4 max-w-md mx-auto">
              <div className="p-3 bg-slate-50 rounded-full border border-slate-100 text-slate-400">
                <Globe className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900">No organizations registered</h3>
                <p className="text-xs text-slate-500">
                  Register an organization to manage DNS zones and record routing.
                </p>
              </div>
              <Link href="/account/home">
                <Button className="h-9 px-4 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none">
                  Go to account home
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : selectedOrg && !zoneId ? (
          /* STATE 2: Scoped Cloudflare Authorization / Onboarding */
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                <Shield className="w-3.5 h-3.5 text-slate-500" /> Bring your own Cloudflare token
              </span>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Connect your domain with zero delegation handover
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Retain root domain ownership in your own Cloudflare account. Revlet functions as your high-speed operations console with least-privilege scoping and zero billing access.
              </p>
            </div>

            {/* Token Generation Guide Card */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl">
              <CardHeader className="border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Scoped API authorization
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-mono">
                    Domain: {selectedOrg.domain}
                  </CardDescription>
                </div>
                <a
                  href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22dns%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%5D&name=Revlet+DNS+Manager"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    variant="outline"
                    className="h-9 px-3.5 text-xs font-medium border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5"
                  >
                    <span>Generate token on Cloudflare</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                </a>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-lg bg-slate-50/60 border border-slate-200/80 space-y-1.5">
                    <p className="font-mono text-xs text-slate-500">01. Scoped template</p>
                    <p className="font-medium text-slate-900">Pre-configured permissions</p>
                    <p className="text-slate-500 leading-relaxed">
                      Opens Cloudflare with <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">Zone: DNS (Edit)</code> and <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">Zone: Zone (Read)</code> pre-selected.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50/60 border border-slate-200/80 space-y-1.5">
                    <p className="font-mono text-xs text-slate-500">02. Domain restrict</p>
                    <p className="font-medium text-slate-900">Zone isolation</p>
                    <p className="text-slate-500 leading-relaxed">
                      Under <strong>Zone Resources</strong>, select <span className="text-slate-800">Include → Specific zone → {selectedOrg.domain}</span> to ensure the token cannot access other domains.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50/60 border border-slate-200/80 space-y-1.5">
                    <p className="font-mono text-xs text-slate-500">03. Connect</p>
                    <p className="font-medium text-slate-900">Encrypted token storage</p>
                    <p className="text-slate-500 leading-relaxed">
                      Copy the generated token and paste it below. Credentials are encrypted at rest with AES-256-GCM.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="token" className="text-xs font-medium text-slate-700 flex items-center justify-between">
                    <span>Cloudflare API token</span>
                    <span className="text-slate-400 font-normal">Scoped tokens only</span>
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="token"
                        type={showTokenSecret ? "text" : "password"}
                        placeholder="Paste scoped token"
                        value={apiTokenInput}
                        onChange={(e) => setApiTokenInput(e.target.value)}
                        className="h-10 font-mono text-xs pr-10 border-slate-200 bg-white rounded-lg focus-visible:ring-primary/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokenSecret(!showTokenSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        title={showTokenSecret ? "Hide secret" : "Reveal secret"}
                      >
                        {showTokenSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button
                      onClick={handleConnectToken}
                      disabled={isConnectingToken || !apiTokenInput.trim()}
                      className="h-10 px-5 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none shrink-0 flex items-center gap-2"
                    >
                      {isConnectingToken && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isConnectingToken ? "Verifying scope..." : "Verify and connect"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Architecture Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <Lock className="w-4 h-4 text-slate-500" />
                  <span>Zero billing access</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  Tokens cannot access payment methods, invoices, or non-scoped domains in your Cloudflare account.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-slate-500" />
                  <span>Envelope encryption</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  Tokens are encrypted with AES-256-GCM authenticated cipher prior to storage and never exposed back to the client.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <Globe className="w-4 h-4 text-slate-500" />
                  <span>100% domain ownership</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  No registrar transfer needed. Nameservers remain under your own account with zero root hijack risk.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1">
                <div className="flex items-center gap-2 font-medium text-slate-900">
                  <History className="w-4 h-4 text-slate-500" />
                  <span>Point-in-time snapshots</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  Automatic zone snapshots before modifications allow one-click rollback to prior configurations.
                </p>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleRequestDNS}
                disabled={isRequesting}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                {isRequesting ? "Provisioning..." : "Don't have a Cloudflare account? Provision Revlet managed nameservers"}
              </button>
            </div>
          </div>
        ) : (
          /* STATE 3: Active DNS Workspace */
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Nameservers Card */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl overflow-hidden">
              <CardHeader
                className="bg-slate-50/50 flex flex-row items-center justify-between py-3.5 px-6 cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100"
                onClick={() => setIsNameserversExpanded(!isNameserversExpanded)}
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-xs font-semibold text-slate-700">
                    Network nameservers
                  </CardTitle>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium border",
                      zoneDetails?.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                        : "bg-amber-50 text-amber-700 border-amber-200/60"
                    )}
                  >
                    {zoneDetails?.status ? zoneDetails.status.charAt(0).toUpperCase() + zoneDetails.status.slice(1) : "Pending"}
                  </span>
                  {isNameserversExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </CardHeader>

              {isNameserversExpanded && (
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-slate-500">Assigned nameservers</p>
                      <div className="space-y-2">
                        {(zoneDetails?.nameServers || []).map((ns: string) => (
                          <div
                            key={ns}
                            className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg group hover:border-slate-300 cursor-pointer transition-colors"
                            onClick={() => handleCopyText(ns)}
                          >
                            <code className="text-xs font-mono text-slate-800">{ns}</code>
                            {copiedText === ns ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
                            )}
                          </div>
                        ))}
                        {!zoneDetails?.nameServers?.length && (
                          <p className="text-xs text-slate-400 italic">Nameservers will appear once initialized.</p>
                        )}
                      </div>
                    </div>

                    {selectedOrg?.cloudflareTokenMasked ? (
                      <div className="border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 pl-0 md:pl-6 space-y-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-500">API connection</p>
                          <p className="text-xs text-slate-700">
                            Authenticated via scoped API token on zone <span className="font-mono text-slate-900">{selectedOrg.domain}</span>.
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Masked token</span>
                            <code className="font-mono text-slate-900">{selectedOrg.cloudflareTokenMasked}</code>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Scope</span>
                            <span className="text-emerald-700 font-medium">DNS:Edit, Zone:Read</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 pl-0 md:pl-6 space-y-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-500">Registrar delegation</p>
                          <p className="text-xs text-slate-700">
                            Update your domain registrar to point to the nameservers on the left.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsInstructionsOpen(true)}
                          className="h-8 text-xs border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          <span>View registrar instructions</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Records Table Card */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl">
              <CardHeader className="border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    DNS records
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className="text-xs font-normal tabular-nums text-slate-600 bg-slate-50 border-slate-200 px-2 py-0.5 rounded"
                  >
                    {records.length} {records.length === 1 ? "record" : "records"}
                  </Badge>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search records..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-9 text-xs border-slate-200 bg-white rounded-lg focus-visible:ring-primary/20"
                  />
                </div>
              </CardHeader>

              <CardContent className="p-0 min-h-[180px]">
                <TooltipProvider>
                  {isLoadingRecords ? (
                    <DNSRecordsSkeleton />
                  ) : filteredRecords.length === 0 ? (
                    <div className="py-16 text-center space-y-1.5 px-4">
                      <p className="text-sm font-medium text-slate-700">No DNS records found</p>
                      <p className="text-xs text-slate-400">
                        {searchQuery ? "No records match your query." : "Add a record above to configure routing."}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View */}
                      <div className="hidden md:block">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                              <TableHead className="text-xs font-medium py-3 pl-6 w-[80px] text-slate-500">
                                Type
                              </TableHead>
                              <TableHead className="text-xs font-medium py-3 text-slate-500 w-[180px]">
                                Name
                              </TableHead>
                              <TableHead className="text-xs font-medium py-3 text-slate-500">
                                Value / target
                              </TableHead>
                              <TableHead className="text-xs font-medium py-3 text-slate-500 w-[100px]">
                                TTL
                              </TableHead>
                              <TableHead className="text-xs font-medium py-3 text-slate-500 w-[120px]">
                                <div className="flex items-center gap-1">
                                  <span>Proxy</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">
                                      Proxied traffic passes through the edge security and caching network.
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableHead>
                              <TableHead className="w-[80px] pr-6 text-right text-slate-500">
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRecords.map((rec) => (
                              <TableRow
                                key={rec.id}
                                className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors"
                              >
                                <TableCell className="pl-6 py-3 font-mono text-xs font-semibold text-slate-700">
                                  {rec.type}
                                </TableCell>
                                <TableCell
                                  className="py-3 font-mono text-xs text-slate-900 cursor-pointer hover:text-primary transition-colors"
                                  onClick={() => handleCopyText(rec.name)}
                                  title="Click to copy"
                                >
                                  {rec.name}
                                </TableCell>
                                <TableCell
                                  className="py-3 font-mono text-xs text-slate-600 max-w-md break-all cursor-pointer hover:text-slate-900 transition-colors"
                                  onClick={() => handleCopyText(rec.content)}
                                  title="Click to copy"
                                >
                                  {rec.content}
                                  {rec.priority !== undefined && (
                                    <span className="ml-2 text-[10px] text-slate-400 font-sans">
                                      (priority: {rec.priority})
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="py-3 text-xs text-slate-500 tabular-nums">
                                  {rec.ttl === "Auto" ? "Auto" : `${rec.ttl}s`}
                                </TableCell>
                                <TableCell className="py-3">
                                  {!isProxyAllowed(rec.type) ? (
                                    <span className="text-xs text-slate-300">—</span>
                                  ) : rec.proxied ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                      Proxied
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                      DNS only
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="pr-6 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-slate-400 hover:text-slate-900 transition-colors rounded-lg"
                                      onClick={() => {
                                        setEditingRecord(rec)
                                        setFormData({
                                          ...rec,
                                          priority: rec.priority !== undefined ? Number(rec.priority) : 10,
                                        })
                                        setIsDialogOpen(true)
                                      }}
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-slate-400 hover:text-red-600 transition-colors rounded-lg"
                                      onClick={() => {
                                        setDeletingRecordId(rec.id)
                                        setIsDeleteOpen(true)
                                      }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile List View */}
                      <div className="block md:hidden divide-y divide-slate-100">
                        {filteredRecords.map((rec) => (
                          <div key={rec.id} className="p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-slate-700">
                                  {rec.type}
                                </span>
                                <span
                                  className="font-mono text-xs font-medium text-slate-900"
                                  onClick={() => handleCopyText(rec.name)}
                                >
                                  {rec.name}
                                </span>
                              </div>
                              {isProxyAllowed(rec.type) && (
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded text-[11px] font-medium border",
                                    rec.proxied
                                      ? "bg-amber-50 text-amber-700 border-amber-200/60"
                                      : "bg-slate-50 text-slate-600 border-slate-200"
                                  )}
                                >
                                  {rec.proxied ? "Proxied" : "DNS only"}
                                </span>
                              )}
                            </div>

                            <p
                              className="font-mono text-xs text-slate-600 break-all"
                              onClick={() => handleCopyText(rec.content)}
                            >
                              {rec.content}
                            </p>

                            <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                              <span>TTL: {rec.ttl}</span>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-slate-500"
                                  onClick={() => {
                                    setEditingRecord(rec)
                                    setFormData({
                                      ...rec,
                                      priority: rec.priority !== undefined ? Number(rec.priority) : 10,
                                    })
                                    setIsDialogOpen(true)
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-red-600"
                                  onClick={() => {
                                    setDeletingRecordId(rec.id)
                                    setIsDeleteOpen(true)
                                  }}
                                >
                                  Delete
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

        {/* Instructions Dialog */}
        <Dialog open={isInstructionsOpen} onOpenChange={setIsInstructionsOpen}>
          <DialogContent className="max-w-2xl p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Registrar nameserver setup
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Configure your domain registrar for {selectedOrg?.domain}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 text-xs text-slate-600">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="font-medium text-slate-900">Assigned nameservers</p>
                <div className="space-y-1.5">
                  {(zoneDetails?.nameServers || ["Pending...", "Pending..."]).map((ns: string, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded text-xs font-mono"
                    >
                      <span>{ns}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => handleCopyText(ns)}
                      >
                        Copy
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <p className="leading-relaxed">
                Log into your registrar, open DNS or nameserver management, and replace existing entries with the two assigned nameservers above. Global propagation typically takes 1 to 24 hours.
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button
                onClick={() => setIsInstructionsOpen(false)}
                className="h-9 px-4 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg"
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add / Edit Record Dialog */}
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open)
            if (!open) setFormErrors({})
          }}
        >
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                {editingRecord ? "Edit DNS record" : "Add DNS record"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Zone: {selectedOrg?.domain}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Type</Label>
                <Select value={formData.type} onValueChange={handleTypeChange}>
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white rounded-lg font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg">
                    {SUPPORTED_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs font-mono">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Name</Label>
                <Input
                  placeholder="e.g. @, www, api"
                  className={cn(
                    "h-9 text-sm border-slate-200 rounded-lg focus-visible:ring-primary/20 bg-white font-mono",
                    formErrors.name && "border-red-400"
                  )}
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                />
                {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Value / target</Label>
                <Input
                  placeholder="e.g. 192.0.2.1 or target.domain.com"
                  className={cn(
                    "h-9 text-sm border-slate-200 rounded-lg focus-visible:ring-primary/20 bg-white font-mono",
                    formErrors.content && "border-red-400"
                  )}
                  value={formData.content}
                  onChange={(e) => handleInputChange("content", e.target.value)}
                />
                {formErrors.content && <p className="text-xs text-red-500">{formErrors.content}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {formData.type === "MX" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Priority</Label>
                    <Input
                      type="number"
                      min={0}
                      max={65535}
                      step={1}
                      placeholder="10"
                      className="h-9 text-sm border-slate-200 rounded-lg bg-white"
                      value={formData.priority !== undefined ? formData.priority : ""}
                      onChange={(e) => handleInputChange("priority", e.target.value)}
                    />
                    {formErrors.priority && <p className="text-xs text-red-500">{formErrors.priority}</p>}
                  </div>
                ) : (
                  <div />
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">TTL</Label>
                  <Select value={formData.ttl} onValueChange={(v) => setFormData({ ...formData, ttl: v })}>
                    <SelectTrigger className="h-9 text-xs border-slate-200 bg-white rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      <SelectItem value="Auto" className="text-xs">
                        Auto
                      </SelectItem>
                      <SelectItem value="60" className="text-xs">
                        1 minute
                      </SelectItem>
                      <SelectItem value="300" className="text-xs">
                        5 minutes
                      </SelectItem>
                      <SelectItem value="3600" className="text-xs">
                        1 hour
                      </SelectItem>
                      <SelectItem value="86400" className="text-xs">
                        1 day
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isProxyAllowed(formData.type!) && (
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium text-slate-900">Proxy traffic</Label>
                    <p className="text-xs text-slate-500">Route HTTP/S through edge network.</p>
                  </div>
                  <Switch
                    checked={formData.proxied}
                    onCheckedChange={(v) => setFormData({ ...formData, proxied: v })}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveRecord}
                disabled={isSubmitting}
                className="h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? "Saving..." : editingRecord ? "Save changes" : "Save record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <Dialog
          open={isImportDialogOpen}
          onOpenChange={(open) => {
            setIsImportDialogOpen(open)
            if (!open) {
              setImportFile(null)
              setImportConfirmed(false)
            }
          }}
        >
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Import BIND zone
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Upload a standard zone file to bulk-import DNS records.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div
                className={cn(
                  "border border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors",
                  importFile ? "border-slate-400 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
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
                <FileText className="w-6 h-6 text-slate-400" />
                <p className="text-xs font-medium text-slate-700">
                  {importFile ? importFile.name : "Select or drag a zone file (.txt, .zone)"}
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium text-slate-900">Proxy imported records</Label>
                  <p className="text-xs text-slate-500">Enable proxying on supported types.</p>
                </div>
                <Switch checked={proxyAllImported} onCheckedChange={setProxyAllImported} />
              </div>

              {importFile && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="confirm-chk"
                    checked={importConfirmed}
                    onChange={(e) => setImportConfirmed(e.target.checked)}
                    className="h-3.5 w-3.5 text-primary border-slate-300 rounded cursor-pointer"
                  />
                  <label htmlFor="confirm-chk" className="text-xs text-slate-700 cursor-pointer select-none">
                    I confirm and authorize importing records from this file.
                  </label>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsImportDialogOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={processImport}
                disabled={isSubmitting || !importFile || !importConfirmed}
                className="h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? "Importing..." : "Start import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Delete DNS record
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Are you sure you want to remove this record? Traffic routed through this hostname will be interrupted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-4 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsDeleteOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (deletingRecordId) {
                    await handleDeleteRecord(deletingRecordId)
                    setIsDeleteOpen(false)
                    setDeletingRecordId(null)
                  }
                }}
                variant="destructive"
                className="h-9 px-4 text-xs font-medium rounded-lg shadow-none"
              >
                Delete record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Snapshots & Rollback Dialog */}
        <Dialog open={isSnapshotsOpen} onOpenChange={setIsSnapshotsOpen}>
          <DialogContent className="max-w-2xl p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                Zone snapshots and rollback
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Point-in-time state backups for {selectedOrg?.domain}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-slate-700">Instant zone snapshot</Label>
                  <span className="text-xs text-slate-400 tabular-nums">
                    Captures all {records.length} records
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Snapshot label (e.g. Pre-migration backup)"
                    value={snapshotReason}
                    onChange={(e) => setSnapshotReason(e.target.value)}
                    className="h-9 text-xs bg-white border-slate-200 rounded-lg"
                  />
                  <Button
                    onClick={handleCreateSnapshot}
                    disabled={isCreatingSnapshot}
                    className="h-9 px-3 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none shrink-0 flex items-center gap-1.5"
                  >
                    {isCreatingSnapshot && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Take snapshot</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">Historical snapshots</p>
                {isLoadingSnapshots ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading snapshots...</div>
                ) : snapshots.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    No historical snapshots recorded yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                    {snapshots.map((snap) => (
                      <div key={snap.id} className="p-3 flex items-center justify-between gap-4 text-xs">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 truncate">{snap.reason}</span>
                            <span className="text-slate-400 tabular-nums">({snap.recordCount} records)</span>
                          </div>
                          <p className="text-slate-400 tabular-nums">
                            {snap.createdAt ? new Date(snap.createdAt).toLocaleString() : "Snapshot"}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSnapshotForRollback(snap)
                            setIsRollbackConfirmOpen(true)
                          }}
                          className="h-7 text-xs border-slate-200 rounded-lg flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Rollback</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="ghost"
                onClick={() => setIsSnapshotsOpen(false)}
                className="h-9 text-xs"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rollback Confirmation Dialog */}
        <Dialog open={isRollbackConfirmOpen} onOpenChange={setIsRollbackConfirmOpen}>
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Confirm zone rollback
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Restores live DNS records to match &ldquo;{selectedSnapshotForRollback?.reason}&rdquo;.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 text-xs text-slate-600 leading-relaxed">
              This will restore the {selectedSnapshotForRollback?.recordCount} records saved in this snapshot. Extraneous records created since will be removed.
            </div>
            <DialogFooter className="pt-4 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsRollbackConfirmOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleExecuteRollback}
                disabled={isRollingBack}
                className="h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isRollingBack && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isRollingBack ? "Rolling back..." : "Confirm rollback"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Disable DNS Service Dialog */}
        <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Disable DNS service
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Disconnects {selectedOrg?.domain} and clears stored credentials.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 text-xs text-slate-600 leading-relaxed">
              Records and nameservers in your own Cloudflare account will remain intact. Revlet will simply remove its local management link.
            </div>
            <DialogFooter className="pt-4 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsDisableDialogOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDisconnectToken}
                disabled={isDisconnectingToken}
                variant="destructive"
                className="h-9 px-4 text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isDisconnectingToken && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isDisconnectingToken ? "Disabling..." : "Disable service"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
