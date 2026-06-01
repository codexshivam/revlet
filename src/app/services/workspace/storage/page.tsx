"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useToast } from "@/hooks/use-toast"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { getUserStorageReport, listUsers, listOrgUnits } from "@/app/actions/google-workspace"
import type { StorageUsageEntry } from "@/app/actions/google-workspace"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Loader2,
  HardDrive,
  Info,
  ExternalLink,
  Globe,
  FolderTree,
  Users,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
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

function formatType(path: string | undefined | null): string {
  if (!path || path === "/" || path.toLowerCase() === "root") return "None"
  return path.startsWith("/") ? path.substring(1) : path
}

function bytesToUnit(bytes: number, unit: string): number {
  const divisors: Record<string, number> = {
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  }
  return parseFloat((bytes / (divisors[unit] || 1)).toFixed(2))
}

function unitToBytes(value: number, unit: string): number {
  const multipliers: Record<string, number> = {
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  }
  return Math.round(value * (multipliers[unit] || 1))
}

// ─── Chart Colors ────────────────────────────────────────────────────────────

const OU_COLORS: Record<string, string> = {
  "/Students": "#4F46E5", // Premium Indigo
  "/Teachers": "#10B981", // Premium Emerald
  "/Main People": "#8B5CF6", // Premium Violet
  "/Staffs": "#F59E0B", // Premium Amber
}

const FALLBACK_COLORS = [
  "#06B6D4", // Cyan
  "#EC4899", // Pink
  "#3B82F6", // Blue
  "#EF4444", // Red
  "#14B8A6", // Teal
  "#F97316", // Orange
]

