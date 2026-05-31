"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useUser, useFirestore } from "@/firebase"
import { useToast } from "@/hooks/use-toast"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { getUserStorageReport, listUsers, listOrgUnits } from "@/app/actions/google-workspace"
import type { StorageUsageEntry } from "@/app/actions/google-workspace"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Loader2,
  HardDrive,
  Info,
  ExternalLink,
  Globe,
  FolderTree,
  Users,
  TrendingUp,
  Save,
  AlertTriangle,
  AlertCircle,
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
  "/Students": "#3b82f6",
  "/Teachers": "#10b981",
  "/Main People": "#8b5cf6",
  "/Staffs": "#f59e0b",
}

const FALLBACK_COLORS = ["#06b6d4", "#ec4899", "#f97316", "#6366f1", "#14b8a6", "#e11d48"]

function getOUColor(ouPath: string, index: number): string {
  return OU_COLORS[ouPath] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface OUPolicy {
  quotaValue: number
  quotaUnit: string
}

interface OUAggregation {
  ouPath: string
  ouName: string
  userCount: number
  totalUsedBytes: number
  averageUsedBytes: number
  users: Array<{ email: string; usedBytes: number; totalBytes: number }>
}

interface StoragePoliciesDoc {
  ownerId: string
  orgId: string
  policies: Record<string, { quotaBytes: number }>
  updatedAt: any
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

export default function StoragePoliciesPage() {
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()
  const { user } = useUser()
  const db = useFirestore()
  const { toast } = useToast()

  // Data state
  const [storageEntries, setStorageEntries] = useState<StorageUsageEntry[]>([])
  const [userOUMap, setUserOUMap] = useState<Record<string, string>>({})
  const [orgUnits, setOrgUnits] = useState<Array<{ orgUnitPath: string; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Policy state
  const [policies, setPolicies] = useState<Record<string, OUPolicy>>({})
  const [policiesLoaded, setPoliciesLoaded] = useState(false)

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
        for (const u of usersRes.data.users) {
          mapping[u.email] = u.orgUnitPath
        }
        setUserOUMap(mapping)
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

  // ─── Load Firestore Policies ─────────────────────────────────────────────

  const loadPolicies = useCallback(async () => {
    if (!selectedOrgId || !db) return

    try {
      const docRef = doc(db, "workspaceStoragePolicies", selectedOrgId)
      const snap = await getDoc(docRef)

      if (snap.exists()) {
        const data = snap.data() as StoragePoliciesDoc
        const loadedPolicies: Record<string, OUPolicy> = {}
        for (const [ouPath, policy] of Object.entries(data.policies || {})) {
          const bytes = policy.quotaBytes
          let unit = "GB"
          let value = bytesToUnit(bytes, "GB")
          if (bytes >= 1024 * 1024 * 1024 * 1024) {
            unit = "TB"
            value = bytesToUnit(bytes, "TB")
          } else if (bytes < 1024 * 1024 * 1024) {
            unit = "MB"
            value = bytesToUnit(bytes, "MB")
          }
          loadedPolicies[ouPath] = { quotaValue: value, quotaUnit: unit }
        }
        setPolicies(loadedPolicies)
      }
      setPoliciesLoaded(true)
    } catch (err: any) {
      console.error("Failed to load policies:", err)
      setPoliciesLoaded(true)
    }
  }, [selectedOrgId, db])

  useEffect(() => {
    if (selectedOrg?.workspaceStatus === "active" && adminEmail) {
      loadData()
      loadPolicies()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrg?.workspaceStatus, adminEmail])

  // ─── Aggregations ────────────────────────────────────────────────────────

  const ouAggregations = useMemo((): OUAggregation[] => {
    const map: Record<string, OUAggregation> = {}

    for (const entry of storageEntries) {
      const ouPath = userOUMap[entry.email] || "/"
      if (!map[ouPath]) {
        const ouInfo = orgUnits.find((ou) => ou.orgUnitPath === ouPath)
        map[ouPath] = {
          ouPath,
          ouName: ouInfo?.name ? formatType(ouInfo.name) : formatType(ouPath),
          userCount: 0,
          totalUsedBytes: 0,
          averageUsedBytes: 0,
          users: [],
        }
      }
      map[ouPath].userCount += 1
      map[ouPath].totalUsedBytes += entry.usedBytes
      map[ouPath].users.push({
        email: entry.email,
        usedBytes: entry.usedBytes,
        totalBytes: entry.totalBytes,
      })
    }

    for (const agg of Object.values(map)) {
      agg.averageUsedBytes = agg.userCount > 0 ? Math.round(agg.totalUsedBytes / agg.userCount) : 0
    }

    // Also add any OUs from the listOrgUnits that have no storage entries
    for (const ou of orgUnits) {
      if (!map[ou.orgUnitPath]) {
        map[ou.orgUnitPath] = {
          ouPath: ou.orgUnitPath,
          ouName: formatType(ou.name),
          userCount: 0,
          totalUsedBytes: 0,
          averageUsedBytes: 0,
          users: [],
        }
      }
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

  // ─── Policy Handlers ────────────────────────────────────────────────────

  function getOUPolicy(ouPath: string): OUPolicy {
    return policies[ouPath] || { quotaValue: 15, quotaUnit: "GB" }
  }

  function updatePolicy(ouPath: string, field: keyof OUPolicy, value: number | string) {
    setPolicies((prev) => ({
      ...prev,
      [ouPath]: {
        ...getOUPolicy(ouPath),
        [field]: value,
      },
    }))
  }

  async function savePolicies() {
    if (!selectedOrgId || !user) return

    setIsSaving(true)
    try {
      const firestorePolicies: Record<string, { quotaBytes: number }> = {}
      for (const agg of ouAggregations) {
        const policy = getOUPolicy(agg.ouPath)
        firestorePolicies[agg.ouPath] = {
          quotaBytes: unitToBytes(policy.quotaValue, policy.quotaUnit),
        }
      }

      const docRef = doc(db, "workspaceStoragePolicies", selectedOrgId)
      await setDoc(docRef, {
        ownerId: user.uid,
        orgId: selectedOrgId,
        policies: firestorePolicies,
        updatedAt: serverTimestamp(),
      })

      toast({
        title: "Policies saved",
        description: "Storage tracking policies have been saved successfully.",
      })
    } catch (err: any) {
      toast({
        title: "Failed to save policies",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  function getStatusInfo(avgUsedBytes: number, ouPath: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string } {
    const policy = getOUPolicy(ouPath)
    const quotaBytes = unitToBytes(policy.quotaValue, policy.quotaUnit)
    if (quotaBytes === 0) return { label: "No Quota", variant: "outline", color: "text-slate-500" }
    const pct = (avgUsedBytes / quotaBytes) * 100
    if (pct >= 80) return { label: "Critical", variant: "destructive", color: "text-red-600" }
    if (pct >= 50) return { label: "Moderate", variant: "secondary", color: "text-amber-600" }
    return { label: "Healthy", variant: "default", color: "text-emerald-600" }
  }

  function getUsagePercent(avgUsedBytes: number, ouPath: string): number {
    const policy = getOUPolicy(ouPath)
    const quotaBytes = unitToBytes(policy.quotaValue, policy.quotaUnit)
    if (quotaBytes === 0) return 0
    return Math.min(100, (avgUsedBytes / quotaBytes) * 100)
  }

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
          <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Storage Policies</h1>

          <Card className="mt-8 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Globe className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">No Organization Found</h3>
              <p className="text-sm text-slate-500 mb-4 max-w-md">
                Create an organization first to manage Google Workspace storage policies.
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
            <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Storage Policies</h1>
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
          <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Storage Policies</h1>

          <Card className="mt-8">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <HardDrive className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Workspace Activation Required</h3>
              <p className="text-sm text-slate-500 mb-4 max-w-md">
                Google Workspace must be connected and active before you can manage storage policies.
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
            <h1 className="text-3xl font-headline font-bold text-slate-900 mt-1">Storage Policies</h1>
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
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-blue-800">
              Storage quotas shown here are tracking targets. To enforce limits, configure them in{" "}
              <span className="font-semibold">
                Google Admin Console → Storage → Storage Settings
              </span>
              .
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 text-blue-700 border-blue-300 hover:bg-blue-100" asChild>
            <a
              href="https://admin.google.com/ac/storage/settings"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Admin Console
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </Button>
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
              {/* Card 1: Total Pool */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5" />
                    Total Pool
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
                <CardContent>
                  {pieData.length === 0 ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <p className="text-xs text-slate-400">No storage data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
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
                        <Legend
                          formatter={(value: string) => (
                            <span className="text-[10px] text-slate-600">{value}</span>
                          )}
                          iconSize={8}
                          wrapperStyle={{ fontSize: 10 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
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
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                      {topConsumers.map((entry, idx) => {
                        const barWidth = Math.max(5, (entry.usedBytes / maxConsumerBytes) * 100)
                        return (
                          <div key={entry.email} className="flex items-center gap-2">
                            <span className="text-[9px] font-mono text-slate-400 w-4 text-right shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-slate-700 truncate leading-tight">
                                {entry.email}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                                <span className="text-[9px] font-medium text-slate-500 shrink-0 w-14 text-right">
                                  {formatBytes(entry.usedBytes)}
                                </span>
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

            {/* ─── Group-Level Allocation Table ──────────────────────────── */}
            <Card className="animate-in slide-in-from-bottom-4 duration-500 delay-150">
              <CardHeader>
                <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Group-Level Storage Allocation
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ouAggregations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertTriangle className="w-8 h-8 text-slate-300 mb-3" />
                    <p className="text-sm text-slate-500">
                      No user types found. Create organizational units in Google Admin Console to manage group policies.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80">
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              Type Name
                            </TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-24">
                              Users
                            </TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-56">
                              Target Quota
                            </TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-40">
                              Current Avg Usage
                            </TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-28">
                              Status
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ouAggregations.map((agg, index) => {
                            const policy = getOUPolicy(agg.ouPath)
                            const status = getStatusInfo(agg.averageUsedBytes, agg.ouPath)
                            const usagePct = getUsagePercent(agg.averageUsedBytes, agg.ouPath)
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

                                {/* Target Quota */}
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      value={policy.quotaValue}
                                      onChange={(e) =>
                                        updatePolicy(agg.ouPath, "quotaValue", parseFloat(e.target.value) || 0)
                                      }
                                      className="w-24 h-8 text-sm"
                                    />
                                    <Select
                                      value={policy.quotaUnit}
                                      onValueChange={(val) => updatePolicy(agg.ouPath, "quotaUnit", val)}
                                    >
                                      <SelectTrigger className="w-20 h-8 text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="MB">MB</SelectItem>
                                        <SelectItem value="GB">GB</SelectItem>
                                        <SelectItem value="TB">TB</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </TableCell>

                                {/* Current Avg Usage + Progress */}
                                <TableCell>
                                  <div className="space-y-1">
                                    <span className="text-sm font-medium text-slate-700">
                                      {formatBytes(agg.averageUsedBytes)}
                                    </span>
                                    <Progress
                                      value={usagePct}
                                      className="h-1.5"
                                    />
                                  </div>
                                </TableCell>

                                {/* Status Badge */}
                                <TableCell className="text-center">
                                  <Badge
                                    variant={status.variant}
                                    className={`text-[9px] font-bold px-2 py-0.5 border shadow-none ${
                                      status.label === "Healthy"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : status.label === "Moderate"
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : status.label === "Critical"
                                        ? "bg-red-50 text-red-700 border-red-200"
                                        : ""
                                    }`}
                                  >
                                    {status.label}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end mt-4">
                      <Button onClick={savePolicies} disabled={isSaving} className="gap-2">
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {isSaving ? "Saving..." : "Save Policies"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
