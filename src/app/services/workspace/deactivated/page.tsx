"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useUser, useFirestore } from "@/firebase"
import { useToast } from "@/hooks/use-toast"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import {
  listSuspendedUsers,
  updateUser,
  deleteUser,
  getUserStorageReport,
  undeleteUser,
  listDeletedUsers,
  listOrgUnits,
} from "@/app/actions/google-workspace"
import type { WorkspaceUser } from "@/app/actions/google-workspace"
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy, doc, deleteDoc } from "firebase/firestore"
import { format, subDays, startOfYear } from "date-fns"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Loader2,
  UserMinus,
  UserCheck,
  HardDrive,
  Calendar as CalendarIcon,
  Search,
  ArrowRight,
  ShieldAlert,
  Play,
  Trash2,
  Download,
  X,
  CheckCircle2,
  Globe,
  AlertCircle,
  Info,
  MoreVertical,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function formatDate(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return "—"
  try {
    const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal
    return format(d, "MMM d, yyyy")
  } catch {
    return "—"
  }
}

function formatType(path: string | undefined | null): string {
  if (!path || path === "/" || path.toLowerCase() === "root") return "None"
  return path.startsWith("/") ? path.substring(1) : path
}

function getPendingDeletionDays(lastLoginTimeStr: string | Date | null | undefined): number | null {
  if (!lastLoginTimeStr) return null
  try {
    const lastLogin = typeof lastLoginTimeStr === "string" ? new Date(lastLoginTimeStr) : lastLoginTimeStr
    const now = new Date()
    const diffTime = now.getTime() - lastLogin.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    const remainingDays = 30 - diffDays
    return remainingDays
  } catch {
    return null
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkspaceDeactivatedPage() {
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()
  const { user } = useUser()
  const db = useFirestore()
  const { toast } = useToast()
  const router = useRouter()

  // ─── Core State ──────────────────────────────────────────────────────────
  const [suspendedUsers, setSuspendedUsers] = useState<WorkspaceUser[]>([])
  const [storageMap, setStorageMap] = useState<Record<string, number>>({})
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // ─── Search & Date Filtering State ───────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [activePreset, setActivePreset] = useState<number | "year" | null>(null)

  // ─── Dialog State ────────────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<WorkspaceUser | null>(null)
  const [isRestoreAlertOpen, setIsRestoreAlertOpen] = useState(false)
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("")
  const [isRecoverAlertOpen, setIsRecoverAlertOpen] = useState(false)
  const [selectedLogForRecovery, setSelectedLogForRecovery] = useState<any | null>(null)

  const adminEmail = selectedOrg?.workspaceAdminEmail || ""
  const isWorkspaceActive = selectedOrg?.workspaceStatus === "active"

  // ─── Tabs & Deleted Logs State ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"suspended" | "deleted">("suspended")
  const [deletedLogs, setDeletedLogs] = useState<any[]>([])
  const [isLoadingDeleted, setIsLoadingDeleted] = useState(true)
  const [isRecovering, setIsRecovering] = useState<string | null>(null)

  // ─── Batch Selection State ───────────────────────────────────────────────
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [selectionAction, setSelectionAction] = useState<"reactivate" | "delete" | "recover" | null>(null)
  const [isBatchReactivateOpen, setIsBatchReactivateOpen] = useState(false)
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false)
  const [batchDeleteConfirmText, setBatchDeleteConfirmText] = useState("")
  const [isBatchRecoverOpen, setIsBatchRecoverOpen] = useState(false)
  const [batchRecoveryOUPath, setBatchRecoveryOUPath] = useState("/Students")

  // Reset selection when tab changes
  useEffect(() => {
    setIsSelectionMode(false)
    setSelectedUserIds(new Set())
    setSelectionAction(null)
  }, [activeTab])

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const toggleAllSelection = (userIds: string[]) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      const allSelected = userIds.every((id) => next.has(id))
      if (allSelected) {
        userIds.forEach((id) => next.delete(id))
      } else {
        userIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const handleBatchReactivate = async () => {
    if (!adminEmail || selectedUserIds.size === 0 || !user || !selectedOrgId) return
    setIsSubmitting(true)
    let successCount = 0
    let failureCount = 0

    for (const userId of Array.from(selectedUserIds)) {
      try {
        const res = await updateUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", userId, { suspended: false })
        if (res.success) {
          successCount++
          setSuspendedUsers((prev) => prev.filter((u) => u.id !== userId))
        } else {
          failureCount++
        }
      } catch (err) {
        failureCount++
      }
    }

    toast({
      title: "Batch Reactivation Complete",
      description: `Successfully reactivated ${successCount} user(s). ${failureCount > 0 ? `Failed: ${failureCount}` : ""}`,
      variant: failureCount > 0 ? "destructive" : "default",
    })

    setIsBatchReactivateOpen(false)
    setIsSelectionMode(false)
    setSelectedUserIds(new Set())
    setSelectionAction(null)
    fetchSuspendedUsers()
    setIsSubmitting(false)
  }

  const handleBatchDelete = async () => {
    if (!adminEmail || selectedUserIds.size === 0 || !user || !selectedOrgId) return
    if (batchDeleteConfirmText !== "DELETE") {
      toast({
        title: "Confirmation Required",
        description: "Please type DELETE to confirm batch deletion.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    let successCount = 0
    let failureCount = 0

    for (const userId of Array.from(selectedUserIds)) {
      try {
        const res = await deleteUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", userId)
        if (res.success) {
          successCount++
          setSuspendedUsers((prev) => prev.filter((u) => u.id !== userId))
        } else {
          failureCount++
        }
      } catch (err) {
        failureCount++
      }
    }

    toast({
      title: "Batch Deletion Complete",
      description: `Successfully deleted ${successCount} user(s) permanently. ${failureCount > 0 ? `Failed: ${failureCount}` : ""}`,
      variant: failureCount > 0 ? "destructive" : "default",
    })

    setIsBatchDeleteOpen(false)
    setBatchDeleteConfirmText("")
    setIsSelectionMode(false)
    setSelectedUserIds(new Set())
    setSelectionAction(null)
    fetchSuspendedUsers()
    setIsSubmitting(false)
  }

  const handleBatchRecover = async () => {
    if (!adminEmail || selectedUserIds.size === 0 || !user || !selectedOrgId) return
    setIsSubmitting(true)
    let successCount = 0
    let failureCount = 0

    for (const logId of Array.from(selectedUserIds)) {
      const log = deletedLogs.find((d) => d.id === logId)
      if (!log) continue
      try {
        const res = await undeleteUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", log.userEmail, batchRecoveryOUPath)
        if (res.success) {
          successCount++
        } else {
          failureCount++
        }
      } catch (err) {
        failureCount++
      }
    }

    toast({
      title: "Batch Recovery Complete",
      description: `Successfully recovered ${successCount} user(s). ${failureCount > 0 ? `Failed: ${failureCount}` : ""}`,
      variant: failureCount > 0 ? "destructive" : "default",
    })

    setIsBatchRecoverOpen(false)
    setIsSelectionMode(false)
    setSelectedUserIds(new Set())
    setSelectionAction(null)
    fetchSuspendedUsers()
    fetchDeletedUsers()
    setIsSubmitting(false)
  }


  // ─── Live OUs & Recovery Destination ─────────────────────────────────────
  const [availableOUs, setAvailableOUs] = useState<{ label: string; path: string }[]>([
    { label: "Students", path: "/Students" },
    { label: "Teachers", path: "/Teachers" },
    { label: "Main People", path: "/Main People" },
    { label: "Staffs", path: "/Staffs" },
    { label: "None (Root)", path: "/" },
  ])
  const [recoveryOUPath, setRecoveryOUPath] = useState("/Students")

  const fetchAvailableOUs = useCallback(async () => {
    if (!user || !adminEmail || !selectedOrgId) return
    try {
      const res = await listOrgUnits(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "")
      if (res.success && (res as any).data) {
        const list = (res as any).data.map((ou: any) => ({
          label: ou.name || ou.orgUnitPath,
          path: ou.orgUnitPath,
        }))
        if (!list.some((item: any) => item.path === "/")) {
          list.push({ label: "None (Root)", path: "/" })
        }
        setAvailableOUs(list)
      }
    } catch (err) {
      console.error("Failed to load OUs:", err)
    }
  }, [adminEmail])

  // ─── Fetch Deleted Users from Live Google Workspace API ──────────────────
  const fetchDeletedUsers = useCallback(async () => {
    if (!user || !adminEmail || !selectedOrgId) return
    setIsLoadingDeleted(true)
    try {
      const res = await listDeletedUsers(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "")
      if (res.success && (res as any).data) {
        // Filter out users who have been deleted for 20 days or more
        const filtered = (res as any).data
          .filter((u: any) => {
            if (!u.deletionTime) return true
            const delDate = new Date(u.deletionTime)
            const diffDays = Math.floor((new Date().getTime() - delDate.getTime()) / (1000 * 60 * 60 * 24))
            return diffDays < 20
          })
          .map((u: any) => {
            const delDate = u.deletionTime ? new Date(u.deletionTime) : new Date()
            const diffDays = Math.floor((new Date().getTime() - delDate.getTime()) / (1000 * 60 * 60 * 24))
            const remainingDays = 20 - diffDays

            return {
              id: u.id,
              userEmail: u.email,
              userName: u.fullName || `${u.firstName} ${u.lastName}`,
              userOrgPath: u.orgUnitPath,
              timestamp: u.deletionTime ? new Date(u.deletionTime) : new Date(),
              performedBy: "Google Workspace System",
              remainingDays: Math.max(0, remainingDays),
            }
          })

        // Sort descending by deletion timestamp
        filtered.sort((a: any, b: any) => b.timestamp.getTime() - a.timestamp.getTime())
        setDeletedLogs(filtered)
      } else {
        throw new Error(res.error)
      }
    } catch (err: any) {
      console.error("Failed to load deleted users:", err)
    } finally {
      setIsLoadingDeleted(false)
    }
  }, [adminEmail])

  useEffect(() => {
    if (isWorkspaceActive && adminEmail) {
      fetchAvailableOUs()
    }
  }, [isWorkspaceActive, adminEmail, fetchAvailableOUs])

  // ─── Fetch Suspended Users ───────────────────────────────────────────────

  const fetchSuspendedUsers = useCallback(
    async (pageToken?: string) => {
      if (!user || !adminEmail || !selectedOrgId) return

      if (pageToken) {
        setIsLoadingMore(true)
      } else {
        setIsLoadingList(true)
        setSuspendedUsers([])
        setNextPageToken(null)
      }

      try {
        const res = await listSuspendedUsers(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", pageToken)
        if (!res.success) {
          throw new Error(res.error)
        }

        const data = (res as any).data!
        if (pageToken) {
          setSuspendedUsers((prev) => [...prev, ...data.users])
        } else {
          setSuspendedUsers(data.users)
        }
        setNextPageToken(data.nextPageToken)
      } catch (err: any) {
        console.error("Failed to fetch suspended users:", err)
        toast({
          title: "Failed to load suspended accounts",
          description: err.message || "Could not fetch suspended users list.",
          variant: "destructive",
        })
      } finally {
        setIsLoadingList(false)
        setIsLoadingMore(false)
      }
    },
    [adminEmail, toast]
  )

  // ─── Fetch Storage Usage for Recoverable Storage calculation ─────────────

  const fetchStorageReport = useCallback(async () => {
    if (!user || !adminEmail || !selectedOrgId) return
    try {
      const res = await getUserStorageReport(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "")
      if (res.success && (res as any).data) {
        const map: Record<string, number> = {}
        for (const entry of (res as any).data) {
          map[entry.email] = entry.usedBytes
        }
        setStorageMap(map)
      }
    } catch (err) {
      console.error("Failed to load storage report for estimation:", err)
    }
  }, [adminEmail])

  useEffect(() => {
    if (isWorkspaceActive && adminEmail) {
      fetchSuspendedUsers()
      fetchStorageReport()
      fetchDeletedUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkspaceActive, adminEmail])

  // ─── Computed Values ────────────────────────────────────────────────────

  // Recoverable storage is the sum of storage of all currently listed suspended users
  const totalRecoverableBytes = useMemo(() => {
    return suspendedUsers.reduce((sum, u) => sum + (storageMap[u.email] || 0), 0)
  }, [suspendedUsers, storageMap])

  // Client-side filtered suspended users
  const filteredSuspendedUsers = useMemo(() => {
    return suspendedUsers.filter((u) => {
      // 1. Search term match
      const lowerSearch = searchTerm.toLowerCase().trim()
      const matchesSearch =
        !lowerSearch ||
        u.fullName.toLowerCase().includes(lowerSearch) ||
        u.email.toLowerCase().includes(lowerSearch)

      // 2. Date filtering (use lastLoginTime as a suspension date proxy)
      let matchesDate = true
      if (startDate || endDate) {
        try {
          const uDate = new Date(u.lastLoginTime || u.creationTime)
          if (startDate && uDate < startDate) {
            matchesDate = false
          }
          if (endDate) {
            // Set end date boundary to 23:59:59
            const adjustedEndDate = new Date(endDate)
            adjustedEndDate.setHours(23, 59, 59, 999)
            if (uDate > adjustedEndDate) {
              matchesDate = false
            }
          }
        } catch {
          // fallback if parsing fails
        }
      }

      return matchesSearch && matchesDate
    })
  }, [suspendedUsers, searchTerm, startDate, endDate])

  // Client-side filtered deleted users (audit logs)
  const filteredDeletedUsers = useMemo(() => {
    return deletedLogs.filter((log) => {
      // 1. Search term match
      const lowerSearch = searchTerm.toLowerCase().trim()
      const matchesSearch =
        !lowerSearch ||
        (log.userName || "").toLowerCase().includes(lowerSearch) ||
        (log.userEmail || "").toLowerCase().includes(lowerSearch) ||
        (log.performedBy || "").toLowerCase().includes(lowerSearch)

      // 2. Date filtering
      let matchesDate = true
      if (startDate || endDate) {
        const logDate = log.timestamp
        if (logDate) {
          if (startDate && logDate < startDate) {
            matchesDate = false
          }
          if (endDate) {
            const adjustedEndDate = new Date(endDate)
            adjustedEndDate.setHours(23, 59, 59, 999)
            if (logDate > adjustedEndDate) {
              matchesDate = false
            }
          }
        } else {
          matchesDate = false
        }
      }

      return matchesSearch && matchesDate
    })
  }, [deletedLogs, searchTerm, startDate, endDate])

  // ─── Recover Deleted User Action ─────────────────────────────────────────

  const openRecoverAlert = (log: any) => {
    setSelectedLogForRecovery(log)
    setRecoveryOUPath(log.userOrgPath || "/Students")
    setIsRecoverAlertOpen(true)
  }

  const handleRecoverDeletedUser = async () => {
    if (!adminEmail || !user || !selectedOrgId || !selectedLogForRecovery) return

    setIsRecovering(selectedLogForRecovery.id)
    try {
      // Execute true Google Workspace restore / undelete
      const res = await undeleteUser(
        adminEmail,
        selectedLogForRecovery.userEmail,
        recoveryOUPath
      )

      if (!res.success) {
        throw new Error(res.error)
      }

      toast({
        title: "Account Recovered",
        description: `Successfully restored ${selectedLogForRecovery.userName || selectedLogForRecovery.userEmail} to active workspace directory.`,
      })
      setIsRecoverAlertOpen(false)
      setSelectedLogForRecovery(null)
      fetchSuspendedUsers()
      fetchDeletedUsers()
      router.refresh()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Recovery Failed",
        description: err.message || "Could not recover deleted account.",
      })
    } finally {
      setIsRecovering(null)
    }
  }

  // ─── Restore User Action ─────────────────────────────────────────────────

  const openRestoreAlert = (u: WorkspaceUser) => {
    setSelectedUser(u)
    setIsRestoreAlertOpen(true)
  }

  const handleRestoreUser = async () => {
    if (!adminEmail || !selectedUser || !user || !selectedOrgId) return

    setIsSubmitting(true)
    try {
      const res = await updateUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", selectedUser.id, { suspended: false })
      if (!res.success) {
        throw new Error(res.error)
      }

      toast({
        title: "Account Reactivated",
        description: `${selectedUser.fullName} (${selectedUser.email}) has been restored successfully.`,
      })

      setSuspendedUsers((prev) => prev.filter((u) => u.id !== selectedUser.id))

      setIsRestoreAlertOpen(false)
      setSelectedUser(null)
      fetchSuspendedUsers()
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Reactivation Failed",
        description: err.message || "Could not reactivate user account.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Delete User Action ──────────────────────────────────────────────────

  const openDeleteAlert = (u: WorkspaceUser) => {
    setSelectedUser(u)
    setDeleteConfirmEmail("")
    setIsDeleteOpen(true)
  }

  const setIsDeleteOpen = (val: boolean) => {
    setIsDeleteAlertOpen(val)
    if (!val) {
      setDeleteConfirmEmail("")
    }
  }

  const handleDeleteUser = async () => {
    if (!adminEmail || !selectedUser || !user || !selectedOrgId) return

    if (deleteConfirmEmail !== selectedUser.email) {
      toast({
        title: "Email Mismatch",
        description: "Please type the exact email to confirm deletion.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await deleteUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", selectedUser.id)
      if (!res.success) {
        throw new Error(res.error)
      }

      toast({
        title: "Account Deleted",
        description: `${selectedUser.fullName} has been permanently deleted from your organization.`,
      })

      setSuspendedUsers((prev) => prev.filter((u) => u.id !== selectedUser.id))

      setIsDeleteAlertOpen(false)
      setSelectedUser(null)
      fetchSuspendedUsers()
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Deletion Failed",
        description: err.message || "Could not permanently delete user account.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Timeline Presets ────────────────────────────────────────────────────

  const applyPreset = (days: number | "year") => {
    const end = new Date()
    let start = new Date()
    if (days === "year") {
      start = startOfYear(end)
    } else {
      start = subDays(end, days)
    }
    setStartDate(start)
    setEndDate(end)
    setActivePreset(days)
  }

  const clearDateRange = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    setActivePreset(null)
  }

  // ─── Export CSV ──────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    if (filteredSuspendedUsers.length === 0) {
      toast({
        title: "No Data to Export",
        description: "There are no suspended accounts matching your filters to export.",
        variant: "destructive",
      })
      return
    }

    const headers = ["Full Name", "Email Address", "Original Type", "Last Login (Suspension Proxy)", "Creation Date", "Storage Used"]
    const rows = filteredSuspendedUsers.map((u) => [
      u.fullName,
      u.email,
      formatType(u.orgUnitPath),
      u.lastLoginTime ? format(new Date(u.lastLoginTime), "yyyy-MM-dd HH:mm:ss") : "Never",
      u.creationTime ? format(new Date(u.creationTime), "yyyy-MM-dd HH:mm:ss") : "Unknown",
      formatBytes(storageMap[u.email] || 0),
    ])

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows]
        .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n")

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    const domainName = selectedOrg?.domain || "workspace"
    const dateStr = format(new Date(), "yyyy-MM-dd")
    link.setAttribute("download", `${domainName}-suspended-users-${dateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Data Exported",
      description: `Successfully exported ${filteredSuspendedUsers.length} accounts to CSV.`,
    })
  }

  // ─── Loading State ───────────────────────────────────────────────────────

  if (isLoadingOrgs) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Synchronizing Infrastructure...
          </p>
        </div>
      </DashboardShell>
    )
  }

  // ─── No Org State ────────────────────────────────────────────────────────

  if (!selectedOrg || orgs.length === 0) {
    return (
      <DashboardShell>
        <div className="animate-in fade-in duration-500">
          <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Deactivated Users</h1>

          <Card className="mt-8 border-dashed bg-slate-50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="p-4 bg-white rounded-full border shadow-sm">
                <Globe className="w-10 h-10 text-slate-300 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-800">No Organization Found</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Create an organization first to access Google Workspace deactivated users.
                </p>
              </div>
              <Button asChild className="font-bold">
                <Link href="/account/home">Go to Account Home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

  // ─── STATE 2.5: Non-Educational Organization ──────────────────────────────

  if (selectedOrg && !selectedOrg.isEducation) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Deactivated Users</h1>
          </div>
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500 w-full">
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
              <CardContent className="p-16 flex flex-col items-center text-center gap-6">
                <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                  <AlertCircle className="w-10 h-10 text-slate-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-headline font-bold text-slate-900">Educational Organization Required</h3>
                  <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                    Google Workspace integration is exclusively available for educational organizations. Your current organization is not registered as an Educational entity.
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
        </div>
      </DashboardShell>
    )
  }

  // ─── Workspace Not Active Guard ──────────────────────────────────────────

  if (!isWorkspaceActive) {
    return (
      <DashboardShell>
        <div className="animate-in fade-in duration-500 space-y-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Deactivated Users</h1>
          </div>

          <Card className="mt-8 border-dashed bg-slate-50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="p-4 bg-white rounded-full border shadow-sm">
                <UserMinus className="w-10 h-10 text-slate-300 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-800">Workspace Activation Required</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Google Workspace must be connected and active before you can access the Deactivated Users register.
                  Please activate your workspace integration first.
                </p>
              </div>
              <Button asChild className="font-bold">
                <Link href="/services/workspace">Go to Workspace Hub</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

  // ─── Main Render ─────────────────────────────────────────────────────────

  return (
    <DashboardShell className="max-w-7xl">
      <div className="space-y-8 animate-in fade-in duration-500">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Deactivated Users</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSelectionMode ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSelectionMode(false)
                    setSelectedUserIds(new Set())
                    setSelectionAction(null)
                  }}
                  className="border-slate-200 text-slate-500 font-bold h-10 px-4 text-xs shadow-none mr-2"
                >
                  Cancel Selection
                </Button>
                {selectionAction === "reactivate" && (
                  <Button
                    onClick={() => setIsBatchReactivateOpen(true)}
                    disabled={isSubmitting || selectedUserIds.size === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Reactivate {selectedUserIds.size} Users
                  </Button>
                )}
                {selectionAction === "delete" && (
                  <Button
                    onClick={() => {
                      setBatchDeleteConfirmText("")
                      setIsBatchDeleteOpen(true)
                    }}
                    disabled={isSubmitting || selectedUserIds.size === 0}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete {selectedUserIds.size} Users
                  </Button>
                )}
                {selectionAction === "recover" && (
                  <Button
                    onClick={() => setIsBatchRecoverOpen(true)}
                    disabled={isSubmitting || selectedUserIds.size === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                    Recover {selectedUserIds.size} Users
                  </Button>
                )}
              </>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-slate-200 h-10 w-10 p-0 text-slate-500 shadow-none mr-2">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 font-bold">
                  {activeTab === "suspended" ? (
                    <>
                      <DropdownMenuItem 
                        onClick={() => {
                          setSelectionAction("reactivate")
                          setIsSelectionMode(true)
                        }}
                        className="cursor-pointer flex items-center gap-2 text-xs focus:bg-emerald-50 focus:text-emerald-750 text-emerald-600"
                      >
                        <Play className="w-4 h-4" />
                        <span>Reactivate Users...</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => {
                          setSelectionAction("delete")
                          setIsSelectionMode(true)
                        }}
                        className="cursor-pointer flex items-center gap-2 text-xs focus:bg-red-50 focus:text-red-750 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Users...</span>
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem 
                      onClick={() => {
                        setSelectionAction("recover")
                        setIsSelectionMode(true)
                      }}
                      className="cursor-pointer flex items-center gap-2 text-xs focus:bg-emerald-50 focus:text-emerald-750 text-emerald-600"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Recover Users...</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Badge className="text-[9px] font-bold px-2.5 py-1 border shadow-none bg-white text-slate-500 border-slate-200 self-start md:self-auto pointer-events-none select-none">
              <svg className="w-3 h-3 mr-1.5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Powered by Google
            </Badge>
          </div>
        </div>

        {/* ─── Summary Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Total Suspended */}
          <Card className="bg-white border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-300">
              <UserMinus className="w-24 h-24 text-slate-900" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <UserMinus className="w-4 h-4 text-red-500" />
                Suspended Accounts
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-400">
                Accounts currently deactivated in Google Workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingList ? (
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-headline font-bold text-slate-900">
                    {suspendedUsers.length}
                  </span>
                  <span className="text-xs font-semibold text-red-500 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                    Deactivated
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Recoverable Storage */}
          <Card className="bg-white border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-300">
              <HardDrive className="w-24 h-24 text-slate-900" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-500" />
                Recoverable Pool Space
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-400">
                Cloud storage currently held by suspended accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingList ? (
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-headline font-bold text-slate-900">
                    {formatBytes(totalRecoverableBytes)}
                  </span>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                    Reclaimable
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Timeline Date & Search Filters ──────────────────────────────── */}
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder={activeTab === 'suspended' ? "Search suspended accounts by name or email..." : "Search deleted accounts by name or email..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-xs md:text-sm border-slate-200 font-semibold"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date Range Picker */}
            <div className="flex flex-wrap items-center gap-2.5">
              
              {/* Start Date */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 border-slate-200 justify-start text-left font-bold text-xs px-3 hover:text-black hover:bg-slate-50 transition-colors"
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400" />
                    {startDate ? formatDate(startDate) : <span>Start Date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white shadow-xl rounded-lg" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => {
                      setStartDate(d)
                      setActivePreset(null)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* End Date */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 border-slate-200 justify-start text-left font-bold text-xs px-3 hover:text-black hover:bg-slate-50 transition-colors"
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400" />
                    {endDate ? formatDate(endDate) : <span>End Date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white shadow-xl rounded-lg" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => {
                      setEndDate(d)
                      setActivePreset(null)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Quick Presets */}
              <div className="flex items-center gap-1 border border-slate-200 rounded-md p-1 bg-slate-50/50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => applyPreset(7)}
                  className={cn(
                    "h-7 text-[10px] font-bold px-2 py-0 rounded transition-all",
                    activePreset === 7
                      ? "bg-slate-900 text-white hover:bg-black hover:text-white"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white"
                  )}
                >
                  7D
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => applyPreset(30)}
                  className={cn(
                    "h-7 text-[10px] font-bold px-2 py-0 rounded transition-all",
                    activePreset === 30
                      ? "bg-slate-900 text-white hover:bg-black hover:text-white"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white"
                  )}
                >
                  30D
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => applyPreset(90)}
                  className={cn(
                    "h-7 text-[10px] font-bold px-2 py-0 rounded transition-all",
                    activePreset === 90
                      ? "bg-slate-900 text-white hover:bg-black hover:text-white"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white"
                  )}
                >
                  90D
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => applyPreset("year")}
                  className={cn(
                    "h-7 text-[10px] font-bold px-2 py-0 rounded transition-all",
                    activePreset === "year"
                      ? "bg-slate-900 text-white hover:bg-black hover:text-white"
                      : "text-slate-500 hover:text-slate-900 hover:bg-white"
                  )}
                >
                  Year
                </Button>
              </div>

              {/* Clear Filters */}
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  onClick={clearDateRange}
                  className="h-10 text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-xs px-3 font-semibold gap-1.5 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear Date
                </Button>
              )}
            </div>

          </CardContent>
        </Card>

        {/* ─── Deactivated & Deleted Accounts List ─────────────────────────────────────── */}
        <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3.5 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              <Button
                variant={activeTab === 'suspended' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('suspended')}
                className={cn(
                  "font-bold text-xs gap-2 rounded px-3 py-1.5 h-8 transition-all shadow-none",
                  activeTab === 'suspended' 
                    ? "bg-slate-900 text-white hover:bg-black hover:text-white" 
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                )}
              >
                <UserMinus className="w-3.5 h-3.5" />
                Suspended Accounts
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded font-bold ml-1 font-mono",
                  activeTab === 'suspended' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                )}>
                  {filteredSuspendedUsers.length}
                </span>
              </Button>
              <Button
                variant={activeTab === 'deleted' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('deleted')}
                className={cn(
                  "font-bold text-xs gap-2 rounded px-3 py-1.5 h-8 transition-all shadow-none",
                  activeTab === 'deleted' 
                    ? "bg-slate-900 text-white hover:bg-black hover:text-white" 
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Deleted Accounts
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded font-bold ml-1 font-mono",
                  activeTab === 'deleted' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                )}>
                  {filteredDeletedUsers.length}
                </span>
              </Button>
            </div>
            {activeTab === 'suspended' && (
              <Button
                onClick={handleExportCSV}
                variant="outline"
                size="sm"
                className="text-xs h-8 border-slate-200 hover:border-slate-300 hover:text-black hover:bg-slate-50 font-bold gap-1.5 shadow-none"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {activeTab === 'suspended' && (
              isLoadingList ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Accounts...</p>
                </div>
              ) : filteredSuspendedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-full border border-emerald-100">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">No Suspended Accounts Found</p>
                    <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                      No users match your current filter parameters or your organization has 0 suspended accounts.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-left">
                  {/* Desktop View: Suspended Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/50">
                          {isSelectionMode && (
                            <TableHead className="w-12 pl-6">
                              <Checkbox
                                checked={
                                  filteredSuspendedUsers.length > 0 &&
                                  filteredSuspendedUsers.every((u) => selectedUserIds.has(u.id))
                                }
                                onCheckedChange={() =>
                                  toggleAllSelection(filteredSuspendedUsers.map((u) => u.id))
                                }
                                className="border-slate-300"
                              />
                            </TableHead>
                          )}
                          <TableHead className={cn("text-[10px] font-bold text-slate-400 uppercase tracking-widest", !isSelectionMode && "pl-6")}>
                            User Profile
                          </TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Original Type
                          </TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Suspended On
                          </TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Created Date
                          </TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Storage Held
                          </TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-6 w-32">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSuspendedUsers.map((u) => {
                          const userInitials = `${(u.firstName || "?")[0]}${(u.lastName || "?")[0]}`.toUpperCase()
                          const heldBytes = storageMap[u.email] || 0

                          return (
                            <TableRow key={u.id} className="group hover:bg-slate-50/30">
                              {isSelectionMode && (
                                <TableCell className="pl-6 py-3.5">
                                  <Checkbox
                                    checked={selectedUserIds.has(u.id)}
                                    onCheckedChange={() => toggleUserSelection(u.id)}
                                    className="border-slate-300"
                                  />
                                </TableCell>
                              )}
                              {/* Name + Email stacked */}
                              <TableCell className={cn("py-3.5", !isSelectionMode && "pl-6")}>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-200">
                                    {userInitials}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-semibold text-slate-800 truncate">
                                      {u.fullName}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium font-mono truncate">
                                      {u.email}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>

                              {/* Original Type */}
                              <TableCell>
                                <span className="text-xs font-semibold font-mono text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/50">
                                  {formatType(u.orgUnitPath)}
                                </span>
                              </TableCell>

                              {/* Suspension Date */}
                              <TableCell>
                                <span className="text-xs text-slate-600 font-medium">
                                  {u.lastLoginTime ? formatDate(u.lastLoginTime) : "Never Logged In"}
                                </span>
                              </TableCell>

                              {/* Creation Date */}
                              <TableCell>
                                <span className="text-xs text-slate-500 font-medium">
                                  {formatDate(u.creationTime)}
                                </span>
                              </TableCell>

                              {/* Storage Held */}
                              <TableCell>
                                <span className="text-xs font-semibold text-slate-700">
                                  {formatBytes(heldBytes)}
                                </span>
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="text-right pr-6 py-3.5">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    onClick={() => openRestoreAlert(u)}
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                                    title="Reactivate Account"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-emerald-600" />
                                  </Button>
                                  <Button
                                    onClick={() => openDeleteAlert(u)}
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                    title="Permanently Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile View: High-End Touchable Suspended Cards */}
                  <div className="block md:hidden space-y-4 p-4 bg-slate-50/20">
                    {filteredSuspendedUsers.map((u) => {
                      const userInitials = `${(u.firstName || "?")[0]}${(u.lastName || "?")[0]}`.toUpperCase()
                      const heldBytes = storageMap[u.email] || 0

                      return (
                        <div
                          key={u.id}
                          className="relative p-5 rounded-xl border bg-white shadow-sm flex flex-col gap-4 border-slate-100 hover:shadow-md transition-all border-l-4 border-l-red-500"
                        >
                          {/* Card Header: Avatar & Info */}
                          <div className="flex items-start justify-between gap-3 text-left">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 border border-slate-200 shrink-0">
                                {userInitials}
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-slate-800 truncate leading-none">{u.fullName}</h4>
                                <p className="text-xs font-mono text-slate-400 truncate mt-1">{u.email}</p>
                              </div>
                            </div>
                            {isSelectionMode && (
                              <Checkbox
                                checked={selectedUserIds.has(u.id)}
                                onCheckedChange={() => toggleUserSelection(u.id)}
                                className="border-slate-350 w-5 h-5"
                              />
                            )}
                          </div>

                          {/* Card Body: Details */}
                          <div className="space-y-2.5 pt-2 border-t border-slate-100/60 text-left">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Original Type</span>
                              <span className="font-semibold font-mono text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/50">
                                {formatType(u.orgUnitPath)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Suspended On</span>
                              <span className="font-semibold text-slate-600">
                                {u.lastLoginTime ? formatDate(u.lastLoginTime) : "Never Logged In"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Created Date</span>
                              <span className="font-semibold text-slate-600">
                                {formatDate(u.creationTime)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Storage Held</span>
                              <span className="font-bold text-slate-700">
                                {formatBytes(heldBytes)}
                              </span>
                            </div>
                          </div>

                          {/* Card Footer: Touch actions */}
                          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100/60">
                            <Button
                              onClick={() => openRestoreAlert(u)}
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs font-bold text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700 gap-1 rounded-md bg-white shrink-0"
                              title="Reactivate Account"
                            >
                              <Play className="w-3.5 h-3.5 fill-emerald-600" />
                              Reactivate
                            </Button>
                            <Button
                              onClick={() => openDeleteAlert(u)}
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs font-bold text-red-500 border-red-100 hover:bg-red-50 hover:text-red-700 gap-1 rounded-md bg-white shrink-0"
                              title="Permanently Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            )}

            {activeTab === 'deleted' && (
              isLoadingDeleted ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Logs...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Retention Information Banner */}
                  <div className="mx-6 mt-4 p-3.5 bg-red-50/40 border border-red-100/80 rounded-xl flex items-start gap-3 text-left animate-in fade-in duration-300">
                    <Info className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div className="space-y-0.5">
                      <p className="text-xs text-red-800 leading-relaxed font-bold">
                        Google Workspace Retention Alert
                      </p>
                      <p className="text-[11px] text-red-700/90 leading-relaxed font-medium">
                        Deleted accounts are held by Google in a restorable state and completely deleted in <span className="font-bold text-red-800">20 days</span>. You can recover them below to fully restore their profiles and data before they are permanently purged.
                      </p>
                    </div>
                  </div>

                  {filteredDeletedUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
                      <div className="p-3 bg-slate-50 rounded-full border border-slate-200">
                        <Trash2 className="w-6 h-6 text-slate-300" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-800">No Deleted Accounts Found</p>
                        <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                          No deleted user accounts match your search/date filters or have been logged yet.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-left">
                      {/* Desktop View: Deleted Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/50">
                              {isSelectionMode && (
                                <TableHead className="w-12 pl-6">
                                  <Checkbox
                                    checked={
                                      filteredDeletedUsers.length > 0 &&
                                      filteredDeletedUsers.every((log) => selectedUserIds.has(log.id))
                                    }
                                    onCheckedChange={() =>
                                      toggleAllSelection(filteredDeletedUsers.map((log) => log.id))
                                    }
                                    className="border-slate-300"
                                  />
                                </TableHead>
                              )}
                              <TableHead className={cn("text-[10px] font-bold text-slate-400 uppercase tracking-widest", !isSelectionMode && "pl-6")}>
                                Deleted Account
                              </TableHead>
                              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Original Type
                              </TableHead>
                              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Date Deleted
                              </TableHead>
                              <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-6 w-44">
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredDeletedUsers.map((log) => {
                              const userInitials = `${(log.userName || "?")[0]}${(log.userName || "?")[1] || ""}`.toUpperCase()
                              const recovering = isRecovering === log.id

                              // Calculate dynamic remaining recovery days based on deletion timestamp (20 days limit)
                              const deletionDate = log.timestamp ? new Date(log.timestamp) : null
                              const remainingDays = deletionDate 
                                ? Math.max(0, 20 - Math.floor((new Date().getTime() - deletionDate.getTime()) / (1000 * 60 * 60 * 24))) 
                                : 20

                                return (
                                  <TableRow key={log.id} className="group hover:bg-slate-50/30">
                                    {isSelectionMode && (
                                      <TableCell className="pl-6 py-3.5">
                                        <Checkbox
                                          checked={selectedUserIds.has(log.id)}
                                          onCheckedChange={() => toggleUserSelection(log.id)}
                                          className="border-slate-300"
                                        />
                                      </TableCell>
                                    )}
                                    {/* Name + Email */}
                                    <TableCell className={cn("py-3.5", isSelectionMode ? "pl-2" : "pl-6")}>
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-[10px] font-bold text-red-600 border border-red-100">
                                          {userInitials}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-sm font-semibold text-slate-800 truncate">
                                            {log.userName || "Unknown User"}
                                          </span>
                                          <span className="text-xs text-slate-400 font-medium font-mono truncate">
                                            {log.userEmail}
                                          </span>
                                        </div>
                                      </div>
                                    </TableCell>

                                  {/* Original Type */}
                                  <TableCell>
                                    <span className="text-xs font-semibold font-mono text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/50">
                                      {formatType(log.userOrgPath)}
                                    </span>
                                  </TableCell>

                                  {/* Deletion Date */}
                                  <TableCell>
                                    <span className="text-xs text-slate-600 font-medium">
                                      {log.timestamp ? formatDate(log.timestamp) : "—"}
                                    </span>
                                  </TableCell>

                                  {/* Actions */}
                                  <TableCell className="text-right pr-6 py-3.5">
                                    <div className="flex items-center justify-end gap-2.5">
                                      <span className="inline-flex items-center text-[9px] font-bold text-red-700 bg-red-50 border border-red-100 rounded px-2 py-0.5" title="Google holds deleted users for 20 days in a restorable state.">
                                        Deleted
                                      </span>
                                      <Button
                                        onClick={() => openRecoverAlert(log)}
                                        disabled={recovering}
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[10px] font-bold text-emerald-600 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 gap-1 rounded transition-all shadow-none"
                                      >
                                        {recovering ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <UserCheck className="w-3 h-3" />
                                        )}
                                        Recover
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile View: High-End Touchable Deleted Cards */}
                      <div className="block md:hidden space-y-4 p-4 bg-slate-50/20">
                        {filteredDeletedUsers.map((log) => {
                          const userInitials = `${(log.userName || "?")[0]}${(log.userName || "?")[1] || ""}`.toUpperCase()
                          const recovering = isRecovering === log.id

                          return (
                            <div
                              key={log.id}
                              className="relative p-5 rounded-xl border bg-white shadow-sm flex flex-col gap-4 border-slate-100 hover:shadow-md transition-all border-l-4 border-l-red-500"
                            >
                              {/* Card Header: Name + Email */}
                              <div className="flex items-start justify-between gap-3 text-left">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-xs font-bold text-red-600 border border-red-100 shrink-0">
                                    {userInitials}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-bold text-slate-800 truncate leading-none">{log.userName || "Unknown User"}</h4>
                                    <p className="text-xs font-mono text-slate-400 truncate mt-1">{log.userEmail}</p>
                                  </div>
                                </div>
                                {isSelectionMode && (
                                  <Checkbox
                                    checked={selectedUserIds.has(log.id)}
                                    onCheckedChange={() => toggleUserSelection(log.id)}
                                    className="border-slate-350 w-5 h-5"
                                  />
                                )}
                              </div>

                              {/* Card Body: Details */}
                              <div className="space-y-2.5 pt-2 border-t border-slate-100/60 text-left">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Original Type</span>
                                  <span className="font-semibold font-mono text-slate-500 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/50">
                                    {formatType(log.userOrgPath)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Date Deleted</span>
                                  <span className="font-semibold text-slate-600">
                                    {log.timestamp ? formatDate(log.timestamp) : "—"}
                                  </span>
                                </div>
                              </div>

                              {/* Card Footer: Recover Actions */}
                              <div className="flex items-center justify-between pt-3 border-t border-slate-100/60">
                                <span className="inline-flex items-center text-[9px] font-bold text-red-700 bg-red-50 border border-red-100 rounded px-2 py-0.5 uppercase tracking-wider" title="Google holds deleted users for 20 days in a restorable state.">
                                  Deleted
                                </span>
                                <Button
                                  onClick={() => openRecoverAlert(log)}
                                  disabled={recovering}
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs font-bold text-emerald-600 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 gap-1.5 rounded-md bg-white shrink-0"
                                >
                                  {recovering ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <UserCheck className="w-3.5 h-3.5" />
                                  )}
                                  Recover
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* Load More Button (Only for suspended users) */}
            {activeTab === 'suspended' && nextPageToken && !isLoadingList && (
              <div className="p-4 border-t border-slate-100 flex justify-center bg-slate-50/20">
                <Button
                  onClick={() => fetchSuspendedUsers(nextPageToken)}
                  disabled={isLoadingMore}
                  variant="outline"
                  size="sm"
                  className="font-bold text-xs h-9"
                >
                  {isLoadingMore && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                  Load More suspended users
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ─── ALERT DIALOGS ─────────────────────────────────────────────────── */}

      {/* 1. Reactivate Account Alert */}
      <AlertDialog open={isRestoreAlertOpen} onOpenChange={setIsRestoreAlertOpen}>
        <AlertDialogContent className="bg-white rounded-lg shadow-xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-headline font-bold text-slate-800 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              Reactivate Account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
              Are you sure you want to restore and reactivate the Google Workspace account for{" "}
              <span className="font-semibold text-slate-800">{selectedUser?.fullName}</span>?
              <br />
              This will restore their access to all Google services, Drive files, and Gmail inbox immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} className="text-xs font-bold border-slate-200 h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleRestoreUser()
              }}
              disabled={isSubmitting}
              className="text-xs font-bold h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 1.5. Recover Deleted Account Dialog */}
      <Dialog open={isRecoverAlertOpen} onOpenChange={setIsRecoverAlertOpen}>
        <DialogContent className="bg-white rounded-lg shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-headline font-bold text-slate-800 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              Recover Deleted Account?
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
              Restore the workspace profile and reactivate directory access immediately for{" "}
              <span className="font-semibold text-slate-800">{selectedLogForRecovery?.userName || selectedLogForRecovery?.userEmail}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Select Type (Organizational Unit) to Recover into:
              </label>
              <Select value={recoveryOUPath} onValueChange={setRecoveryOUPath}>
                <SelectTrigger className="h-10 text-xs font-semibold border-slate-200">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {availableOUs.map((ou) => (
                    <SelectItem key={ou.path} value={ou.path} className="text-xs font-semibold">
                      {ou.label} ({formatType(ou.path)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={isRecovering !== null}
              onClick={() => setIsRecoverAlertOpen(false)}
              className="text-xs font-bold border-slate-200 h-10 shadow-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecoverDeletedUser}
              disabled={isRecovering !== null}
              className="text-xs font-bold h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isRecovering !== null ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Recover Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Permanent Delete Alert */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="bg-white rounded-lg shadow-xl max-w-md border-red-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-headline font-bold text-red-600 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Permanently Delete Account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
              You are about to <span className="text-red-600 font-bold">permanently delete</span> the account for{" "}
              <span className="font-semibold text-slate-800">{selectedUser?.fullName}</span> ({selectedUser?.email}).
              <br />
              <span className="text-red-500 font-semibold text-[11px] block mt-1 bg-red-50/50 p-2 rounded border border-red-100/50">
                Warning: This action is irreversible. All email messages, Drive documents, and custom workspace data associated with this user account will be lost forever.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Typing confirmation */}
          <div className="space-y-1.5 px-1 py-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Type user email to confirm deletion:
            </label>
            <Input
              type="text"
              placeholder={selectedUser?.email || "email@domain.com"}
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              className="h-10 text-xs border-red-100 focus:border-red-400 focus:ring-red-400 font-mono"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} className="text-xs font-bold border-slate-200 h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteUser()
              }}
              disabled={isSubmitting || deleteConfirmEmail !== selectedUser?.email}
              className="text-xs font-bold h-10 px-5 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Confirm Permanent Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Batch Reactivate Account Alert */}
      <AlertDialog open={isBatchReactivateOpen} onOpenChange={setIsBatchReactivateOpen}>
        <AlertDialogContent className="bg-white rounded-lg shadow-xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-headline font-bold text-slate-800 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              Reactivate Selected Accounts?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
              Are you sure you want to restore and reactivate the {selectedUserIds.size} selected Google Workspace account(s)?
              This will restore their access to all Google services, Drive files, and Gmail inbox immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} className="text-xs font-bold border-slate-200 h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleBatchReactivate()
              }}
              disabled={isSubmitting}
              className="text-xs font-bold h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Permanent Delete Alert */}
      <AlertDialog open={isBatchDeleteOpen} onOpenChange={setIsBatchDeleteOpen}>
        <AlertDialogContent className="bg-white rounded-lg shadow-xl max-w-md border-red-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-headline font-bold text-red-600 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Permanently Delete Selected Accounts?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
              You are about to <span className="text-red-600 font-bold">permanently delete</span> the {selectedUserIds.size} selected account(s).
              <br />
              <span className="text-red-500 font-semibold text-[11px] block mt-1 bg-red-50/50 p-2 rounded border border-red-100/50">
                Warning: This action is irreversible. All email messages, Drive documents, and custom workspace data associated with these user accounts will be lost forever.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Typing confirmation */}
          <div className="space-y-1.5 px-1 py-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Type DELETE to confirm batch deletion:
            </label>
            <Input
              type="text"
              placeholder="DELETE"
              value={batchDeleteConfirmText}
              onChange={(e) => setBatchDeleteConfirmText(e.target.value)}
              className="h-10 text-xs border-red-100 focus:border-red-400 focus:ring-red-400 font-mono"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} className="text-xs font-bold border-slate-200 h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleBatchDelete()
              }}
              disabled={isSubmitting || batchDeleteConfirmText !== "DELETE"}
              className="text-xs font-bold h-10 px-5 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Confirm Permanent Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Recover Deleted Accounts Dialog */}
      <Dialog open={isBatchRecoverOpen} onOpenChange={setIsBatchRecoverOpen}>
        <DialogContent className="bg-white rounded-lg shadow-xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-headline font-bold text-slate-800 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              Recover Selected Deleted Accounts?
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
              Restore the workspace profiles and reactivate directory access immediately for the {selectedUserIds.size} selected account(s).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Select Type (Organizational Unit) to Recover into:
              </label>
              <Select value={batchRecoveryOUPath} onValueChange={setBatchRecoveryOUPath}>
                <SelectTrigger className="h-10 text-xs font-semibold border-slate-200">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {availableOUs.map((ou) => (
                    <SelectItem key={ou.path} value={ou.path} className="text-xs font-semibold">
                      {ou.label} ({formatType(ou.path)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setIsBatchRecoverOpen(false)}
              className="text-xs font-bold border-slate-200 h-10 shadow-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBatchRecover}
              disabled={isSubmitting}
              className="text-xs font-bold h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Recover Accounts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardShell>
  )
}