function getOUColor(ouPath: string, index: number): string {
  return OU_COLORS[ouPath] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

function getInitials(email: string, name?: string): string {
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function getAvatarBg(email: string): string {
  const colors = [
    "bg-indigo-50 text-indigo-600 border-indigo-100",
    "bg-emerald-50 text-emerald-600 border-emerald-100",
    "bg-violet-50 text-violet-600 border-violet-100",
    "bg-amber-50 text-amber-600 border-amber-100",
    "bg-cyan-50 text-cyan-600 border-cyan-100",
    "bg-rose-50 text-rose-600 border-rose-100",
  ];
  let sum = 0;
  for (let i = 0; i < email.length; i++) sum += email.charCodeAt(i);
  return colors[sum % colors.length];
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface OUAggregation {
  ouPath: string
  ouName: string
  userCount: number
  totalUsedBytes: number
  averageUsedBytes: number
  users: Array<{ email: string; usedBytes: number; totalBytes: number }>
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomPieTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0]
    return (
      <div className="rounded-lg border bg-white px-3 py-2 shadow-md">
        <p className="text-xs font-semibold text-slate-700">{data.name}</p>
        <p className="text-xs text-slate-500">{formatBytes(data.value)}</p>
      </div>
    )
  }
  return null
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function StoragePage() {
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()
  const { toast } = useToast()

  // Data state
  const [storageEntries, setStorageEntries] = useState<StorageUsageEntry[]>([])
  const [userOUMap, setUserOUMap] = useState<Record<string, string>>({})
  const [userProfileMap, setUserProfileMap] = useState<Record<string, { fullName: string; thumbnailPhotoUrl?: string }>>({})
  const [orgUnits, setOrgUnits] = useState<Array<{ orgUnitPath: string; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)

  const adminEmail = selectedOrg?.workspaceAdminEmail || ""

  // ─── Load Data ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!adminEmail || !selectedOrgId) return

    setIsLoading(true)
    try {
      const [storageRes, usersRes, ouRes] = await Promise.all([
        getUserStorageReport(adminEmail),
        listUsers(adminEmail, { maxResults: 500 }),
        listOrgUnits(adminEmail),
      ])

      if (storageRes.success && storageRes.data) {
        setStorageEntries(storageRes.data)
      }

      if (usersRes.success && usersRes.data) {
        const mapping: Record<string, string> = {}
        const profiles: Record<string, { fullName: string; thumbnailPhotoUrl?: string }> = {}
        for (const u of usersRes.data.users) {
          mapping[u.email] = u.orgUnitPath
          profiles[u.email] = {
            fullName: u.fullName,
            thumbnailPhotoUrl: u.thumbnailPhotoUrl,
          }
        }
        setUserOUMap(mapping)
        setUserProfileMap(profiles)
      }

      if (ouRes.success && ouRes.data) {
        setOrgUnits(
          ouRes.data.map((ou) => ({
            orgUnitPath: ou.orgUnitPath,
            name: ou.name,
          }))
        )
      }
    } catch (err: any) {
      toast({
        title: "Failed to load storage data",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [adminEmail, selectedOrgId, toast])

  useEffect(() => {
    if (selectedOrg?.workspaceStatus === "active" && adminEmail) {
      loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrg?.workspaceStatus, adminEmail])

  // ─── Aggregations ────────────────────────────────────────────────────────

  const ouAggregations = useMemo((): OUAggregation[] => {
    const map: Record<string, OUAggregation> = {}

    // First initialize map with all OUs from orgUnits with proper user counts
    for (const ou of orgUnits) {
      // Calculate how many users are actually in this OU from userOUMap
      const count = Object.values(userOUMap).filter(path => path === ou.orgUnitPath).length
      map[ou.orgUnitPath] = {
        ouPath: ou.orgUnitPath,
        ouName: formatType(ou.name),
        userCount: count,
        totalUsedBytes: 0,
        averageUsedBytes: 0,
        users: [],
      }
    }

    // Always ensure root OU is accounted for if not present
    if (!map["/"]) {
      const count = Object.values(userOUMap).filter(path => path === "/").length
      map["/"] = {
        ouPath: "/",
        ouName: "Root",
        userCount: count,
        totalUsedBytes: 0,
        averageUsedBytes: 0,
        users: [],
      }
    }

    // Now populate with storage entries
    for (const entry of storageEntries) {
      const ouPath = userOUMap[entry.email] || "/"
      if (!map[ouPath]) {
        map[ouPath] = {
          ouPath,
          ouName: formatType(ouPath),
          userCount: 0,
          totalUsedBytes: 0,
          averageUsedBytes: 0,
          users: [],
        }
      }
      map[ouPath].totalUsedBytes += entry.usedBytes
      map[ouPath].users.push({
        email: entry.email,
        usedBytes: entry.usedBytes,
        totalBytes: entry.totalBytes,
      })
    }

    for (const agg of Object.values(map)) {
      // The average is calculated based on the actual number of users in this OU
      agg.averageUsedBytes = agg.userCount > 0 ? Math.round(agg.totalUsedBytes / agg.userCount) : 0
    }

    return Object.values(map).sort((a, b) => b.totalUsedBytes - a.totalUsedBytes)
  }, [storageEntries, userOUMap, orgUnits])

  const totalUsedBytes = useMemo(
    () => storageEntries.reduce((sum, e) => sum + e.usedBytes, 0),
    [storageEntries]
  )

  const topConsumers = useMemo(() => {
    return [...storageEntries].sort((a, b) => b.usedBytes - a.usedBytes).slice(0, 10)
  }, [storageEntries])

  const maxConsumerBytes = useMemo(
    () => (topConsumers.length > 0 ? topConsumers[0].usedBytes : 1),
    [topConsumers]
  )

  const pieData = useMemo(
    () =>
      ouAggregations
        .filter((ou) => ou.totalUsedBytes > 0)
        .map((ou) => ({
          name: ou.ouName,
          value: ou.totalUsedBytes,
          ouPath: ou.ouPath,
        })),
    [ouAggregations]
  )



  // ─── Loading State ───────────────────────────────────────────────────────

  if (isLoadingOrgs) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    )
  }

  // ─── No Org State ────────────────────────────────────────────────────────

  if (!selectedOrg || orgs.length === 0) {
    return (
      <DashboardShell>
        <div className="animate-in fade-in duration-500">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Google Workspace
          </span>
          <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Storage</h1>

          <Card className="mt-8 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Globe className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No Organization Found</h3>
              <p className="text-sm text-slate-500 mb-4 max-w-md">
                Create an organization first to manage Google Workspace storage.
              </p>
              <Button asChild>
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
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Google Workspace</span>
            <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Storage</h1>
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

  if (selectedOrg?.workspaceStatus !== "active") {
    return (
      <DashboardShell>
        <div className="animate-in fade-in duration-500">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Google Workspace
          </span>
          <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Storage</h1>

          <Card className="mt-8">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <HardDrive className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Workspace Activation Required</h3>
              <p className="text-sm text-slate-500 mb-4 max-w-md">
                Google Workspace must be connected and active before you can manage storage.
                Please activate your workspace integration first.
              </p>
              <Badge variant="outline" className="text-[9px] font-bold px-2 py-0.5 border shadow-none">
                Status: {selectedOrg?.workspaceStatus || "none"}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

  // ─── Main Render ─────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      <div className="animate-in fade-in duration-500 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Google Workspace
            </span>
            <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Storage</h1>
          </div>
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

        {/* Info Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-left animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-800 leading-relaxed font-medium">
              Storage quotas shown here are tracking targets. To enforce hard limits across your domain, please visit{" "}
              <span className="font-semibold">
                Google Admin Console → Storage → Storage Settings
              </span>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 shrink-0">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white hover:bg-blue-100/50 text-blue-700 hover:text-blue-700 border-blue-200 font-bold text-xs flex-1 sm:flex-initial justify-center gap-1.5 shadow-none transition-colors">
                  <HelpCircle className="w-3.5 h-3.5" />
                  How to Configure
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md md:max-w-lg select-none text-left border-slate-200">
                <DialogHeader>
                  <DialogTitle className="text-lg font-headline font-bold text-slate-900 flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-blue-600" />
                    Enforcing Storage Limits in Google Workspace
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 font-semibold leading-relaxed mt-1">
                    Revlet tracks and alerts based on policies you define here. To physically prevent users from exceeding limits, you must enforce them in your Google Admin Console.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-3.5">
                    {/* Step 1 */}
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold shrink-0 mt-0.5">
                        1
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800">Log in to Google Admin</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-medium">
                          Go to <a href="https://admin.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline font-bold">admin.google.com</a> and sign in with your Domain Super Admin account.
                        </p>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold shrink-0 mt-0.5">
                        2
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800">Navigate to Storage Settings</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-medium">
                          From the left sidebar menu, expand **Storage** and select **Storage settings** (or click the shortcut button on the banner).
                        </p>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold shrink-0 mt-0.5">
                        3
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800">Select Organizational Unit (OU)</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-medium">
                          In the left tree view panel, click on the target OU (e.g. `/Students` or `/Teachers`) to apply specific storage restrictions.
                        </p>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold shrink-0 mt-0.5">
                        4
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800">Set Storage Limits</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-medium">
                          Under **User storage limit**, select **On** and define the hard storage quota (e.g., 20 GB or 100 GB). Click **Save** (or **Override** if inheriting).
                        </p>
                      </div>
                    </div>

                    {/* Step 5 */}
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold shrink-0 mt-0.5">
                        5
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800">Track and Alert in Revlet</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-medium">
                          Return to this screen and configure the same quotas in the **Group-Level Allocation** panel to visually track compliance and flag users in near real-time.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 mt-4 text-[10px] text-slate-500 leading-relaxed font-semibold">
                    ⚠️ <span className="font-extrabold text-slate-700">Notice:</span> Changes applied in the Google Admin Console can take up to 24 hours to propagate across your Google Workspace domain.
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" className="bg-white hover:bg-blue-100/50 text-blue-700 hover:text-blue-700 border-blue-200 font-bold text-xs flex-1 sm:flex-initial justify-center gap-1.5 shadow-none transition-colors" asChild>
              <a
                href="https://admin.google.com/ac/storage/settings"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Admin Console
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </Button>
          </div>
        </div>

        {/* Loading Data */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-slate-500">Loading storage data...</p>
          </div>
        ) : (
          <>
            {/* ─── Storage Overview Cards ─────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-bottom-4 duration-500">
              {/* Card 1: Total Storage */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5" />
                    Total Storage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-start">
                    <span className="text-3xl font-headline font-bold text-slate-900">
                      {formatBytes(totalUsedBytes)}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      used across {storageEntries.length} users
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Distribution by Type */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FolderTree className="w-3.5 h-3.5" />
                    Distribution by Type
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[200px] flex items-center justify-between gap-4 py-0">
                  {pieData.length === 0 ? (
                    <div className="flex items-center justify-center w-full h-full">
                      <p className="text-xs text-slate-400">No storage data available</p>
                    </div>
                  ) : (
                    <>
                      {/* Donut Chart Container */}
                      <div className="w-[45%] h-full relative flex items-center justify-center shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={65}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell
                                  key={entry.ouPath}
                                  fill={getOUColor(entry.ouPath, index)}
                                  stroke="none"
                                />
                              ))}
                            </Pie>
                            <Tooltip content={<CustomPieTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Center count of OUs with data */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">OUs</span>
                          <span className="text-sm font-extrabold text-slate-800 leading-none">{pieData.length}</span>
                        </div>
                      </div>

                      {/* Custom Dynamic Scrollable Legend */}
                      <div className="flex-1 max-h-[170px] overflow-y-auto space-y-2 pr-1 custom-scrollbar text-left select-none">
                        {pieData.map((entry, index) => {
                          const color = getOUColor(entry.ouPath, index);
                          const pct = totalUsedBytes > 0 ? ((entry.value / totalUsedBytes) * 100).toFixed(1) : "0";
                          return (
                            <div key={entry.ouPath} className="flex items-start gap-2 hover:bg-slate-50 p-1.5 rounded-lg transition-colors duration-150">
                              <span
                                className="w-2.5 h-2.5 rounded-full mt-1 shrink-0 shadow-sm border border-white"
                                style={{ backgroundColor: color }}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-slate-800 truncate leading-tight">
                                  {entry.name}
                                </p>
                                <p className="text-[9px] text-slate-500 font-semibold leading-none mt-0.5">
                                  {formatBytes(entry.value)} <span className="text-slate-400 font-medium">({pct}%)</span>
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Card 3: Top Consumers */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Top Consumers
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4">
                  {topConsumers.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <p className="text-xs text-slate-400">No usage data available</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar text-left select-none">
                      {topConsumers.map((entry, idx) => {
                        const barWidth = Math.max(5, (entry.usedBytes / maxConsumerBytes) * 100)
                        const profile = userProfileMap[entry.email]
                        const name = profile?.fullName || entry.email.split("@")[0]
                        const avatarClass = getAvatarBg(entry.email)
                        const initials = getInitials(entry.email, profile?.fullName)

                        return (
                          <div key={entry.email} className="group flex items-center gap-3 p-1 rounded-lg hover:bg-slate-50 transition-all duration-200">
                            <span className="text-[10px] font-mono font-bold text-slate-400 w-4 text-right shrink-0">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            
                            {/* Avatar Initials Bubble */}
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-extrabold shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105 ${avatarClass}`}>
                              {initials}
                            </div>

                            {/* Consumer Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-primary transition-colors">
                                  {name}
                                </h4>
                                <span className="text-[10px] font-bold text-slate-700 shrink-0 font-mono">
                                  {formatBytes(entry.usedBytes)}
                                </span>
                              </div>
                              <p className="text-[9px] text-slate-400 truncate mt-0.5">
                                {entry.email}
                              </p>
                              {/* Sleek Line Indicator */}
                              <div className="w-full h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all duration-500"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ─── Group-Level Usage Table ──────────────────────────── */}
            <Card className="animate-in slide-in-from-bottom-4 duration-500 delay-150">
              <CardHeader>
                <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Group-Level Storage Usage
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ouAggregations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertTriangle className="w-8 h-8 text-slate-300 mb-3" />
                    <p className="text-sm text-slate-500">
                      No user types found. Create organizational units in Google Admin Console to view storage usage.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 text-left">
                    {/* Desktop View: Storage Table */}
                    <div className="hidden md:block rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80">
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              Type Name
                            </TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-32">
                              Users
                            </TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-64">
                              Total Storage Used
                            </TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-48">
                              Current Avg Usage
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ouAggregations.map((agg, index) => {
                            const color = getOUColor(agg.ouPath, index)

                            return (
                              <TableRow key={agg.ouPath} className="group">
                                {/* Type Name */}
                                <TableCell>
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: color }}
                                    />
                                    <div>
                                      <p className="text-sm font-medium text-slate-800">{agg.ouName}</p>
                                      <p className="text-[10px] text-slate-400 font-mono">{formatType(agg.ouPath)}</p>
                                    </div>
                                  </div>
                                </TableCell>

                                {/* User Count */}
                                <TableCell className="text-center">
                                  <span className="text-sm font-semibold text-slate-700">{agg.userCount}</span>
                                </TableCell>

                                {/* Total Storage Used */}
                                <TableCell>
                                  <div className="space-y-1">
                                    <span className="text-sm font-medium text-slate-700">
                                      {formatBytes(agg.totalUsedBytes)}
                                    </span>
                                    <Progress
                                      value={totalUsedBytes > 0 ? (agg.totalUsedBytes / totalUsedBytes) * 100 : 0}
                                      className="h-1.5"
                                    />
                                  </div>
                                </TableCell>

                                {/* Current Avg Usage */}
                                <TableCell>
                                  <span className="text-sm font-medium text-slate-700">
                                    {formatBytes(agg.averageUsedBytes)}
                                  </span>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile View: High-End Touchable Storage Cards */}
                    <div className="block md:hidden space-y-4">
                      {ouAggregations.map((agg, index) => {
                        const color = getOUColor(agg.ouPath, index)
                        const pct = totalUsedBytes > 0 ? (agg.totalUsedBytes / totalUsedBytes) * 100 : 0

                        return (
                          <div
                            key={agg.ouPath}
                            className="p-5 rounded-xl border bg-white border-slate-100 shadow-sm space-y-4 hover:shadow-md transition-all"
                          >
                            {/* Header row */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <div className="min-w-0">
                                  <h4 className="text-sm font-bold text-slate-800 truncate">{agg.ouName}</h4>
                                  <p className="text-[10px] text-slate-400 font-mono truncate">{formatType(agg.ouPath)}</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-[9px] font-bold bg-slate-50 border-slate-200 text-slate-500 rounded-md px-2 py-0.5 shadow-none shrink-0 uppercase tracking-wider">
                                {agg.userCount} Users
                              </Badge>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Total Used</span>
                                <span className="font-bold text-slate-800">{formatBytes(agg.totalUsedBytes)}</span>
                              </div>
                              <Progress value={pct} className="h-2 bg-slate-100" />
                            </div>

                            {/* Average usage info */}
                            <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100/60">
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Average Usage</span>
                              <span className="font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-2 py-0.5">
                                {formatBytes(agg.averageUsedBytes)} / user
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
