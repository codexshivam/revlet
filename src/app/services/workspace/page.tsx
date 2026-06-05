"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useUser, useFirestore } from "@/firebase"
import { doc, updateDoc, serverTimestamp } from "firebase/firestore"
import Link from "next/link"
import { useActiveOrg } from "@/hooks/use-active-org"
import {
  Loader2,
  Globe,
  Users,
  HardDrive,
  ShieldAlert,
  Settings,
  GraduationCap,
  BookOpen,
  UserCog,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  ExternalLink,
  ArrowRight,
  Clock,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react"
import {
  checkWorkspaceStatus,
  getUserCountsByOU,
  getUserStorageReport,
  getAuditLogs,
  listAlerts,
  listOrgUnits,
  createOrgUnit,
  listUsers,
} from "@/app/actions/google-workspace"
import type { WorkspaceAlert } from "@/app/actions/google-workspace"

// ─── Types ───────────────────────────────────────────────────────────────────

type OUCounts = Record<string, { total: number; active: number; suspended: number }>

type AuditLogEntry = {
  id: string
  time: string
  actorEmail: string
  eventName: string
  eventType: string
  ipAddress: string
  parameters: { name: string; value: string }[]
}

type MergedAlertEntry = {
  id: string
  severity: "CRITICAL" | "WARNING" | "INFO"
  name: string
  actor: string
  time: string
  source: "alert" | "audit"
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(2)} ${sizes[i]}`
}

function formatTimestamp(iso: string): string {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

function mapAlertSeverity(raw: string): "CRITICAL" | "WARNING" | "INFO" {
  const upper = (raw || "").toUpperCase()
  if (upper.includes("HIGH") || upper.includes("CRITICAL")) return "CRITICAL"
  if (upper.includes("MEDIUM") || upper.includes("WARN")) return "WARNING"
  return "INFO"
}

function severityBadgeClass(severity: "CRITICAL" | "WARNING" | "INFO"): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-50 text-red-600 border-red-100"
    case "WARNING":
      return "bg-amber-50 text-amber-600 border-amber-100"
    case "INFO":
      return "bg-blue-50 text-blue-600 border-blue-100"
  }
}

// ─── OU Card Config ──────────────────────────────────────────────────────────

const OU_CONFIG = [
  {
    path: "/Students",
    label: "Students",
    icon: GraduationCap,
    color: "bg-blue-50/50 hover:bg-blue-50 border-blue-100 hover:border-blue-200",
    iconColor: "text-blue-600",
    badgeColor: "bg-blue-50 text-blue-600 border-blue-100",
    accentBg: "bg-blue-100",
  },
  {
    path: "/Teachers",
    label: "Teachers",
    icon: BookOpen,
    color: "bg-emerald-50/50 hover:bg-emerald-50 border-emerald-100 hover:border-emerald-200",
    iconColor: "text-emerald-600",
    badgeColor: "bg-emerald-50 text-emerald-600 border-emerald-100",
    accentBg: "bg-emerald-100",
  },
  {
    path: "/Main People",
    label: "Main People",
    icon: UserCog,
    color: "bg-purple-50/50 hover:bg-purple-50 border-purple-100 hover:border-purple-200",
    iconColor: "text-purple-600",
    badgeColor: "bg-purple-50 text-purple-600 border-purple-100",
    accentBg: "bg-purple-100",
  },
  {
    path: "/Staffs",
    label: "Staffs",
    icon: Users,
    color: "bg-amber-50/50 hover:bg-amber-50 border-amber-100 hover:border-amber-200",
    iconColor: "text-amber-600",
    badgeColor: "bg-amber-50 text-amber-600 border-amber-100",
    accentBg: "bg-amber-100",
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function GoogleWorkspacePage() {
  const { toast } = useToast()
  const { user } = useUser()
  const db = useFirestore()
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()

  // Enrollment dialog
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false)
  const [adminEmail, setAdminEmail] = useState("")
  const [isApplying, setIsApplying] = useState(false)
  const [showSetupGuide, setShowSetupGuide] = useState(false)
  const [copiedClientId, setCopiedClientId] = useState(false)
  const [copiedScopes, setCopiedScopes] = useState(false)

  const handleCopyClientId = () => {
    navigator.clipboard.writeText("105450959878009279492")
    setCopiedClientId(true)
    toast({
      title: "Copied",
      description: "Client ID copied to clipboard.",
    })
    setTimeout(() => setCopiedClientId(false), 2000)
  }

  const handleCopyScopes = () => {
    const scopes = "https://www.googleapis.com/auth/admin.directory.user, https://www.googleapis.com/auth/admin.directory.orgunit, https://www.googleapis.com/auth/admin.directory.customer.readonly, https://www.googleapis.com/auth/admin.reports.audit.readonly, https://www.googleapis.com/auth/admin.reports.usage.readonly, https://www.googleapis.com/auth/apps.alerts"
    navigator.clipboard.writeText(scopes)
    setCopiedScopes(true)
    toast({
      title: "Copied",
      description: "OAuth scopes copied to clipboard.",
    })
    setTimeout(() => setCopiedScopes(false), 2000)
  }

  // Pending verification
  const [isVerifying, setIsVerifying] = useState(false)

  // Active dashboard data
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [ouCounts, setOuCounts] = useState<OUCounts>({})
  const [missingOUs, setMissingOUs] = useState<string[]>([])
  const [storageUsed, setStorageUsed] = useState(0)
  const [storageTotal, setStorageTotal] = useState(0)
  const [storageByOU, setStorageByOU] = useState<Record<string, number>>({})
  const [mergedAlerts, setMergedAlerts] = useState<MergedAlertEntry[]>([])
  const [alertsError, setAlertsError] = useState<string | null>(null)

  // ─── Enrollment Handler ──────────────────────────────────────────────────

  const handleApply = async () => {
    if (!adminEmail.trim() || !selectedOrg || !user) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(adminEmail.trim())) {
      toast({
        variant: "destructive",
        title: "Invalid Email",
        description: "Please enter a valid super admin email address.",
      })
      return
    }

    setIsApplying(true)
    try {
      const res = await checkWorkspaceStatus(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", adminEmail.trim())
      if (!res.success) {
        throw new Error(res.error)
      }

      const orgRef = doc(db, "organizations", selectedOrg.id)
      await updateDoc(orgRef, {
        workspaceStatus: "pending",
        workspaceAdminEmail: adminEmail.trim(),
        workspaceCustomerId: res.data?.customerId || "",
        workspaceDomain: res.data?.customerDomain || "",
        workspaceAppliedAt: serverTimestamp(),
      })

      toast({
        title: "Application Submitted",
        description: "Your Google Workspace enrollment is now pending verification.",
      })

      setIsApplyDialogOpen(false)
      setAdminEmail("")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Enrollment Failed",
        description: error.message || "Could not verify your Google Workspace configuration.",
      })
    } finally {
      setIsApplying(false)
    }
  }

  // ─── Verification Handler ───────────────────────────────────────────────

  const handleVerify = async () => {
    if (!user || !selectedOrg?.workspaceAdminEmail || !selectedOrg?.id) return
    setIsVerifying(true)

    try {
      const res = await checkWorkspaceStatus(await user.getIdToken(), selectedOrgId || selectedOrg?.id)
      if (!res.success) {
        throw new Error(res.error)
      }

      const orgRef = doc(db, "organizations", selectedOrg.id)
      await updateDoc(orgRef, {
        workspaceStatus: "active",
        workspaceActivatedAt: serverTimestamp(),
      })

      toast({
        title: "Workspace Activated!",
        description: "Your Google Workspace integration is now live. Dashboard data is loading.",
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Verification Failed",
        description:
          error.message ||
          "Could not verify your workspace. Please ensure Domain-Wide Delegation is configured correctly and the admin email has Super Admin privileges.",
      })
    } finally {
      setIsVerifying(false)
    }
  }

  // ─── Dashboard Data Fetch ───────────────────────────────────────────────

  const fetchDashboardData = useCallback(async () => {
    if (!user || !selectedOrg?.workspaceAdminEmail || selectedOrg?.workspaceStatus !== "active") return
    setIsLoadingDashboard(true)
    setAlertsError(null)

    const email = selectedOrg.workspaceAdminEmail

    try {
      // Fetch all data in parallel with resilient error catch handlers
      const [ouListRes, countsRes, storageRes, auditRes, alertsRes, usersRes] = await Promise.all([
        listOrgUnits(await user.getIdToken(), selectedOrgId || selectedOrg?.id)
          .catch((err) => ({ success: false, error: err.message || "Failed to list OUs" })),
        getUserCountsByOU(await user.getIdToken(), selectedOrgId || selectedOrg?.id, ["/Students", "/Teachers", "/Main People", "/Staffs"])
          .catch((err) => ({ success: false, error: err.message || "Failed to fetch user counts" })),
        getUserStorageReport(await user.getIdToken(), selectedOrgId || selectedOrg?.id)
          .catch((err) => ({ success: false, error: err.message || "Failed to fetch storage report" })),
        getAuditLogs(await user.getIdToken(), selectedOrgId || selectedOrg?.id)
          .catch((err) => ({ success: false, error: err.message || "Failed to fetch audit logs" })),
        listAlerts(await user.getIdToken(), selectedOrgId || selectedOrg?.id)
          .catch((err) => ({ success: false, error: err.message || "Failed to fetch alerts" })),
        listUsers(await user.getIdToken(), selectedOrgId || selectedOrg?.id, { maxResults: 500 })
          .catch((err) => ({ success: false, error: err.message || "Failed to fetch users" })),
      ]) as [any, any, any, any, any, any]

      // Check for missing default organizational units to instruct user
      const missing: string[] = []
      if (ouListRes.success && ouListRes.data) {
        const existingPaths = new Set(ouListRes.data.map((ou: any) => ou.orgUnitPath))
        const defaults = ["Students", "Teachers", "Main People", "Staffs"]
        for (const name of defaults) {
          const expectedPath = `/${name}`
          if (!existingPaths.has(expectedPath)) {
            missing.push(name)
          }
        }
      }
      setMissingOUs(missing)

      // Process OU counts
      if (countsRes.success && countsRes.data) {
        setOuCounts(countsRes.data)
      } else {
        console.warn("[Google Workspace Dashboard] User counts load failed:", countsRes.error)
      }

      // Map users to OUs for storage aggregation
      let userOUMap: Record<string, string> = {}
      if (usersRes.success && usersRes.data) {
        const usersList = usersRes.data.users || []
        for (const u of usersList) {
          userOUMap[u.email] = u.orgUnitPath
        }
      }

      // Process storage
      if (storageRes.success && storageRes.data) {
        const entries = storageRes.data
        const totalUsed = entries.reduce((acc: number, e: { usedBytes: number }) => acc + e.usedBytes, 0)
        const totalPool = entries.reduce((acc: number, e: { totalBytes: number }) => acc + e.totalBytes, 0)
        setStorageUsed(totalUsed)
        setStorageTotal(totalPool)

        const ouStorage: Record<string, number> = {}
        for (const entry of entries) {
          const ouPath = userOUMap[entry.email] || "/"
          ouStorage[ouPath] = (ouStorage[ouPath] || 0) + entry.usedBytes
        }
        setStorageByOU(ouStorage)
      } else {
        console.warn("[Google Workspace Dashboard] Storage report load failed:", storageRes.error)
      }

      // Merge alerts and audit logs
      const merged: MergedAlertEntry[] = []

      // Process audit logs
      if (auditRes.success && auditRes.data) {
        const logs = auditRes.data as AuditLogEntry[]
        for (const log of logs) {
          merged.push({
            id: `audit-${log.id}`,
            severity: "INFO",
            name: log.eventName,
            actor: log.actorEmail,
            time: log.time,
            source: "audit",
          })
        }
      } else {
        console.warn("[Google Workspace Dashboard] Audit logs load failed:", auditRes.error)
      }

      // Process alerts
      if (alertsRes.success && alertsRes.data) {
        const alerts = alertsRes.data as WorkspaceAlert[]
        for (const alert of alerts) {
          merged.push({
            id: `alert-${alert.alertId}`,
            severity: mapAlertSeverity(alert.severity),
            name: alert.type,
            actor: alert.source,
            time: alert.createTime,
            source: "alert",
          })
        }
      } else {
        console.warn("[Google Workspace Dashboard] Alerts load failed:", alertsRes.error)
        setAlertsError(
          alertsRes.error || "Alert Center API is unavailable or pending authorization."
        )
      }

      // Sort by time descending
      merged.sort((a, b) => {
        const timeA = a.time ? new Date(a.time).getTime() : 0
        const timeB = b.time ? new Date(b.time).getTime() : 0
        return timeB - timeA
      })

      setMergedAlerts(merged)
    } catch (error: any) {
      console.error("Dashboard data fetch failed:", error)
      toast({
        variant: "destructive",
        title: "Data Sync Error",
        description: error.message || "Could not load workspace dashboard data.",
      })
    } finally {
      setIsLoadingDashboard(false)
    }
  }, [selectedOrg?.workspaceAdminEmail, selectedOrg?.workspaceStatus, toast])

  useEffect(() => {
    if (selectedOrg?.workspaceStatus === "active" && selectedOrg?.workspaceAdminEmail) {
      fetchDashboardData()
    }
  }, [selectedOrg?.workspaceStatus, selectedOrg?.workspaceAdminEmail, fetchDashboardData])

  // ─── Computed Values ────────────────────────────────────────────────────

  const storagePercent = storageTotal > 0 ? Math.min((storageUsed / storageTotal) * 100, 100) : 0
  const storageIndicatorColor =
    storagePercent >= 90 ? "bg-red-500" : storagePercent >= 75 ? "bg-amber-500" : "bg-primary"

  const allOUCountsZero =
    Object.keys(ouCounts).length > 0 &&
    Object.values(ouCounts).every((c) => c.total === 0)

  const workspaceStatus = selectedOrg?.workspaceStatus || "none"

  // ─── Loading State ──────────────────────────────────────────────────────

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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <DashboardShell className="max-w-7xl">
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Services</span>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Google Workspace</h1>
            <div className="flex items-center gap-2">
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
        </div>

        {/* STATE: No orgs */}
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
                    To manage Google Workspace services, you must first register your organization on the Account Home screen.
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

        /* STATE: Non-Educational Organization */
        ) : selectedOrg && !selectedOrg.isEducation ? (
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
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

        /* STATE 1: No Enrollment */
        ) : selectedOrg && (!workspaceStatus || workspaceStatus === "none") ? (
          <div className="max-w-6xl mx-auto py-8 px-4 md:px-6 animate-in slide-in-from-bottom-4 duration-500 w-full">
            <div className="space-y-12 text-center flex flex-col items-center">
              {/* Value Proposition Banner */}
              <div className="space-y-4 flex flex-col items-center max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-100 bg-blue-50/50 text-[10px] font-bold text-primary uppercase tracking-widest shadow-sm animate-pulse">
                  <Sparkles className="w-3 h-3 text-primary" />
                  Google Workspace for Education
                </div>
                <h2 className="text-2xl md:text-3xl font-headline font-bold text-slate-900 leading-tight">
                  Centralized Management for Your School Domain
                </h2>
                <p className="text-slate-500 text-xs md:text-sm leading-relaxed max-w-xl mx-auto">
                  Manage users, monitor storage, track security alerts, and control user types — all from one powerful dashboard connected to your Google Workspace for Education instance.
                </p>
              </div>

              {/* Feature Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto text-left w-full">
                {[
                  {
                    title: "User Management",
                    desc: "View and manage students, teachers, and staff across user types. Track active and suspended accounts in real-time.",
                    icon: Users,
                    color: "bg-blue-50/50 hover:bg-blue-50 text-blue-600 border-blue-100 hover:border-blue-200",
                  },
                  {
                    title: "Storage Control",
                    desc: "Monitor aggregate Google Drive storage usage across your domain. Get warnings when storage pools reach capacity thresholds.",
                    icon: HardDrive,
                    color: "bg-emerald-50/50 hover:bg-emerald-50 text-emerald-600 border-emerald-100 hover:border-emerald-200",
                  },
                  {
                    title: "Security Alerts",
                    desc: "Stay informed with real-time alerts from Google's Alert Center and detailed admin audit logs. Monitor suspicious activity instantly.",
                    icon: ShieldAlert,
                    color: "bg-purple-50/50 hover:bg-purple-50 text-purple-600 border-purple-100 hover:border-purple-200",
                  },
                  {
                    title: "Centralized Admin",
                    desc: "Quick-launch access to Google Admin Console with contextual links. Manage advanced settings without leaving your workflow.",
                    icon: Settings,
                    color: "bg-amber-50/50 hover:bg-amber-50 text-amber-600 border-amber-100 hover:border-amber-200",
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className={cn(
                      "p-5 rounded-xl border flex items-start gap-4 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 duration-200",
                      feature.color
                    )}
                  >
                    <div className="p-2.5 bg-white rounded-lg shadow-sm shrink-0 border border-slate-100/80">
                      <feature.icon className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs md:text-sm font-bold text-slate-800">{feature.title}</h4>
                      <p className="text-[11px] opacity-90 leading-relaxed font-medium text-slate-500">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <div className="pt-2 flex flex-col items-center">
                <Button
                  onClick={() => {
                    setAdminEmail("")
                    setIsApplyDialogOpen(true)
                  }}
                  size="default"
                  className="font-bold px-10 h-11 shadow-md shadow-primary/10 text-xs group bg-slate-900 hover:bg-black text-white rounded-lg transition-all"
                >
                  <GraduationCap className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                  Apply for Google Workspace
                </Button>
              </div>

              {/* Collapsible Setup Guide */}
              <div className="w-full max-w-3xl mt-4 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm transition-all duration-200">
                <button
                  type="button"
                  onClick={() => setShowSetupGuide(!showSetupGuide)}
                  className="w-full p-4 flex items-center justify-between bg-slate-50 border-b border-slate-200 hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2 text-left">
                    <Info className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Setup & Authorization Instructions (Required before activation)
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-semibold">
                    {showSetupGuide ? "Hide Steps" : "Show Steps"}
                  </span>
                </button>

                {showSetupGuide && (
                  <div className="p-6 text-left space-y-6 text-xs md:text-sm leading-relaxed border-t border-slate-100 bg-white">
                    <div className="space-y-4">
                      
                      {/* Step 1 */}
                      <div className="flex gap-3">
                        <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 shrink-0 text-[10px] mt-0.5">
                          1
                        </div>
                        <div className="space-y-1">
                          <h5 className="font-bold text-slate-800 font-headline">Open Google Admin Console</h5>
                          <p className="text-slate-500 font-medium leading-relaxed">
                            Log into the <a href="https://admin.google.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-bold inline-flex items-center gap-0.5">Google Admin Console <ExternalLink className="w-3 h-3" /></a> using a domain <strong className="text-slate-700">Super Admin</strong> account.
                          </p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex gap-3 pt-1">
                        <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 shrink-0 text-[10px] mt-0.5">
                          2
                        </div>
                        <div className="space-y-1">
                          <h5 className="font-bold text-slate-800 font-headline">Navigate to API Controls</h5>
                          <p className="text-slate-500 font-medium leading-relaxed">
                            Go to <strong className="text-slate-700">Security &rarr; Access and data control &rarr; API controls</strong> in the left sidebar navigation menu.
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex gap-3 pt-1">
                        <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 shrink-0 text-[10px] mt-0.5">
                          3
                        </div>
                        <div className="space-y-1">
                          <h5 className="font-bold text-slate-800 font-headline">Open Domain-Wide Delegation</h5>
                          <p className="text-slate-500 font-medium leading-relaxed">
                            Scroll down to the bottom of the page and click on <strong className="text-slate-700">Manage Domain-Wide Delegation</strong>.
                          </p>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="flex gap-3 pt-1">
                        <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 shrink-0 text-[10px] mt-0.5">
                          4
                        </div>
                        <div className="space-y-1">
                          <h5 className="font-bold text-slate-800 font-headline">Add a New API Client</h5>
                          <p className="text-slate-500 font-medium leading-relaxed">
                            Click the <strong className="text-slate-700">Add New</strong> button at the top of the delegation list.
                          </p>
                        </div>
                      </div>

                      {/* Step 5 */}
                      <div className="flex gap-3 pt-1">
                        <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 shrink-0 text-[10px] mt-0.5">
                          5
                        </div>
                        <div className="space-y-3 w-full">
                          <h5 className="font-bold text-slate-800 font-headline">Input Client ID & Scopes</h5>
                          <p className="text-slate-500 font-medium leading-relaxed">
                            Configure the API client using the following exact values. Click each copy button to copy the value to your clipboard:
                          </p>
                          
                          {/* Client ID field */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Client ID</span>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-md w-full">
                              <code className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded font-mono text-[10px] font-bold text-slate-700 select-all tracking-wide text-left block truncate">
                                105450959878009279492
                              </code>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleCopyClientId}
                                className="h-8 font-bold gap-1 text-[10px] shrink-0 border-slate-200 hover:bg-slate-50 active:scale-95 transition-all text-slate-600 hover:text-black bg-white w-full sm:w-auto justify-center"
                              >
                                {copiedClientId ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-500 animate-in fade-in" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                                    Copy
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* OAuth Scopes field */}
                          <div className="space-y-1 w-full">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">OAuth Scopes</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={handleCopyScopes}
                                className="h-6 font-bold gap-1 text-[9px] text-slate-500 hover:text-black px-2 hover:bg-slate-50 rounded self-start sm:self-auto"
                              >
                                {copiedScopes ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-500 animate-in fade-in" />
                                    Scopes Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    Copy Scopes
                                  </>
                                )}
                              </Button>
                            </div>
                            <code className="block p-2.5 bg-slate-50 border border-slate-200 rounded text-[9px] font-mono text-slate-500 break-all select-all font-semibold leading-normal bg-slate-50/70 text-left whitespace-pre-wrap">
                              https://www.googleapis.com/auth/admin.directory.user, https://www.googleapis.com/auth/admin.directory.orgunit, https://www.googleapis.com/auth/admin.directory.customer.readonly, https://www.googleapis.com/auth/admin.reports.audit.readonly, https://www.googleapis.com/auth/admin.reports.usage.readonly, https://www.googleapis.com/auth/apps.alerts
                            </code>
                          </div>
                        </div>
                      </div>

                      {/* Step 6 */}
                      <div className="flex gap-3 pt-2">
                        <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 shrink-0 text-[10px] mt-0.5">
                          6
                        </div>
                        <div className="space-y-1">
                          <h5 className="font-bold text-slate-800 font-headline">Submit Dashboard Activation</h5>
                          <p className="text-slate-500 font-medium leading-relaxed">
                            Click the <strong className="text-slate-700">Apply for Google Workspace</strong> button above, enter your domain's <strong className="text-slate-700">Super Admin Email Address</strong> (e.g. <code className="font-mono text-slate-600">admin@yourschool.edu</code>), and click <strong className="text-slate-700">Submit</strong>.
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        /* STATE 2: Pending Verification */
        ) : selectedOrg && (workspaceStatus === "applied" || workspaceStatus === "pending") ? (
          <div className="max-w-3xl mx-auto py-12 animate-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-8">
              {/* Status Timeline */}
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Enrollment Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between max-w-lg mx-auto gap-6 md:gap-0">
                    {/* Step 1: Applied */}
                    <div className="flex flex-row md:flex-col items-center gap-4 md:gap-2">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex flex-col md:items-center text-left md:text-center">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Applied</span>
                        <span className="text-[9px] text-slate-400 md:hidden font-medium">Domain details submitted successfully</span>
                      </div>
                    </div>

                    {/* Connector 1 */}
                    <div className="hidden md:block flex-1 h-0.5 bg-emerald-300 mx-2" />

                    {/* Step 2: Verification (Pulsing) */}
                    <div className="flex flex-row md:flex-col items-center gap-4 md:gap-2">
                      <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-400 flex items-center justify-center relative shrink-0">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                        </span>
                      </div>
                      <div className="flex flex-col md:items-center text-left md:text-center">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Verification</span>
                        <span className="text-[9px] text-slate-400 md:hidden font-medium">Authorizing Domain-Wide Delegation</span>
                      </div>
                    </div>

                    {/* Connector 2 */}
                    <div className="hidden md:block flex-1 h-0.5 bg-slate-200 mx-2" />

                    {/* Step 3: Active (Grayed) */}
                    <div className="flex flex-row md:flex-col items-center gap-4 md:gap-2">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-slate-300" />
                      </div>
                      <div className="flex flex-col md:items-center text-left md:text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active</span>
                        <span className="text-[9px] text-slate-400 md:hidden font-medium">Workspace services activated</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card className="bg-blue-50/30 border-blue-100 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-white rounded-lg border border-blue-100 shadow-sm shrink-0">
                      <Clock className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <h4 className="text-sm font-bold text-slate-800">Verification In Progress</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        We&apos;re verifying your Google Workspace configuration. Please ensure that:
                      </p>
                      <ul className="text-[11px] text-slate-500 leading-relaxed font-medium space-y-1 list-disc list-inside">
                        <li>Domain-Wide Delegation is enabled for the service account</li>
                        <li>Required API scopes are authorized in Google Admin Console</li>
                        <li>The admin email (<span className="font-bold text-slate-700">{selectedOrg.workspaceAdminEmail}</span>) has Super Admin privileges</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Verify Button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="font-bold px-10 h-11 shadow-md shadow-primary/10 text-xs group bg-primary hover:bg-primary/90 text-white rounded-lg transition-all"
                >
                  {isVerifying ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                  )}
                  Verify & Activate
                </Button>
              </div>
            </div>
          </div>

        /* STATE 3: Active Dashboard */
        ) : selectedOrg && workspaceStatus === "active" ? (
          isLoadingDashboard ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading Workspace Dashboard...</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-700">
              {/* Row 1: Storage and Users Directory */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Global Storage Gauge & Breakdown */}
                <Card className="h-full bg-white border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-slate-400" />
                      <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Storage
                      </CardTitle>
                    </div>
                    <div className="relative group cursor-help inline-flex items-center">
                      <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
                      <div className="absolute top-full right-0 mt-1.5 hidden group-hover:flex flex-col items-end z-50 pointer-events-none w-56 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="w-2.5 h-2.5 bg-slate-900 rotate-45 mr-1 -mb-1.5 border-t border-l border-slate-900" />
                        <div className="bg-slate-900 text-white text-[9px] font-medium py-2 px-3 rounded shadow-lg text-center leading-normal whitespace-normal border border-slate-800">
                          Storage data may take 24-48 hours to appear after activation.
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 flex-1 flex flex-col justify-between space-y-5">
                    <div className="space-y-4 flex-1">
                      <Progress
                        value={storagePercent}
                        className="h-2.5 bg-slate-100"
                        indicatorClassName={storageIndicatorColor}
                      />
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-bold text-slate-800">
                          {formatBytes(storageUsed)}{" "}
                          <span className="text-slate-400 font-medium text-xs">used</span>
                        </p>
                        <p className={cn(
                          "text-xs font-bold",
                          storagePercent >= 90
                            ? "text-red-600"
                            : storagePercent >= 75
                              ? "text-amber-600"
                              : "text-slate-500"
                        )}>
                          {storagePercent.toFixed(1)}%
                        </p>
                      </div>
                      {storageTotal > 0 && (
                        <p className="text-[10px] text-slate-400 font-medium -mt-2">
                          of {formatBytes(storageTotal)} total pool
                        </p>
                      )}

                      {/* Storage per OU */}
                      <div className="pt-3 border-t border-slate-100 space-y-2">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Storage by User Type</p>
                        <div className="space-y-2">
                          {OU_CONFIG.map((ou) => {
                            const usedBytes = storageByOU[ou.path] || 0
                            return (
                              <div key={ou.path} className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-600 flex items-center gap-2">
                                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", 
                                    ou.path === "/Students" ? "bg-blue-500" :
                                    ou.path === "/Teachers" ? "bg-emerald-500" :
                                    ou.path === "/Main People" ? "bg-purple-500" : "bg-amber-500"
                                  )} />
                                  {ou.label}
                                </span>
                                <span className="font-bold text-slate-800">{formatBytes(usedBytes)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <Link href="/services/workspace/storage" className="w-full mt-2">
                      <Button
                        variant="outline"
                        className="w-full font-bold text-xs h-9 border-slate-200 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5"
                      >
                        Configure Policies
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>

                {/* 2. Directory Table Widget */}
                <Card className="h-full bg-white border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Users
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-3 flex-1">
                      {/* Desktop View: Dense Table */}
                      <div className="hidden md:block overflow-hidden border border-slate-100 rounded-lg">
                        <Table className="text-xs">
                          <TableHeader className="bg-slate-50/50">
                            <TableRow>
                              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-4 h-8 py-1.5">User Type</TableHead>
                              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right h-8 py-1.5">Active</TableHead>
                              <TableHead className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right pr-4 h-8 py-1.5">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {OU_CONFIG.map((ou) => {
                              const data = ouCounts[ou.path] || { total: 0, active: 0, suspended: 0 }
                              return (
                                <TableRow key={ou.path} className="hover:bg-slate-50/30 transition-colors">
                                  <TableCell className="font-bold text-slate-700 pl-4 py-2">
                                    <div className="flex items-center gap-2">
                                      <div className={cn("p-1 rounded bg-slate-50 border border-slate-100 shrink-0")}>
                                        <ou.icon className={cn("w-3.5 h-3.5", ou.iconColor)} />
                                      </div>
                                      <span>{ou.label}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-semibold text-emerald-600 text-right py-2">{data.active}</TableCell>
                                  <TableCell className="font-bold text-slate-900 text-right pr-4 py-2">{data.total}</TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile View: High-End Interactive Counts Grid */}
                      <div className="block md:hidden grid grid-cols-2 gap-3">
                        {OU_CONFIG.map((ou) => {
                          const data = ouCounts[ou.path] || { total: 0, active: 0, suspended: 0 }
                          return (
                            <div
                              key={ou.path}
                              className="p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 bg-white border-slate-100 hover:shadow-sm"
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn("p-1.5 rounded-lg border shrink-0 bg-slate-50 border-slate-100")}>
                                  <ou.icon className={cn("w-4 h-4", ou.iconColor)} />
                                </div>
                                <span className="text-[11px] font-bold text-slate-700 truncate">{ou.label}</span>
                              </div>
                              <div className="space-y-1.5">
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Total Users</p>
                                <div className="flex items-baseline justify-between gap-1">
                                  <p className="text-lg font-headline font-bold text-slate-900 leading-none">{data.total}</p>
                                  <span className="text-[8px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded px-1 py-0.5 leading-none shrink-0">
                                    {data.active} Act
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Instruct user to manually create missing default OUs */}
                      {missingOUs.length > 0 && (
                        <div className="flex flex-col gap-2 p-3 bg-amber-50/50 border border-amber-100 rounded-lg text-amber-800 mt-2">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold leading-none">Create Missing Organizational Unit(s)</p>
                              <p className="text-[9px] leading-relaxed font-medium">
                                Please create the following organizational units manually in your Google Admin Console under the exact names:
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pl-5">
                            {missingOUs.map((name) => (
                              <Badge key={name} variant="outline" className="text-[8px] font-bold px-1.5 py-0.5 bg-white border-amber-200 text-amber-700 shadow-none">
                                {name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Link href="/services/workspace/users" className="w-full mt-2">
                      <Button
                        variant="outline"
                        className="w-full font-bold text-xs h-9 border-slate-200 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5"
                      >
                        Manage Users
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>

              </div>

              {/* Row 2: Sleek One-Liner Admin Console Gateway banner */}
              <Card className="bg-slate-50 border-slate-200/80 shadow-none py-2.5 px-6 flex items-center justify-between gap-4 w-full rounded-lg">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-1.5 bg-white rounded-md border border-slate-200 shrink-0">
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-3">
                    <p className="text-xs font-bold text-slate-800 shrink-0">
                      Google Admin Console
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium truncate hidden sm:block">
                      Access advanced configurations, security rules, and device policies directly in the native admin panel.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="font-bold text-[10px] h-8 bg-slate-900 hover:bg-black text-white px-4 transition-all shrink-0 flex items-center gap-1.5 shadow-sm"
                  onClick={() => window.open("https://admin.google.com", "_blank")}
                >
                  Open Console
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </Card>

              {/* Row 3: Alert Center Widget - Full Width */}
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden w-full">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3 px-6 flex flex-row items-center justify-between h-14">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-slate-400" />
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      Alert Center
                      {mergedAlerts.length > 0 && (
                        <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 bg-white border-slate-200 text-slate-500 shadow-none scale-90">
                          {mergedAlerts.length}
                        </Badge>
                      )}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 rounded-full border border-slate-100 hover:bg-slate-100 transition-colors shrink-0"
                    onClick={fetchDashboardData}
                    disabled={isLoadingDashboard}
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5 text-slate-400", isLoadingDashboard && "animate-spin")} />
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {alertsError && (
                    <div className="px-4 py-2 bg-amber-50/50 border-b border-amber-100 flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                      <p className="text-[10px] text-amber-600 font-medium">{alertsError}</p>
                    </div>
                  )}
                  {mergedAlerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <div className="p-3 bg-emerald-50 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      </div>
                      <p className="text-xs font-bold text-slate-400">No alerts</p>
                      <p className="text-[10px] text-slate-400 font-medium">Your workspace is running smoothly.</p>
                    </div>
                  ) : (
                    <div className="max-h-[450px] overflow-y-auto custom-scrollbar p-6 space-y-3 bg-slate-50/20">
                      {mergedAlerts.map((entry) => {
                        const isCritical = entry.severity === "CRITICAL"
                        const isWarning = entry.severity === "WARNING"
                        const statusColor = isCritical 
                          ? "border-l-red-500 bg-white hover:bg-red-50/5" 
                          : isWarning 
                            ? "border-l-amber-500 bg-white hover:bg-amber-50/5" 
                            : "border-l-blue-500 bg-white hover:bg-blue-50/5"

                        return (
                          <div
                            key={entry.id}
                            className={cn(
                              "flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-slate-100 border-l-4 rounded-r-lg transition-all shadow-sm hover:shadow-md",
                              statusColor
                            )}
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <Badge
                                className={cn(
                                  "text-[8px] font-extrabold px-2 py-0.5 border shadow-none shrink-0 mt-0.5 uppercase tracking-wider rounded-md",
                                  isCritical
                                    ? "bg-red-50 text-red-700 border-red-100"
                                    : isWarning
                                      ? "bg-amber-50 text-amber-700 border-amber-100"
                                      : "bg-blue-50 text-blue-700 border-blue-100"
                                )}
                              >
                                {entry.severity}
                              </Badge>
                              <div className="min-w-0 space-y-1.5">
                                <p className="text-xs font-bold text-slate-800 leading-tight">
                                  {entry.name}
                                </p>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                  <span className="font-semibold text-slate-400">Actor:</span>
                                  <span className="font-medium text-slate-600 truncate bg-slate-50 px-1.5 py-0.5 border border-slate-100 rounded leading-none">
                                    {entry.actor}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                              <span className="text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-100 rounded px-2.5 py-1 shadow-sm uppercase tracking-wide">
                                {formatTimestamp(entry.time)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        ) : null}
      </div>

      {/* Apply Dialog */}
      <Dialog open={isApplyDialogOpen} onOpenChange={setIsApplyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-headline font-bold text-slate-900">
              Apply for Google Workspace
            </DialogTitle>
            <p className="text-xs text-slate-500 leading-relaxed font-medium mt-1">
              Enter the super admin email address of your Google Workspace for Education domain. We&apos;ll use this to authenticate via Domain-Wide Delegation.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-xs font-bold text-slate-700">
                Workspace Super Admin Email
              </Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="admin@school.edu"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="h-10 text-sm font-medium border-slate-200 focus-visible:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApply()
                }}
              />
              <p className="text-[10px] text-slate-400 font-medium">
                This email must be a Super Admin on the Google Workspace domain.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsApplyDialogOpen(false)}
              className="font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={isApplying || !adminEmail.trim()}
              className="font-bold text-xs bg-primary hover:bg-primary/90"
            >
              {isApplying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
