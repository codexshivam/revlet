"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useUser } from "@/firebase";
import { useActiveOrg } from "@/hooks/use-active-org"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Loader2, GraduationCap, Users as UsersIcon, Search, X, Calendar as CalendarIcon, RefreshCw, HardDrive, AlertCircle, MoreVertical, Play, Ban } from "lucide-react"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"
import { format, subDays, startOfYear } from "date-fns"
import { cn } from "@/lib/utils"

import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

import { listUsers, updateUser, getUserStorageReport, WorkspaceUser } from "@/app/actions/google-workspace"

function formatDate(dateVal: string | null | undefined): string {
  if (!dateVal) return "—"
  try {
    const d = new Date(dateVal)
    return format(d, "MMM d, yyyy")
  } catch {
    return "—"
  }
}



export default function WorkspaceAlumniPage() {
  const { user } = useUser();
  const { activeOrg: selectedOrg, activeOrgId, loading: isLoadingOrgs } = useActiveOrg()

  const [alumni, setAlumni] = useState<WorkspaceUser[]>([])
  const [storageMap, setStorageMap] = useState<Record<string, number>>({})
  const [totalStorageUsed, setTotalStorageUsed] = useState(0)

  const [isLoading, setIsLoading] = useState(true)
  const [isToggling, setIsToggling] = useState<string | null>(null) // track userId being toggled
  const [searchTerm, setSearchTerm] = useState("")

  // Batch Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [selectionAction, setSelectionAction] = useState<"restore" | "suspend" | "reactivate" | null>(null)
  const [isBatchRestoreOpen, setIsBatchRestoreOpen] = useState(false)
  const [isBatchSuspendOpen, setIsBatchSuspendOpen] = useState(false)
  const [isBatchReactivateOpen, setIsBatchReactivateOpen] = useState(false)

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

  const handleBatchRestore = async () => {
    if (!user || !selectedOrg?.workspaceAdminEmail || selectedUserIds.size === 0) return
    setIsRestoring(true)
    let successCount = 0
    let failureCount = 0

    for (const userId of Array.from(selectedUserIds)) {
      try {
        const targetAlum = alumni.find((u) => u.id === userId)
        if (!targetAlum) continue
        const updates: any = { orgUnitPath: "/" }
        if (targetAlum.suspended) updates.suspended = false

        const res = await updateUser(await user.getIdToken(), activeOrgId || selectedOrg?.id || "", userId, updates)
        if (res.success) {
          successCount++
          setAlumni((prev) => prev.filter((u) => u.id !== userId))
        } else {
          failureCount++
        }
      } catch (err) {
        failureCount++
      }
    }

    toast({
      title: "Batch Restore Complete",
      description: `Successfully restored ${successCount} user(s). ${failureCount > 0 ? `Failed: ${failureCount}` : ""}`,
      variant: failureCount > 0 ? "destructive" : "default",
    })

    setIsBatchRestoreOpen(false)
    setIsSelectionMode(false)
    setSelectedUserIds(new Set())
    setSelectionAction(null)
    fetchAlumniData()
    setIsRestoring(false)
  }

  const handleBatchSuspend = async (suspend: boolean) => {
    if (!user || !selectedOrg?.workspaceAdminEmail || selectedUserIds.size === 0) return
    setIsRestoring(true)
    let successCount = 0
    let failureCount = 0

    for (const userId of Array.from(selectedUserIds)) {
      try {
        const res = await updateUser(await user.getIdToken(), activeOrgId || selectedOrg?.id || "", userId, { suspended: suspend })
        if (res.success) {
          successCount++
          setAlumni((prev) => prev.map((u) => u.id === userId ? { ...u, suspended: suspend } : u))
        } else {
          failureCount++
        }
      } catch (err) {
        failureCount++
      }
    }

    toast({
      title: suspend ? "Batch Suspension Complete" : "Batch Reactivation Complete",
      description: `Successfully updated ${successCount} user(s). ${failureCount > 0 ? `Failed: ${failureCount}` : ""}`,
      variant: failureCount > 0 ? "destructive" : "default",
    })

    setIsBatchSuspendOpen(false)
    setIsBatchReactivateOpen(false)
    setIsSelectionMode(false)
    setSelectedUserIds(new Set())
    setSelectionAction(null)
    fetchAlumniData()
    setIsRestoring(false)
  }

  // Restore Dialog
  const [userToRestore, setUserToRestore] = useState<WorkspaceUser | null>(null)
  const [isRestoreOpen, setIsRestoreOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  // Timeline Filtering
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [activePreset, setActivePreset] = useState<number | "year" | null>(null)

  const isWorkspaceActive = selectedOrg?.workspaceStatus === "active"

  // ─── Data Fetching ────────────────────────────────────────────────────────
  const fetchAlumniData = useCallback(async () => {
    if (!user || !selectedOrg?.workspaceAdminEmail || !isWorkspaceActive || !activeOrgId) {
      setAlumni([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      // 1. Fetch Users in /Alumni OU
      const res = await listUsers(await user.getIdToken(), activeOrgId || selectedOrg?.id || "", { orgUnitPath: "/Alumni", maxResults: 500 })
      let fetchedUsers: WorkspaceUser[] = []
      
      if (res.success && (res as any).data) {
        fetchedUsers = (res as any).data.users
      } else {
        // If /Alumni doesn't exist, we might get an error. Just show empty state gracefully.
        console.warn("Could not fetch /Alumni OU. It might not exist yet.", res.error)
      }

      // 2. Fetch Storage Report
      const storageRes = await getUserStorageReport(await user.getIdToken(), activeOrgId || selectedOrg?.id || "")
      const sMap: Record<string, number> = {}
      let totalBytes = 0
      if (storageRes.success && (storageRes as any).data) {
        ((storageRes as any).data as any[]).forEach(entry => {
          sMap[entry.email.toLowerCase()] = entry.usedBytes
          // Only add to total if they are an alumni
          if (fetchedUsers.some(u => u.email.toLowerCase() === entry.email.toLowerCase())) {
            totalBytes += entry.usedBytes
          }
        })
      }
      setStorageMap(sMap)
      setTotalStorageUsed(totalBytes)

      // 3. Set sorted alumni (by creationTime)
      fetchedUsers.sort((a, b) => {
        const tA = new Date(a.creationTime).getTime() || 0
        const tB = new Date(b.creationTime).getTime() || 0
        return tB - tA
      })

      setAlumni(fetchedUsers)
    } catch (err: any) {
      toast({
        title: "Failed to load Alumni",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }, [selectedOrg?.workspaceAdminEmail, selectedOrg?.id, isWorkspaceActive, activeOrgId, user])

  useEffect(() => {
    fetchAlumniData()
  }, [fetchAlumniData])

  // ─── Toggle Suspension ──────────────────────────────────────────────────
  const handleToggleSuspend = async (targetUser: WorkspaceUser, currentSuspended: boolean) => {
    if (!targetUser || !selectedOrg?.workspaceAdminEmail || !user) return
    
    setIsToggling(targetUser.id)
    try {
      const newSuspendedState = !currentSuspended
      const res = await updateUser(await user.getIdToken(), activeOrgId || selectedOrg?.id || "", targetUser.id, { suspended: newSuspendedState })
      if (!res.success) throw new Error(res.error)

      setAlumni(prev => prev.map(u => u.id === targetUser.id ? { ...u, suspended: newSuspendedState } : u))
      toast({
        title: newSuspendedState ? "Alumnus Suspended" : "Alumnus Reactivated",
        description: `${targetUser.fullName}'s account access has been updated.`
      })
    } catch (err: any) {
      toast({
        title: "Action Failed",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setIsToggling(null)
    }
  }

  // ─── Restore User ─────────────────────────────────────────────────────────
  const handleRestoreClick = (user: WorkspaceUser) => {
    setUserToRestore(user)
    setIsRestoreOpen(true)
  }

  const confirmRestoreUser = async () => {
    if (!user || !selectedOrg?.workspaceAdminEmail || !userToRestore) return
    
    setIsRestoring(true)
    try {
      // Move to Root OU and reactivate if suspended
      const updates: any = { orgUnitPath: "/" }
      if (userToRestore.suspended) updates.suspended = false

      const res = await updateUser(await user.getIdToken(), activeOrgId || selectedOrg?.id || "", userToRestore.id, updates)
      if (!res.success) throw new Error(res.error)

      // Remove from alumni list
      setAlumni(prev => prev.filter(u => u.id !== userToRestore.id))
      toast({
        title: "User Restored",
        description: `${userToRestore.fullName} has been moved back to the root directory.`
      })
      setIsRestoreOpen(false)
      setUserToRestore(null)
    } catch (err: any) {
      toast({
        title: "Restore Failed",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setIsRestoring(false)
    }
  }


  // ─── Computed Values ────────────────────────────────────────────────────
  const filteredAlumni = useMemo(() => {
    return alumni.filter((user) => {
      // 1. Search term
      const lowerSearch = searchTerm.toLowerCase().trim()
      const matchesSearch =
        !lowerSearch ||
        (user.fullName || "").toLowerCase().includes(lowerSearch) ||
        (user.email || "").toLowerCase().includes(lowerSearch)

      // 2. Date filter (Using creationTime)
      let matchesDate = true
      if (startDate || endDate) {
        const userDate = new Date(user.creationTime)
        
        if (userDate) {
          if (startDate && userDate < startDate) matchesDate = false
          if (endDate) {
            const adjustedEndDate = new Date(endDate)
            adjustedEndDate.setHours(23, 59, 59, 999)
            if (userDate > adjustedEndDate) matchesDate = false
          }
        } else {
          matchesDate = false
        }
      }
      return matchesSearch && matchesDate
    })
  }, [alumni, searchTerm, startDate, endDate])

  // ─── Timeline Presets ───────────────────────────────────────────────────
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  if (isLoadingOrgs) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Loading Workspace Data...
          </p>
        </div>
      </DashboardShell>
    )
  }

  if (!selectedOrg || !selectedOrg.isEducation) {
    return (
      <DashboardShell>
        <div className="animate-in fade-in duration-500 space-y-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-4xl font-headline font-bold text-[#191C1E]">Alumni Manager</h1>
          </div>
          <Card className="mt-8 border-dashed bg-white border-slate-200">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="p-4 bg-slate-50 rounded-full border border-slate-100 shadow-sm">
                <GraduationCap className="w-10 h-10 text-slate-300 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-headline font-bold text-[#191C1E]">Educational Organization Required</h3>
                <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto">
                  Google Workspace integration is exclusively available for educational organizations.
                </p>
              </div>
              <Button asChild className="font-bold bg-[#191C1E] hover:bg-black text-white px-6">
                <Link href="/account/home">Go to Account Home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

  if (!isWorkspaceActive) {
    return (
      <DashboardShell>
        <div className="animate-in fade-in duration-500 space-y-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-4xl font-headline font-bold text-[#191C1E]">Alumni Manager</h1>
          </div>
          <Card className="mt-8 border-dashed bg-white border-slate-200">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="p-4 bg-slate-50 rounded-full border border-slate-100 shadow-sm">
                <GraduationCap className="w-10 h-10 text-slate-300 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-headline font-bold text-[#191C1E]">Workspace Activation Required</h3>
                <p className="text-sm font-medium text-slate-500 max-w-md mx-auto">
                  Google Workspace must be connected and active before you can access the Alumni Manager.
                </p>
              </div>
              <Button asChild className="font-bold bg-[#191C1E] hover:bg-black text-white px-6">
                <Link href="/services/workspace">Go to Workspace Hub</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell className="max-w-[1400px]">
      <div className="space-y-8 animate-in fade-in duration-500">
        
        {/* Page Header */}
        <div className="flex flex-col gap-1 border-b border-slate-200 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-4xl font-headline font-bold text-[#191C1E] tracking-tight">Alumni Manager</h1>
            <div className="flex items-center gap-2">
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
                  {selectionAction === "restore" && (
                    <Button
                      onClick={() => setIsBatchRestoreOpen(true)}
                      disabled={isRestoring || selectedUserIds.size === 0}
                      className="bg-slate-900 hover:bg-black text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                    >
                      {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Restore {selectedUserIds.size} Alumni
                    </Button>
                  )}
                  {selectionAction === "suspend" && (
                    <Button
                      onClick={() => setIsBatchSuspendOpen(true)}
                      disabled={isRestoring || selectedUserIds.size === 0}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                    >
                      {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                      Suspend {selectedUserIds.size} Alumni
                    </Button>
                  )}
                  {selectionAction === "reactivate" && (
                    <Button
                      onClick={() => setIsBatchReactivateOpen(true)}
                      disabled={isRestoring || selectedUserIds.size === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                    >
                      {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Reactivate {selectedUserIds.size} Alumni
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
                    <DropdownMenuItem 
                      onClick={() => {
                        setSelectionAction("restore")
                        setIsSelectionMode(true)
                      }}
                      className="cursor-pointer flex items-center gap-2 text-xs focus:bg-slate-50 focus:text-slate-900"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Restore Alumni...</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => {
                        setSelectionAction("suspend")
                        setIsSelectionMode(true)
                      }}
                      className="cursor-pointer flex items-center gap-2 text-xs focus:bg-amber-50 focus:text-amber-750 text-amber-600"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Suspend Alumni...</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => {
                        setSelectionAction("reactivate")
                        setIsSelectionMode(true)
                      }}
                      className="cursor-pointer flex items-center gap-2 text-xs focus:bg-emerald-50 focus:text-emerald-750 text-emerald-600"
                    >
                      <Play className="w-4 h-4" />
                      <span>Reactivate Alumni...</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Badge className="text-[9px] font-bold px-2.5 py-1 border shadow-none bg-white text-slate-500 border-slate-200 pointer-events-none select-none">
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
          <p className="text-sm text-slate-500 mt-2 font-medium max-w-2xl">
            Retain historical records and manage access.
          </p>
        </div>

        {/* Metrics Ribbon */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Registered Alumni</p>
                <p className="text-4xl font-headline font-bold text-[#191C1E]">
                  {alumni.length}
                </p>
              </div>
              <div className="w-12 h-12 bg-slate-50 rounded-full border border-slate-100 flex items-center justify-center shrink-0">
                <UsersIcon className="w-6 h-6 text-slate-300" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
            <CardContent className="p-6 flex items-center justify-between gap-6">
              <div className="space-y-3 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Collective Storage Footprint</p>
                  <p className="text-sm font-bold text-[#191C1E]">{formatBytes(totalStorageUsed)}</p>
                </div>
                {/* Visual cap at an arbitrary 500GB for progress bar rendering, or calculate dynamic % if quota known */}
                <Progress value={Math.min((totalStorageUsed / (500 * 1024 * 1024 * 1024)) * 100, 100)} className="h-2 bg-slate-100" />
              </div>
              <div className="w-12 h-12 bg-slate-50 rounded-full border border-slate-100 flex items-center justify-center shrink-0">
                <HardDrive className="w-6 h-6 text-slate-300" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Timeline Date & Search Filters ──────────────────────────────── */}
        <Card className="border-slate-200 shadow-sm rounded-xl">
          <CardContent className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search alumni by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-xs md:text-sm border-slate-200 font-semibold focus-visible:ring-slate-900 bg-slate-50"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date Range Picker */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 bg-slate-50 border-slate-200 justify-start text-left font-bold text-xs px-3 hover:text-black hover:bg-slate-100 transition-colors">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400" />
                    {startDate ? formatDate(startDate.toISOString()) : <span>Start Date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white shadow-xl rounded-xl border-slate-200" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setActivePreset(null); }} initialFocus />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-10 bg-slate-50 border-slate-200 justify-start text-left font-bold text-xs px-3 hover:text-black hover:bg-slate-100 transition-colors">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400" />
                    {endDate ? formatDate(endDate.toISOString()) : <span>End Date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white shadow-xl rounded-xl border-slate-200" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setActivePreset(null); }} initialFocus />
                </PopoverContent>
              </Popover>

              {/* Quick Presets */}
              <div className="flex items-center gap-1 border border-slate-200 rounded-md p-1 bg-slate-50">
                {[7, 30, 90].map(days => (
                  <Button key={days} variant="ghost" size="sm" onClick={() => applyPreset(days)} className={cn("h-7 text-[10px] font-bold px-2 py-0 rounded transition-all", activePreset === days ? "bg-[#191C1E] text-white hover:bg-black hover:text-white" : "text-slate-500 hover:text-[#191C1E] hover:bg-white")}>
                    {days}D
                  </Button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => applyPreset("year")} className={cn("h-7 text-[10px] font-bold px-2 py-0 rounded transition-all", activePreset === "year" ? "bg-[#191C1E] text-white hover:bg-black hover:text-white" : "text-slate-500 hover:text-[#191C1E] hover:bg-white")}>
                  Year
                </Button>
              </div>

              {(startDate || endDate) && (
                <Button variant="ghost" onClick={clearDateRange} className="h-10 text-slate-500 hover:text-[#191C1E] hover:bg-slate-100 text-xs px-3 font-semibold gap-1.5 transition-colors">
                  <X className="w-3.5 h-3.5" /> Clear Date
                </Button>
              )}
              
              <Button 
                variant="outline" 
                onClick={fetchAlumniData} 
                disabled={isLoading}
                className="h-10 px-3 border-slate-200 text-slate-500 hover:text-[#191C1E] hover:bg-slate-100 bg-slate-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Alumni Directory Table */}
        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between py-4 px-6">
            <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              Retention & Archive Directory
            </CardTitle>
            <Badge variant="outline" className="text-[9px] font-bold h-6 px-2.5 bg-white border-slate-200 text-slate-500 rounded-md">
              {filteredAlumni.length} Results
            </Badge>
          </CardHeader>
          
          <CardContent className="p-0 min-h-[300px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-[#191C1E]" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Directory...</p>
              </div>
            ) : filteredAlumni.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <Search className="w-8 h-8 text-slate-200" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-headline font-bold text-[#191C1E]">
                    {searchTerm || startDate ? "No matching alumni found" : "Directory is Empty"}
                  </h3>
                  <p className="text-xs font-medium text-slate-500 max-w-[250px] mx-auto">
                    {searchTerm || startDate
                      ? "Try adjusting your filters to find who you're looking for."
                      : "Use the User Directory to migrate active students to the Alumni archive."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-left">
                {/* Desktop View: Alumni Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/80">
                      <TableRow className="border-b border-slate-100">
                        {isSelectionMode && (
                          <TableHead className="w-12 pl-6">
                            <Checkbox
                              checked={
                                filteredAlumni.length > 0 &&
                                filteredAlumni.every((user) => selectedUserIds.has(user.id))
                              }
                              onCheckedChange={() =>
                                toggleAllSelection(filteredAlumni.map((user) => user.id))
                              }
                              className="border-slate-300"
                            />
                          </TableHead>
                        )}
                        <TableHead className={cn("text-[10px] font-bold uppercase py-4 tracking-wider text-slate-500", !isSelectionMode && "pl-6")}>Name</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 tracking-wider text-slate-500">Account Created</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 tracking-wider text-slate-500">Storage Footprint</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-6 tracking-wider text-slate-500">Account Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAlumni.map((user) => {
                        const userStorage = storageMap[user.email.toLowerCase()] || 0

                        return (
                          <TableRow key={user.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                            {isSelectionMode && (
                              <TableCell className="pl-6 py-4">
                                <Checkbox
                                  checked={selectedUserIds.has(user.id)}
                                  onCheckedChange={() => toggleUserSelection(user.id)}
                                  className="border-slate-300"
                                />
                              </TableCell>
                            )}
                            {/* Name and Email */}
                            <TableCell className={cn("py-4", isSelectionMode ? "pl-2" : "pl-6")}>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-[#191C1E] text-sm truncate max-w-[200px]">
                                  {user.fullName || "Unknown Name"}
                                </span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {user.email}
                                </span>
                              </div>
                            </TableCell>
                            
                            {/* Account Created Date */}
                            <TableCell>
                              <span className="text-xs text-slate-600 font-semibold">
                                {formatDate(user.creationTime)}
                              </span>
                            </TableCell>
                            
                            {/* Storage Footprint */}
                            <TableCell>
                              <span className="text-xs text-slate-600 font-semibold font-mono">
                                {formatBytes(userStorage)}
                              </span>
                            </TableCell>
                            
                            {/* Account Actions */}
                            <TableCell className="text-right pr-6">
                              <div className="flex items-center justify-end gap-4">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestoreClick(user)}
                                  disabled={isToggling === user.id || isRestoring}
                                  className="h-8 text-xs font-bold text-slate-600 border-slate-200"
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Restore
                                </Button>
                                <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider",
                                    user.suspended ? "text-red-500" : "text-emerald-500"
                                  )}>
                                    {user.suspended ? "Suspended" : "Active"}
                                  </span>
                                  <Switch 
                                    checked={!user.suspended}
                                    onCheckedChange={() => handleToggleSuspend(user, user.suspended)}
                                    disabled={isToggling === user.id}
                                    className={cn(
                                      "data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-200"
                                    )}
                                  />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile View: High-End Touchable Alumni Cards */}
                <div className="block md:hidden space-y-4 p-4 bg-slate-50/20">
                  {filteredAlumni.map((user) => {
                    const userStorage = storageMap[user.email.toLowerCase()] || 0
                    const isSuspended = user.suspended
                    return (
                      <div
                        key={user.id}
                        className={cn(
                          "relative p-5 rounded-xl border bg-white shadow-sm flex flex-col gap-4 border-slate-100 hover:shadow-md transition-all border-l-4",
                          isSuspended ? "border-l-red-500" : "border-l-emerald-500"
                        )}
                      >
                        {/* Card Header: Name & Email */}
                        <div className="flex items-start justify-between gap-3 text-left">
                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="font-bold text-[#191C1E] text-sm truncate max-w-[200px]">
                              {user.fullName || "Unknown Name"}
                            </span>
                            <span className="text-xs text-slate-400 font-medium font-mono truncate">
                              {user.email}
                            </span>
                          </div>
                          {isSelectionMode && (
                            <Checkbox
                              checked={selectedUserIds.has(user.id)}
                              onCheckedChange={() => toggleUserSelection(user.id)}
                              className="border-slate-350 w-5 h-5"
                            />
                          )}
                        </div>

                        {/* Card Body: Details */}
                        <div className="space-y-2.5 pt-2 border-t border-slate-100/60 text-left">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Account Created</span>
                            <span className="font-semibold text-slate-600">
                              {formatDate(user.creationTime)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Storage footprint</span>
                            <span className="font-semibold font-mono text-slate-600">
                              {formatBytes(userStorage)}
                            </span>
                          </div>
                        </div>

                        {/* Card Footer: Touch actions & active switch */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100/60">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestoreClick(user)}
                            disabled={isToggling === user.id || isRestoring}
                            className="h-8 text-xs font-bold text-slate-600 border-slate-200 bg-white hover:bg-slate-50 shrink-0"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Restore
                          </Button>

                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              isSuspended ? "text-red-500" : "text-emerald-500"
                            )}>
                              {isSuspended ? "Suspended" : "Active"}
                            </span>
                            <Switch 
                              checked={!isSuspended}
                              onCheckedChange={() => handleToggleSuspend(user, isSuspended)}
                              disabled={isToggling === user.id}
                              className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-200"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Restore Confirmation Dialog */}
      <AlertDialog open={isRestoreOpen} onOpenChange={setIsRestoreOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-slate-900">
              Restore Alumni Account?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-slate-500">
              Are you sure you want to restore <span className="font-bold text-slate-800">{userToRestore?.fullName}</span>? 
              This will move their account out of the Alumni Archive and place them in the root directory. 
              If their account is currently suspended, it will also be reactivated automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring} className="h-10 text-xs font-bold border-slate-200">
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={isRestoring}
              onClick={confirmRestoreUser}
              className="h-10 px-6 text-xs font-bold bg-slate-900 hover:bg-black text-white"
            >
              {isRestoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Restore
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Restore Confirmation Dialog */}
      <AlertDialog open={isBatchRestoreOpen} onOpenChange={setIsBatchRestoreOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-slate-900">
              Restore Selected Alumni?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-slate-500">
              Are you sure you want to restore the {selectedUserIds.size} selected alumni user(s)? 
              This will move their accounts out of the Alumni Archive and place them in the root directory, reactivating any suspended accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring} className="h-10 text-xs font-bold border-slate-200">
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={isRestoring}
              onClick={handleBatchRestore}
              className="h-10 px-6 text-xs font-bold bg-[#191C1E] hover:bg-black text-white"
            >
              {isRestoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Restore
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Suspend Confirmation Dialog */}
      <AlertDialog open={isBatchSuspendOpen} onOpenChange={setIsBatchSuspendOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-slate-900">
              Suspend Selected Alumni?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-slate-500">
              Are you sure you want to suspend the {selectedUserIds.size} selected alumni user(s)? 
              They will lose access to all Google Workspace services.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring} className="h-10 text-xs font-bold border-slate-200">
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={isRestoring}
              onClick={() => handleBatchSuspend(true)}
              className="h-10 px-6 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isRestoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Suspend
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Reactivate Confirmation Dialog */}
      <AlertDialog open={isBatchReactivateOpen} onOpenChange={setIsBatchReactivateOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-slate-900">
              Reactivate Selected Alumni?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-slate-500">
              Are you sure you want to reactivate the {selectedUserIds.size} selected alumni user(s)? 
              Their access to Google Workspace services will be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring} className="h-10 text-xs font-bold border-slate-200">
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={isRestoring}
              onClick={() => handleBatchSuspend(false)}
              className="h-10 px-6 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isRestoring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Reactivate
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardShell>
  )
}
