"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  Loader2,
  Server,
  Globe,
  AlertCircle,
  Info,
  Download,
  Upload,
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  History,
  RotateCcw,
  Eye,
  EyeOff,
  MoreVertical,
  ShieldAlert,
  Copy,
  Check,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { buildOrgRoute } from "@/lib/org-routes"
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
  verifyDnsTokenPermissions,
  createZoneSnapshot,
  listZoneSnapshots,
  rollbackZoneSnapshot,
  importZoneFileRecords,
} from "@/app/actions/dns-service"

const StepUpMfaDialog = dynamic(
  () => import("@/components/security/step-up-mfa-dialog").then((m) => m.StepUpMfaDialog),
  { ssr: false }
)
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useActiveOrg } from "@/hooks/use-active-org"
import { Skeleton } from "@/components/ui/skeleton"
import { containsMaliciousScript } from "@/lib/security/sanitize"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyOrgState } from "@/components/services/empty-org-state"
import { ServiceActivationCard } from "@/components/services/service-activation-card"
import { TablePagination } from "@/components/ui/table-pagination"

const SUPPORTED_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
  "CAA",
  "PTR",
  "SPF",
  "TLSA",
  "HTTPS",
  "SVCB",
  "URI",
  "LOC",
  "NAPTR",
]
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
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>("ALL")
  const [mobileDetailRecord, setMobileDetailRecord] = useState<DNSRecord | null>(null)
  const [isReviewingRecord, setIsReviewingRecord] = useState(false)
  const toastRef = useRef(toast)
  toastRef.current = toast
  const userRef = useRef(user)
  userRef.current = user
  const fetchSeqRef = useRef(0)

  const zoneId = selectedOrg?.cloudflareZoneId
  const orgId = selectedOrg?.id
  const userId = user?.uid

  // Effective caller DNS permissions (UI gating; Server Actions independently enforce the same)
  const isOwner = Boolean(selectedOrg && user && selectedOrg.ownerId === user.uid)
  const callerEmailKey = (user?.email || "").toLowerCase().trim().replace(/\./g, "__DOT__")
  const callerPerms: string[] = isOwner
    ? ["*"]
    : Array.isArray(selectedOrg?.memberPermissions?.[callerEmailKey])
    ? selectedOrg.memberPermissions[callerEmailKey]
    : []
  const canAdminDns =
    isOwner || callerPerms.includes("*") || callerPerms.includes("Org: Admin") || callerPerms.includes("DNS: Admin")
  const canEditDns = canAdminDns || callerPerms.includes("DNS: Edit")
  const isViewOnly = Boolean(selectedOrg && user && !canEditDns)

  const fetchDNSData = useCallback(async () => {
    const currentUser = userRef.current
    if (!zoneId || !orgId || !currentUser) return
    const seq = ++fetchSeqRef.current
    setIsLoadingRecords(true)
    setConnectionError(null)
    try {
      const idToken = await currentUser.getIdToken()
      if (seq !== fetchSeqRef.current) return

      // Background token permission check
      verifyDnsTokenPermissions(idToken, orgId, zoneId)
        .then((permRes) => {
          if (seq !== fetchSeqRef.current) return
          if (permRes.success && permRes.data && !permRes.data.valid) {
            setPermissionWarning(
              permRes.data.message || "Required DNS permissions are missing or invalid. Actions are disabled."
            )
          } else {
            setPermissionWarning(null)
          }
        })
        .catch(() => {})
      const zoneRes = await getZoneDetails(idToken, orgId, zoneId)
      if (seq !== fetchSeqRef.current) return
      if (zoneRes.success && zoneRes.data) {
        setZoneDetails(zoneRes.data)
        setIsNameserversExpanded(zoneRes.data.status !== "active")
      } else {
        // Preserve the zone binding on read failure and surface a clear Connection needs attention state
        setConnectionError(
          zoneRes.error || "Unable to read zone details from Cloudflare. Your binding has been preserved for investigation."
        )
        return
      }

      const dnsRes = await listDNSRecords(idToken, orgId, zoneId)
      if (seq !== fetchSeqRef.current) return
      if (dnsRes.success && dnsRes.data) {
        setRecords(dnsRes.data)
      } else {
        setConnectionError(
          dnsRes.error || "Unable to load DNS records from Cloudflare. Your binding has been preserved."
        )
        return
      }
    } catch (error: any) {
      if (seq !== fetchSeqRef.current) return
      console.warn("Network sync issue:", error?.message)
      const rawMsg = error?.message || ""
      const isInternalRscError =
        rawMsg.includes("Server Components render") || rawMsg.includes("digest")
      setConnectionError(
        isInternalRscError
          ? "Unable to sync DNS records with edge network."
          : rawMsg || "Could not fetch data from the network edge."
      )
    } finally {
      if (seq === fetchSeqRef.current) {
        setIsLoadingRecords(false)
      }
    }
  }, [zoneId, orgId])

  useEffect(() => {
    if (zoneId && orgId && userId) {
      fetchDNSData()
    } else {
      setRecords([])
      setZoneDetails(null)
      setPermissionWarning(null)
    }
  }, [zoneId, orgId, userId, fetchDNSData])

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

  const validateForm = () => {
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

    if (formData.type === "MX" || formData.type === "SRV") {
      if (
        formData.priority === undefined ||
        isNaN(Number(formData.priority)) ||
        formData.priority < 0 ||
        formData.priority > 65535
      ) {
        errors.priority = "Priority must be an integer between 0 and 65535."
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSaveRecord = async () => {
    if (!zoneId || !selectedOrg?.id || !user) return
    if (!validateForm()) return
    const cleanName = formData.name?.trim() || ""
    const cleanContent = formData.content?.trim() || ""

    setIsSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id

      if (editingRecord) {
        const res = await updateDNSRecord(idToken, orgId, zoneId, editingRecord.id, formData, {
          type: editingRecord.type,
          name: editingRecord.name,
          content: editingRecord.content,
          ttl: editingRecord.ttl,
          proxied: editingRecord.proxied,
          priority: editingRecord.priority,
        })
        if (res.success) {
          toast({ title: "Applied at provider", description: "Changes accepted by Cloudflare; DNS propagation in progress." })
          setIsDialogOpen(false)
          setIsReviewingRecord(false)
          fetchDNSData()
        } else {
          throw new Error(res.error)
        }
      } else {
        const res = await createDNSRecord(idToken, orgId, zoneId, formData)
        if (res.success) {
          toast({ title: "Applied at provider", description: "Record accepted by Cloudflare; DNS propagation in progress." })
          setIsDialogOpen(false)
          setIsReviewingRecord(false)
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
      if (res.success && res.data?.id) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("revlet-orgs-refresh"))
        }
        toast({
          title: "DNS management activated",
          description: "Assigned managed nameservers to your domain.",
        })
      } else {
        throw new Error(res.error)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Activation failed",
        description: error.message || "Could not activate managed DNS service.",
      })
    } finally {
      setIsRequesting(false)
    }
  }

  const [pendingMfaAction, setPendingMfaAction] = useState<
    null | { type: "connect" | "disconnect" | "import" | "rollback"; label: string }
  >(null)

  const handleConnectToken = async (stepUpToken?: string) => {
    if (!user || !selectedOrg?.id || !apiTokenInput.trim()) return
    setIsConnectingToken(true)
    try {
      const idToken = await user.getIdToken()
      const res = await verifyAndConnectCloudflareToken(
        idToken,
        selectedOrg.id,
        apiTokenInput.trim(),
        stepUpToken
      )
      if (!res.success && typeof res.error === "string" && res.error.includes("MFA_STEP_UP_REQUIRED")) {
        setPendingMfaAction({ type: "connect", label: "connect a Cloudflare API token" })
        setIsRollbackMfaOpen(true)
        return
      }
      if (res.success && res.data) {
        toast({
          title: "DNS management activated",
          description: `Connected domain ${res.data.zoneName}.`,
        })
        setApiTokenInput("")
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("revlet-orgs-refresh"))
        }
        fetchDNSData()
      } else {
        throw new Error(res.error)
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: err.message || "Failed to verify access permissions.",
      })
    } finally {
      setIsConnectingToken(false)
    }
  }

  const handleDisconnectToken = async (stepUpToken?: string) => {
    if (!user || !selectedOrg?.id) return
    setIsDisconnectingToken(true)
    try {
      const idToken = await user.getIdToken()
      const res = await disconnectCloudflareToken(idToken, selectedOrg.id, stepUpToken)
      if (!res.success && typeof res.error === "string" && res.error.includes("MFA_STEP_UP_REQUIRED")) {
        setPendingMfaAction({ type: "disconnect", label: "disconnect DNS management" })
        setIsRollbackMfaOpen(true)
        return
      }
      if (res.success) {
        toast({
          title: "DNS service disconnected",
          description: "Credentials and zone bindings removed; snapshot history preserved.",
        })
        setIsDisableDialogOpen(false)
        setRecords([])
        setZoneDetails(null)
        setPermissionWarning(null)
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("revlet-orgs-refresh"))
        }
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

  const [isRollbackMfaOpen, setIsRollbackMfaOpen] = useState(false)

  const handleExecuteRollback = async (stepUpToken?: string) => {
    if (!user || !selectedOrg?.id || !zoneId || !selectedSnapshotForRollback) return
    setIsRollingBack(true)
    try {
      const idToken = await user.getIdToken()
      const res = await rollbackZoneSnapshot(
        idToken,
        selectedOrg.id,
        zoneId,
        selectedSnapshotForRollback.id,
        stepUpToken
      )
      if (!res.success && typeof res.error === "string" && res.error.includes("MFA_STEP_UP_REQUIRED")) {
        setPendingMfaAction({ type: "rollback", label: "restore a DNS zone snapshot" })
        setIsRollbackMfaOpen(true)
        return
      }
      if (res.success && res.data) {
        toast({
          title: "Applied at provider",
          description: `Restored ${res.data.restoredCount} records (${res.data.deletedCount} divergent removed). DNS propagation in progress.`,
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

  const processImport = async (stepUpToken?: string) => {
    if (!importFile || !zoneId || !selectedOrg?.id || !user) return
    setIsSubmitting(true)

    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      const text = await importFile.text()
      const res = await importZoneFileRecords(idToken, orgId, zoneId, text, proxyAllImported, stepUpToken)

      if (!res.success && typeof res.error === "string" && res.error.includes("MFA_STEP_UP_REQUIRED")) {
        setPendingMfaAction({ type: "import", label: "import a DNS zone file" })
        setIsRollbackMfaOpen(true)
        return
      }

      if (!res.success && !res.data?.created) {
        throw new Error(res.error || "Could not import records from zone file.")
      }

      const created = res.data?.created || 0
      const failed = res.data?.failed || 0
      toast({
        variant: failed > 0 && created === 0 ? "destructive" : "default",
        title: failed > 0 ? "Import completed with warnings" : "Import complete",
        description:
          failed > 0
            ? `Created ${created} records; ${failed} rejected by provider.`
            : `Verified and created ${created} DNS records.`,
      })
      setIsImportDialogOpen(false)
      setImportFile(null)
      fetchDNSData()
    } catch (err: any) {
      toast({ variant: "destructive", title: "Import failed", description: err.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const [recordsPage, setRecordsPage] = useState(1)
  const [recordsPageSize, setRecordsPageSize] = useState(25)

  const filteredRecords = records.filter((r) => {
    const q = searchQuery.trim().toLowerCase()
    const matchesSearch =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    if (!matchesSearch) return false
    if (typeFilter !== "ALL" && r.type !== typeFilter) return false
    return true
  })

  const availableRecordTypes = Array.from(new Set(records.map((r) => r.type))).sort()

  useEffect(() => {
    setRecordsPage(1)
  }, [searchQuery, typeFilter, selectedOrg?.id])

  const resolvePreviewHostname = (rawName: string | undefined, domain: string | undefined) => {
    const cleanDomain = (domain || "").trim().replace(/\.$/, "")
    const cleanName = (rawName || "").trim().replace(/\.$/, "")
    if (!cleanDomain) return cleanName || "@"
    if (!cleanName || cleanName === "@") return cleanDomain
    if (cleanName.toLowerCase() === cleanDomain.toLowerCase() || cleanName.toLowerCase().endsWith(`.${cleanDomain.toLowerCase()}`)) {
      return cleanName
    }
    return `${cleanName}.${cleanDomain}`
  }

  const totalRecordPages = Math.max(1, Math.ceil(filteredRecords.length / recordsPageSize))
  const safeRecordsPage = Math.min(recordsPage, totalRecordPages)
  const paginatedRecords = filteredRecords.slice(
    (safeRecordsPage - 1) * recordsPageSize,
    safeRecordsPage * recordsPageSize
  )

  const isProxyAllowed = (type: string) => PROXY_SUPPORTED_TYPES.includes(type)

  if (isLoadingOrgs && orgs.length === 0) {
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
        <PageHeader
          title="DNS Management"
          description={
            selectedOrg ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-700">{selectedOrg.domain}</span>
                {isViewOnly && (
                  <Badge variant="outline" className="text-[11px] font-medium bg-slate-100 text-slate-700 border-slate-300">
                    View only
                  </Badge>
                )}
              </span>
            ) : undefined
          }
          actions={
            selectedOrg && zoneId ? (
              <>
                {canAdminDns && (
                  <Button
                    asChild
                    variant="outline"
                    className="h-9 px-3 bg-white border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg shadow-none hidden sm:inline-flex items-center gap-1.5"
                  >
                    <Link
                      href={`${buildOrgRoute("team")}?inviteOrg=${encodeURIComponent(selectedOrg.id)}&preset=dns-viewer`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Invite member</span>
                    </Link>
                  </Button>
                )}

                {canEditDns && (
                  <Button
                    disabled={Boolean(permissionWarning)}
                    onClick={() => {
                      setEditingRecord(null)
                      setIsReviewingRecord(false)
                      setFormData({ type: "A", name: "", content: "", ttl: "Auto", proxied: true, priority: 10 })
                      setIsDialogOpen(true)
                    }}
                    className="h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Record</span>
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="DNS zone actions"
                      className="h-9 w-9 bg-white border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-lg p-1">
                    <DropdownMenuItem
                      disabled={Boolean(permissionWarning)}
                      onClick={() => {
                        loadSnapshots()
                        setIsSnapshotsOpen(true)
                      }}
                      className="group gap-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-500 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                    >
                      <History className="w-4 h-4" />
                      <span>Snapshots and History</span>
                    </DropdownMenuItem>
                    {canEditDns && (
                      <DropdownMenuItem
                        disabled={Boolean(permissionWarning)}
                        onClick={() => setIsImportDialogOpen(true)}
                        className="group gap-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-500 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Import Zone File</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={handleExportBIND}
                      className="group gap-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-500 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export Zone File</span>
                    </DropdownMenuItem>
                    {isOwner && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setIsDisableDialogOpen(true)}
                          className="group gap-2 text-destructive focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white text-xs cursor-pointer rounded-md"
                        >
                          <ShieldAlert className="w-4 h-4" />
                          <span>Disable DNS Service</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null
          }
        />

        {/* STATE 1: No organizations */}
        {orgs.length === 0 ? (
          <EmptyOrgState
            icon={<Globe className="w-6 h-6" />}
            description="Register an organization to manage DNS zones and record routing."
          />
        ) : selectedOrg && !zoneId ? (
          /* STATE 2: DNS Activation & BYOT Guideline */
          <div className="w-full space-y-6">
            {/* Widget 1: DNS Activation Widget (65% Blue Features / 35% Activation Types) */}
            <ServiceActivationCard
              domain={selectedOrg.domain}
              domainIcon={<Globe className="w-3.5 h-3.5 text-white" />}
              title="DNS Management Service"
              description="Centralized authoritative DNS control for your organization with automated safety snapshots and multi-record propagation."
              features={[
                {
                  title: "Full Record Coverage",
                  description:
                    "Manage A, AAAA, CNAME, MX, TXT, SRV, CAA, TLSA, HTTPS, PTR, and more from one console.",
                },
                {
                  title: "Snapshots & Rollback",
                  description:
                    "Automatic point-in-time zone backups let you restore prior states in one click.",
                },
                {
                  title: "Updated in under a minute",
                  description:
                    "DNS changes propagate and update globally in under a minute on average.",
                },
                {
                  title: "Zero Billing Access",
                  description:
                    "Least-privilege scoped access keeps root domain ownership and billing under your control.",
                },
              ]}
              rightPanel={
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">Activation Types</h3>
                    <p className="text-xs text-slate-500">Choose how you want to manage {selectedOrg.domain}.</p>
                  </div>

                  {/* Option 1: Revlet Platform Managed */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-900">Managed by Revlet Platform</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Nameservers and complete DNS service managed by Revlet Platform.
                      </p>
                    </div>
                    <Button
                      onClick={handleRequestDNS}
                      disabled={isRequesting}
                      className="w-full h-9 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none flex items-center justify-center gap-2"
                    >
                      {isRequesting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isRequesting ? "Activating..." : "Activate"}
                    </Button>
                  </div>

                  {/* Option 2: Bring Your Own Token */}
                  <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-900">Bring Your Own Token</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Verify scoped access and connect your existing zone if you need your own Cloudflare control.
                      </p>
                    </div>
                    <div className="relative">
                      <Input
                        id="token"
                        type={showTokenSecret ? "text" : "password"}
                        placeholder="Paste scoped API token"
                        value={apiTokenInput}
                        onChange={(e) => setApiTokenInput(e.target.value)}
                        className="h-9 font-mono text-xs pr-9 border-slate-200 bg-white rounded-lg focus-visible:ring-primary/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokenSecret(!showTokenSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        title={showTokenSecret ? "Hide secret" : "Reveal secret"}
                      >
                        {showTokenSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <Button
                      onClick={() => void handleConnectToken()}
                      disabled={isConnectingToken || !apiTokenInput.trim()}
                      className="w-full h-9 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center justify-center gap-2"
                    >
                      {isConnectingToken && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {isConnectingToken ? "Verifying Access..." : "Activate with Cloudflare"}
                    </Button>
                  </div>
                </div>
              }
            />

            {/* Widget 2: Bring Your Own Token Guideline Widget */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl">
              <CardHeader className="border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Bring Your Own Token Guidelines
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Follow these steps to generate a scoped token for {selectedOrg.domain}.
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
                    <span>Go to Cloudflare</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                </a>
              </CardHeader>

              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-lg bg-slate-50/60 border border-slate-200/80 space-y-1.5">
                    <p className="font-mono text-xs text-slate-500">Step 01</p>
                    <p className="font-medium text-slate-900">Select Required Permissions</p>
                    <p className="text-slate-500 leading-relaxed">
                      Click <strong>Go to Cloudflare</strong> to open the token template with <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">Zone: DNS (Edit)</code> and <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">Zone: Zone (Read)</code> pre-selected.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50/60 border border-slate-200/80 space-y-1.5">
                    <p className="font-mono text-xs text-slate-500">Step 02</p>
                    <p className="font-medium text-slate-900">Scope to Your Domain</p>
                    <p className="text-slate-500 leading-relaxed">
                      Under <strong>Zone Resources</strong>, select <span className="text-slate-800">Include → Specific zone → {selectedOrg.domain}</span> so access is strictly isolated to this domain.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-50/60 border border-slate-200/80 space-y-1.5">
                    <p className="font-mono text-xs text-slate-500">Step 03</p>
                    <p className="font-medium text-slate-900">Verify &amp; Activate</p>
                    <p className="text-slate-500 leading-relaxed">
                      Copy the token, paste it under <strong>Bring Your Own Token</strong> above, and click <strong>Activate with Cloudflare</strong>.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* STATE 3: Active DNS Workspace */
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Background Token Permission Warning Widget */}
            {permissionWarning && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-xs">
                  <p className="font-semibold text-amber-900">
                    Missing or Invalid Access Permissions
                  </p>
                  <p className="text-amber-800 leading-relaxed">
                    {permissionWarning} DNS modifications are temporarily disabled until valid permissions are restored.
                  </p>
                </div>
              </div>
            )}

            {/* Nameservers Card */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl overflow-hidden">
              <CardHeader
                className="bg-slate-50/50 flex flex-row items-center justify-between py-3.5 px-6 cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100"
                onClick={() => setIsNameserversExpanded(!isNameserversExpanded)}
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-xs font-semibold text-slate-700">
                    Network Nameservers
                  </CardTitle>
                </div>
                <div className="flex items-center gap-3">
                  {isLoadingRecords && !zoneDetails ? (
                    <Skeleton className="h-5 w-16 rounded" />
                  ) : (
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
                  )}
                  {isNameserversExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </CardHeader>

              {isNameserversExpanded && (
                <CardContent className="p-6">
                  {isLoadingRecords && !zoneDetails ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <Skeleton className="h-3.5 w-36" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </div>
                      <div className="border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 pl-0 md:pl-6 space-y-3">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-16 w-full rounded-lg" />
                      </div>
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-slate-500">Assigned Nameservers</p>
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
                          <p className="text-xs font-medium text-slate-500">API Connection</p>
                          <p className="text-xs text-slate-700">
                            Authenticated via scoped API token on zone <span className="font-mono text-slate-900">{selectedOrg.domain}</span>.
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Masked Token</span>
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
                          <p className="text-xs font-medium text-slate-500">Registrar Delegation</p>
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
                          <span>View Registrar Instructions</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  )}
                </CardContent>
              )}
            </Card>

            {connectionError && (
              <div
                role="alert"
                className="rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 text-xs text-amber-950">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Connection needs attention</p>
                    <p className="text-amber-900">{connectionError}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void fetchDNSData()}
                  className="h-8 text-xs bg-white border-amber-300 text-amber-950 hover:bg-amber-100 shrink-0"
                >
                  Check again
                </Button>
              </div>
            )}

            {/* Records Table Card */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl">
              <CardHeader className="border-b border-slate-100 px-6 py-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold text-slate-900">
                      DNS Records
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="text-xs font-normal tabular-nums text-slate-600 bg-slate-50 border-slate-200 px-2 py-0.5 rounded"
                    >
                      {filteredRecords.length === records.length
                        ? `${records.length} ${records.length === 1 ? "record" : "records"}`
                        : `${filteredRecords.length} of ${records.length}`}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        placeholder="Search name, value, or type..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-9 pl-9 text-base sm:text-xs border-slate-200 bg-white rounded-lg focus-visible:ring-primary/20"
                      />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="h-9 w-[108px] text-xs font-mono border-slate-200 bg-white rounded-lg">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg">
                        <SelectItem value="ALL" className="text-xs">All types</SelectItem>
                        {availableRecordTypes.map((t) => (
                          <SelectItem key={t} value={t} className="text-xs font-mono">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0 min-h-[180px]">
                <TooltipProvider>
                  {isLoadingRecords ? (
                    <DNSRecordsSkeleton />
                  ) : filteredRecords.length === 0 ? (
                    <div className="py-16 text-center space-y-1.5 px-4">
                      <p className="text-sm font-medium text-slate-700">No DNS Records Found</p>
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
                                Value / Target
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
                            {paginatedRecords.map((rec) => (
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
                                  {canEditDns ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Edit ${rec.type} record ${rec.name}`}
                                        disabled={Boolean(permissionWarning)}
                                        className="h-7 w-7 text-slate-400 hover:text-slate-900 transition-colors rounded-lg disabled:opacity-40"
                                        onClick={() => {
                                          setEditingRecord(rec)
                                          setIsReviewingRecord(false)
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
                                        aria-label={`Delete ${rec.type} record ${rec.name}`}
                                        disabled={Boolean(permissionWarning)}
                                        className="h-7 w-7 text-slate-400 hover:text-red-600 transition-colors rounded-lg disabled:opacity-40"
                                        onClick={() => {
                                          setDeletingRecordId(rec.id)
                                          setIsDeleteOpen(true)
                                        }}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">View only</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile List View */}
                      <div className="block md:hidden divide-y divide-slate-100">
                        {paginatedRecords.map((rec) => (
                          <div
                            key={rec.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setMobileDetailRecord(rec)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                setMobileDetailRecord(rec)
                              }
                            }}
                            className="p-4 space-y-2 active:bg-slate-50 cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs font-semibold text-slate-700 shrink-0">
                                  {rec.type}
                                </span>
                                <span className="font-mono text-xs font-medium text-slate-900 truncate">
                                  {rec.name}
                                </span>
                              </div>
                              {isProxyAllowed(rec.type) && (
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded text-[11px] font-medium border shrink-0",
                                    rec.proxied
                                      ? "bg-amber-50 text-amber-700 border-amber-200/60"
                                      : "bg-slate-50 text-slate-600 border-slate-200"
                                  )}
                                >
                                  {rec.proxied ? "Proxied" : "DNS only"}
                                </span>
                              )}
                            </div>

                            <p className="font-mono text-xs text-slate-600 break-all line-clamp-2">
                              {rec.content}
                            </p>

                            <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                              <span>
                                TTL: {rec.ttl}
                                {rec.priority !== undefined ? ` · Priority ${rec.priority}` : ""}
                              </span>
                              <span className="text-slate-600 font-medium">View details</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <TablePagination
                        totalItems={filteredRecords.length}
                        currentPage={safeRecordsPage}
                        pageSize={recordsPageSize}
                        onPageChange={setRecordsPage}
                        onPageSizeChange={setRecordsPageSize}
                        itemLabel="records"
                      />
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
                Registrar Nameserver Setup
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Configure your domain registrar for {selectedOrg?.domain}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 text-xs text-slate-600">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <p className="font-medium text-slate-900">Assigned Nameservers</p>
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
        {/* Mobile Accessible Record Detail Sheet */}
        <Sheet
          open={Boolean(mobileDetailRecord)}
          onOpenChange={(open) => {
            if (!open) setMobileDetailRecord(null)
          }}
        >
          <SheetContent side="bottom" className="rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-white">
            {mobileDetailRecord && (
              <div className="space-y-4">
                <SheetHeader className="text-left space-y-1">
                  <SheetTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {mobileDetailRecord.type}
                    </span>
                    <span className="font-mono truncate">{mobileDetailRecord.name}</span>
                  </SheetTitle>
                  <SheetDescription className="text-xs text-slate-500">
                    TTL: {mobileDetailRecord.ttl}
                    {mobileDetailRecord.priority !== undefined ? ` · Priority ${mobileDetailRecord.priority}` : ""}
                    {isProxyAllowed(mobileDetailRecord.type)
                      ? ` · ${mobileDetailRecord.proxied ? "Proxied" : "DNS only"}`
                      : ""}
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-500">Full value</Label>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-900 break-all">
                    {mobileDetailRecord.content}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCopyText(mobileDetailRecord.content)}
                    className="h-10 flex-1 text-xs font-medium rounded-lg gap-1.5"
                  >
                    {copiedText === mobileDetailRecord.content ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>Copy value</span>
                  </Button>
                  {canEditDns && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={Boolean(permissionWarning)}
                        onClick={() => {
                          const target = mobileDetailRecord
                          setMobileDetailRecord(null)
                          setEditingRecord(target)
                          setIsReviewingRecord(false)
                          setFormData({
                            ...target,
                            priority: target.priority !== undefined ? Number(target.priority) : 10,
                          })
                          setIsDialogOpen(true)
                        }}
                        className="h-10 px-4 text-xs font-medium rounded-lg"
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={Boolean(permissionWarning)}
                        onClick={() => {
                          const id = mobileDetailRecord.id
                          setMobileDetailRecord(null)
                          setDeletingRecordId(id)
                          setIsDeleteOpen(true)
                        }}
                        className="h-10 px-4 text-xs font-medium rounded-lg"
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Type-Aware Add / Edit DNS Record Side Panel with Review-Before-Publish */}
        <Sheet
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open)
            if (!open) {
              setFormErrors({})
              setIsReviewingRecord(false)
            }
          }}
        >
          <SheetContent
            side="right"
            className="w-full sm:max-w-lg p-0 flex flex-col bg-white border-l border-slate-200 h-[100dvh]"
          >
            <SheetHeader className="px-5 py-4 border-b border-slate-100 text-left space-y-1 shrink-0">
              <SheetTitle className="text-base font-semibold text-slate-900">
                {isReviewingRecord
                  ? "Review DNS change"
                  : editingRecord
                  ? "Edit DNS Record"
                  : "Add DNS Record"}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500 font-mono">
                Zone: {selectedOrg?.domain}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {isReviewingRecord ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Action</span>
                      <span className="font-semibold text-slate-900">
                        {editingRecord ? "Update record" : "Create record"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Type</span>
                      <span className="font-mono font-semibold text-slate-900">{formData.type}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-500">Full hostname</span>
                      <p className="font-mono text-slate-900 break-all bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
                        {resolvePreviewHostname(formData.name, selectedOrg?.domain)}
                      </p>
                    </div>
                    {editingRecord && (
                      <div className="space-y-1">
                        <span className="text-slate-500">Previous value</span>
                        <p className="font-mono text-slate-500 line-through break-all bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
                          {editingRecord.content}
                        </p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <span className="text-slate-500">{editingRecord ? "New value" : "Value"}</span>
                      <p className="font-mono text-slate-900 break-all bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
                        {formData.content}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                      <span className="text-slate-500">TTL / Proxy</span>
                      <span className="font-mono text-slate-900">
                        {formData.ttl}
                        {formData.type === "MX" || formData.type === "SRV"
                          ? ` · Priority ${formData.priority ?? 10}`
                          : ""}
                        {isProxyAllowed(formData.type!)
                          ? ` · ${formData.proxied ? "Proxied" : "DNS only"}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  {(formData.type === "MX" ||
                    (formData.type === "TXT" &&
                      /spf|dkim|dmarc/i.test(`${formData.name || ""} ${formData.content || ""}`))) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <span>
                        This record affects email routing or authentication. Verify the target carefully before publishing.
                      </span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500">
                    Cloudflare accepts changes immediately; global DNS propagation depends on TTL and resolver caches.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Type</Label>
                    <Select value={formData.type} onValueChange={handleTypeChange}>
                      <SelectTrigger className="h-10 sm:h-9 text-xs border-slate-200 bg-white rounded-lg font-mono">
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
                        "h-10 sm:h-9 text-base sm:text-sm border-slate-200 rounded-lg focus-visible:ring-primary/20 bg-white font-mono",
                        formErrors.name && "border-red-400"
                      )}
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                    />
                    <p className="text-[11px] text-slate-500">
                      Resolves to{" "}
                      <span className="font-mono text-slate-800">
                        {resolvePreviewHostname(formData.name, selectedOrg?.domain)}
                      </span>
                    </p>
                    {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Value / target</Label>
                    <Input
                      placeholder="e.g. 192.0.2.1 or target.example.com"
                      className={cn(
                        "h-10 sm:h-9 text-base sm:text-sm border-slate-200 rounded-lg focus-visible:ring-primary/20 bg-white font-mono",
                        formErrors.content && "border-red-400"
                      )}
                      value={formData.content}
                      onChange={(e) => handleInputChange("content", e.target.value)}
                    />
                    {formErrors.content && <p className="text-xs text-red-500">{formErrors.content}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {formData.type === "MX" || formData.type === "SRV" ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700">Priority</Label>
                        <Input
                          type="number"
                          min={0}
                          max={65535}
                          step={1}
                          placeholder="10"
                          className="h-10 sm:h-9 text-base sm:text-sm border-slate-200 rounded-lg bg-white"
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
                        <SelectTrigger className="h-10 sm:h-9 text-xs border-slate-200 bg-white rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg">
                          <SelectItem value="Auto" className="text-xs">Auto</SelectItem>
                          <SelectItem value="60" className="text-xs">1 minute</SelectItem>
                          <SelectItem value="300" className="text-xs">5 minutes</SelectItem>
                          <SelectItem value="3600" className="text-xs">1 hour</SelectItem>
                          <SelectItem value="86400" className="text-xs">1 day</SelectItem>
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
                </>
              )}
            </div>

            <div className="px-5 py-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white flex items-center justify-end gap-2 shrink-0">
              {isReviewingRecord ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsReviewingRecord(false)}
                    disabled={isSubmitting}
                    className="h-10 sm:h-9 text-xs"
                  >
                    Back to edit
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveRecord}
                    disabled={isSubmitting}
                    className="h-10 sm:h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isSubmitting ? "Publishing..." : "Publish change"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsDialogOpen(false)}
                    className="h-10 sm:h-9 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (validateForm()) {
                        setIsReviewingRecord(true)
                      }
                    }}
                    className="h-10 sm:h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none"
                  >
                    Review changes
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>

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
                Import BIND Zone
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
                  <Label className="text-xs font-medium text-slate-900">Proxy Imported Records</Label>
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
                onClick={() => void processImport()}
                disabled={isSubmitting || !importFile || !importConfirmed}
                className="h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? "Importing..." : "Start Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Delete DNS Record
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
                Delete Record
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
                Zone Snapshots and Rollback
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Point-in-time state backups for {selectedOrg?.domain}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-slate-700">Instant Zone Snapshot</Label>
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
                    <span>Take Snapshot</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">Historical Snapshots</p>
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
                Confirm Zone Rollback
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
                onClick={() => void handleExecuteRollback()}
                disabled={isRollingBack}
                className="h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isRollingBack && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isRollingBack ? "Rolling back..." : "Confirm Rollback"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Disable DNS Service Dialog */}
        <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-destructive" />
                Disable DNS Service
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Warning: This action will permanently disconnect {selectedOrg?.domain} from Revlet DNS Management.
              </DialogDescription>
            </DialogHeader>
            <div className="p-3 rounded-lg bg-red-50 border border-red-200/80 text-xs text-red-900 leading-relaxed space-y-1">
              <p className="font-semibold">What happens when you disconnect:</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-800">
                <li>Stored access credentials and active zone bindings are removed</li>
                <li>Live DNS records at Cloudflare remain untouched</li>
                <li>Saved zone snapshots and change history are preserved for audit</li>
              </ul>
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
                onClick={() => void handleDisconnectToken()}
                disabled={isDisconnectingToken}
                variant="destructive"
                className="h-9 px-4 text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isDisconnectingToken && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isDisconnectingToken ? "Disabling..." : "Disable Service"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <StepUpMfaDialog
          open={isRollbackMfaOpen}
          onOpenChange={(open) => {
            setIsRollbackMfaOpen(open)
            if (!open) setPendingMfaAction(null)
          }}
          actionLabel={pendingMfaAction?.label || "complete this DNS action"}
          onVerified={(token) => {
            const action = pendingMfaAction?.type || "rollback"
            setPendingMfaAction(null)
            if (action === "connect") void handleConnectToken(token)
            else if (action === "disconnect") void handleDisconnectToken(token)
            else if (action === "import") void processImport(token)
            else void handleExecuteRollback(token)
          }}
        />
      </div>
    </DashboardShell>
  )
}
