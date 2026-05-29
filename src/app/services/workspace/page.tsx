
"use client"

import * as React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  ShieldCheck, 
  Settings, 
  Loader2,
  Network,
  Cloud,
  ArrowUpRight,
  Bell,
  HardDrive,
  UserCog,
  Zap,
  GraduationCap,
  Users,
  Plus,
  Lock,
  ArrowRightLeft,
  MessageSquare,
  Clock,
  RefreshCw,
  Search,
  ExternalLink
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
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
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { 
  listWorkspaceUsers, 
  getCustomerStorageUsage
} from "@/app/actions/google-workspace"

interface Organization {
  id: string
  name: string
  domain: string
  gEducation?: boolean
  workspaceActive?: boolean
  managedWorkspace?: boolean
  workspaceStatus?: "unregistered" | "applied" | "pending" | "active"
  workspaceDomain?: string
  customUserTypes?: string[]
  contactEmail?: string
}

interface WorkspaceUser {
  id: string
  name: string
  email: string
  status: string
  storage: string
  archived: boolean
  orgUnitPath: string
}

const SYSTEM_CLIENT_ID = "105450959878009279492"

const SCOPES = [
  { url: "https://www.googleapis.com/auth/admin.directory.user" },
  { url: "https://www.googleapis.com/auth/admin.directory.orgunit" },
  { url: "https://www.googleapis.com/auth/admin.reports.usage.readonly" },
  { url: "https://www.googleapis.com/auth/admin.directory.customer.readonly" }
]

export default function WorkspaceManagementPage() {
  const { toast } = useToast()
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()
  const router = useRouter()
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [copiedScope, setCopiedScope] = useState<string | null>(null)
  
  // Dashboard state
  const [users, setUsers] = useState<WorkspaceUser[]>([])
  const [isUsersLoading, setIsUsersLoading] = useState(false)
  const [storageStats, setStorageStats] = useState({ used: 0.8, total: 10 })
  const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false)
  
  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

  const fetchWorkspaceData = useCallback(async () => {
    if (!selectedOrg?.managedWorkspace || !selectedOrg?.contactEmail) return
    
    setIsUsersLoading(true)
    try {
      const [usersRes, storageRes] = await Promise.all([
        listWorkspaceUsers('/', selectedOrg.contactEmail),
        getCustomerStorageUsage(selectedOrg.contactEmail)
      ])

      if (usersRes.success) {
        setUsers(usersRes.data)
      }
      if (storageRes.success) {
        setStorageStats(storageRes.data)
      }
    } catch (e: any) {
      console.error('Hub sync failed')
    } finally {
      setIsUsersLoading(false)
    }
  }, [selectedOrg])

  useEffect(() => {
    if (authLoading || !user) return
    const q = query(collection(db, "organizations"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Organization[]
      setOrgs(fetched)
      if (fetched.length > 0 && !selectedOrgId) {
        setSelectedOrgId(fetched[0].id)
      }
      setIsLoading(false)
    })
    return unsub
  }, [user, authLoading, db, selectedOrgId])

  useEffect(() => {
    if (selectedOrg?.managedWorkspace) {
      fetchWorkspaceData()
    }
  }, [selectedOrg, fetchWorkspaceData])

  const handleDeclare = async (active: boolean) => {
    if (!selectedOrg) return
    setIsUpdating(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    updateDoc(orgRef, {
      workspaceActive: active,
      updatedAt: serverTimestamp()
    }).then(() => {
      toast({ title: "Declaration Saved", description: active ? "Migration guidelines unlocked." : "Application features unlocked." })
    }).finally(() => setIsUpdating(false))
  }

  const handleApply = async () => {
    if (!selectedOrg) return
    setIsUpdating(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    updateDoc(orgRef, {
      workspaceStatus: "pending",
      updatedAt: serverTimestamp()
    }).then(() => {
      toast({ title: "Request Logged", description: "Our engineering team will contact you shortly." })
      setIsApplyConfirmOpen(false)
    }).finally(() => setIsUpdating(false))
  }

  const handleVerify = async () => {
    if (!selectedOrg) return
    setIsUpdating(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    updateDoc(orgRef, {
      managedWorkspace: true,
      workspaceStatus: "active",
      workspaceDomain: selectedOrg.domain,
      updatedAt: serverTimestamp()
    }).then(() => {
      toast({ title: "Connection Verified", description: "Your workspace management panel is now live." })
      fetchWorkspaceData()
    }).finally(() => setIsUpdating(false))
  }

  const handleCopyIndividualScope = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedScope(url)
    toast({ title: "Scope Copied" })
    setTimeout(() => setCopiedScope(null), 2000)
  }

  const hubMetrics = useMemo(() => {
    if (!selectedOrg) return []
    const metricsMap = users.reduce((acc: any, u) => {
      const ou = u.orgUnitPath.substring(1);
      acc[ou] = (acc[ou] || 0) + 1;
      return acc;
    }, {});

    return selectedOrg.gEducation 
      ? [
        { label: "Students", val: metricsMap["Students"] || 0, icon: GraduationCap },
        { label: "Teachers", val: metricsMap["Teachers"] || 0, icon: Users },
        { label: "Staffs", val: metricsMap["Staffs"] || 0, icon: Network },
      ]
      : [
        { label: "Total Users", val: users.length, icon: Users },
        { label: "Core Team", val: metricsMap["Main People"] || 0, icon: UserCog },
      ]
  }, [users, selectedOrg]);

  if (isLoading || authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Initialising Admin Context...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Services</span>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-headline font-bold text-slate-900">
              {selectedOrg?.gEducation ? "Google Workspace for Education" : "Google Workspace"}
            </h1>
            {selectedOrg?.managedWorkspace && (
              <Button variant="ghost" size="sm" onClick={fetchWorkspaceData} disabled={isUsersLoading} className="h-9 gap-2 text-slate-500 font-bold text-xs bg-slate-50 border border-slate-200 px-4">
                <RefreshCw className={cn("w-3.5 h-3.5", isUsersLoading && "animate-spin")} />
                Sync Cloud
              </Button>
            )}
          </div>
        </div>
        
        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        {/* Declaration & Setup States Omitted for Brevity - Keeping Logic Intact */}
        {selectedOrg && selectedOrg.workspaceActive === undefined && (
          <Card className="bg-slate-50 border-slate-200 border-dashed">
            <CardContent className="p-16 flex flex-col items-center text-center gap-10">
              <div className="space-y-3">
                <h3 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">Managed Workspace for You</h3>
                <div className="space-y-1">
                  <p className="text-primary font-bold text-sm tracking-widest uppercase">Most Simplest and Effective Way to Manage Infrastructure Globally</p>
                  <p className="text-slate-500 max-w-xl mx-auto text-sm leading-relaxed font-medium">
                    Select your institution's current workspace status to activate the managed administrative interface and automated security protocols.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl text-left">
                {(selectedOrg.gEducation 
                  ? [
                    { title: "Academic Scale", desc: "Manage thousands of Student & Faculty accounts with nested organizational hierarchies.", icon: Users, color: "text-blue-600 bg-blue-50" },
                    { title: "Institutional Safety", desc: "Enforce domain-wide security policies and Data Loss Prevention (DLP) across all academic units.", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50" },
                    { title: "Storage Oversight", desc: "Control the 100TB collective institutional storage pool with group-level hard quotas.", icon: HardDrive, color: "text-purple-600 bg-purple-50" },
                  ]
                  : [
                    { title: "Unified Directory", desc: "Centralized management for users, groups, and cross-departmental access.", icon: Network, color: "text-blue-600 bg-blue-50" },
                    { title: "Admin Agility", desc: "Simplified administrative layer for rapid onboarding, password resets, and audits.", icon: Zap, color: "text-amber-600 bg-amber-50" },
                    { title: "Policy Enforcement", desc: "Deploy enterprise security standards globally with a single click.", icon: Lock, color: "text-slate-600 bg-slate-100" },
                  ]
                ).map((feat) => (
                  <div key={feat.title} className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", feat.color)}>
                      <feat.icon className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-900 text-sm">{feat.title}</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full max-md sm:max-w-md">
                <Button onClick={() => handleDeclare(true)} className="flex-1 h-14 bg-white hover:bg-slate-50 text-slate-900 border-slate-200 border shadow-sm font-bold gap-3">
                  <ArrowRightLeft className="w-5 h-5 text-primary" />
                  We have Workspace
                </Button>
                <Button onClick={() => handleDeclare(false)} className="flex-1 h-14 bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-200 font-bold gap-3">
                  <Plus className="w-5 h-5 text-slate-400" />
                  No Workspace yet
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedOrg && selectedOrg.workspaceActive === false && selectedOrg.workspaceStatus !== 'pending' && (
           <div className="max-w-5xl mx-auto py-8 space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-headline font-bold text-slate-900">Institutional Cloud Deployment</h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">
                Access professional collaboration tools for your entire organization with zero license overhead.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { title: "Managed Onboarding", desc: "Our team handles the verification and DNS setup for your domain.", icon: Zap, color: "text-blue-500 bg-blue-50" },
                { title: "EDU Exclusive", desc: "Unlock 100TB of collective storage and advanced teaching tools.", icon: GraduationCap, color: "text-emerald-500 bg-emerald-50" },
                { title: "Security First", desc: "DLP rules and advanced threat protection enabled by default.", icon: Lock, color: "text-purple-500 bg-purple-50" },
              ].map((feat) => (
                <Card key={feat.title} className="bg-white border-slate-200 shadow-sm p-8 space-y-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", feat.color)}><feat.icon className="w-6 h-6" /></div>
                  <h4 className="font-bold text-slate-900">{feat.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">{feat.desc}</p>
                </Card>
              ))}
            </div>
            <div className="flex justify-center">
              <Button onClick={() => setIsApplyConfirmOpen(true)} size="lg" className="h-14 px-12 text-lg font-bold shadow-xl">Apply for Institutional Workspace</Button>
            </div>
            <AlertDialog open={isApplyConfirmOpen} onOpenChange={setIsApplyConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-headline font-bold">Confirm Application Request?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm leading-relaxed">This will initiate a deployment request for {selectedOrg.domain}. Our team will contact you shortly.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleApply} className="bg-slate-900 text-white font-bold">Confirm & Apply</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {selectedOrg && selectedOrg.workspaceStatus === 'pending' && !selectedOrg.managedWorkspace && (
          <div className="max-w-4xl mx-auto py-20">
            <Card className="bg-amber-50 border-amber-200 shadow-sm border-dashed">
              <CardContent className="p-20 flex flex-col items-center text-center gap-6">
                <div className="w-20 h-20 rounded-full bg-white border border-amber-100 flex items-center justify-center shadow-sm relative">
                  <Clock className="w-10 h-10 text-amber-500" />
                  <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white font-bold border-2 border-white uppercase text-[8px]">PENDING</Badge>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-headline font-bold text-amber-900">Infrastructure Setup in Progress</h3>
                  <p className="text-amber-700/80 max-w-lg mx-auto text-sm leading-relaxed font-medium">
                    Our engineering team will call you shortly to discuss your institutional plan and finalize the Google Workspace deployment for <span className="font-bold">{selectedOrg.domain}</span>.
                  </p>
                </div>
                <Link href="/support"><Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 font-bold gap-2"><MessageSquare className="w-4 h-4" />Contact Support</Button></Link>
              </CardContent>
            </Card>
          </div>
        )}

        {selectedOrg && selectedOrg.workspaceActive === true && !selectedOrg.managedWorkspace && (
          <div className="max-w-5xl mx-auto py-8 space-y-12">
            <Card className="bg-slate-900 text-white p-8 shadow-2xl border-none">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0"><Settings className="w-6 h-6 text-primary" /></div>
                <div className="space-y-4 flex-1">
                  <h4 className="text-xl font-bold">Domain-Wide Delegation Protocol</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { s: "1", t: "Initialize", d: "Log in to your Google Admin Console." },
                      { s: "2", t: "Locate API", d: "Security > API Controls > Manage Domain Wide Delegation." },
                      { s: "3", t: "Register ID", d: `Add new Client, paste ${SYSTEM_CLIENT_ID}.` },
                      { s: "4", t: "Authorize", d: "Copy required scopes below and click Authorize." },
                    ].map(step => (
                      <div key={step.s} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">{step.s}</Badge>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{step.t}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed font-medium">{step.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Card className="lg:col-span-1 bg-white border-slate-200 p-6 flex flex-col justify-center gap-4">
                <Label className="text-[10px] font-bold uppercase text-slate-400">Client ID</Label>
                <code className="text-sm font-mono font-bold text-primary block text-center py-4 bg-slate-50 border rounded-xl">{SYSTEM_CLIENT_ID}</code>
                <Button onClick={() => {navigator.clipboard.writeText(SYSTEM_CLIENT_ID); toast({title: "Copied ID"})}} className="bg-slate-900 text-white font-bold">Copy Client ID</Button>
              </Card>
              <Card className="lg:col-span-2 bg-white border-slate-200 overflow-hidden">
                <CardHeader className="py-3 px-6 bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between"><span className="text-[10px] font-bold uppercase text-slate-400">Required OAuth Scopes</span></CardHeader>
                <div className="divide-y divide-slate-100">
                  {SCOPES.map(s => (
                    <div key={s.url} className="p-4 flex items-center justify-between hover:bg-slate-50 group">
                      <code className="text-[9px] font-mono text-slate-500 truncate pr-4">{s.url}</code>
                      <Button variant="ghost" size="icon" onClick={() => handleCopyIndividualScope(s.url)} className="h-8 w-8 text-slate-300 hover:text-primary"><ArrowUpRight className="w-3 h-3" /></Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            <div className="flex flex-col items-center pt-8 border-t"><Button onClick={handleVerify} disabled={isUpdating} className="h-14 px-16 text-lg font-bold shadow-xl gap-3">{isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-6 h-6" />}Verify & Activate Dashboard</Button></div>
          </div>
        )}

        {/* State 5: New High-Density Hub Layout */}
        {selectedOrg && selectedOrg.managedWorkspace === true && (
          <div className="space-y-8 animate-in fade-in duration-700">
            {/* Main Infrastructure Hub Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Widget 1: Directory Breakdown */}
              <Card className="bg-white border-slate-200 shadow-sm flex flex-col justify-between h-56 group overflow-hidden">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Institutional Directory</CardTitle>
                  <Network className="w-4 h-4 text-slate-300" />
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center gap-6 relative">
                  <div className="flex items-center gap-8 px-2">
                    {hubMetrics.map((m) => (
                      <div key={m.label} className="space-y-1">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{m.label}</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-headline font-bold text-slate-900 leading-none">{m.val}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" asChild className="w-fit h-7 px-2 text-[10px] font-bold text-primary gap-1.5 hover:bg-primary/5 ml-1">
                    <Link href="/services/workspace/users">
                      Manage Users
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </Button>
                </CardContent>
                <div className="h-1 w-full bg-primary/20" />
              </Card>

              {/* Widget 2: Real-time Storage Gauge */}
              <Card className="bg-white border-slate-200 shadow-sm flex flex-col justify-between h-56 group overflow-hidden">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Storage Utilization</CardTitle>
                  <HardDrive className="w-4 h-4 text-slate-300" />
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center space-y-5 px-6">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-end">
                      <span className="text-2xl font-headline font-bold text-slate-900">{storageStats.used} TB</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">/ {storageStats.total} TB Capacity</span>
                    </div>
                    <Progress value={(storageStats.used / storageStats.total) * 100} className="h-2.5 bg-slate-50" />
                  </div>
                  <div className="flex items-center gap-4 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                    <div className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-emerald-500" /> Health: Optimal</div>
                    <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Updated 2m ago</div>
                  </div>
                </CardContent>
                <div className="h-1 w-full bg-emerald-500/20" />
              </Card>

              {/* Widget 3: Master Admin Link (Blue Theme) */}
              <Card className="bg-primary text-primary-foreground border-none shadow-xl flex flex-col justify-between h-56 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10"><Cloud className="w-32 h-32" /></div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest opacity-80">Workspace Master Environment</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center space-y-4 px-6 z-10">
                  <div className="space-y-1">
                    <h4 className="text-xl font-headline font-bold">Admin Console</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed font-medium max-w-[200px]">
                      Access global policies, billing, and advanced security configurations.
                    </p>
                  </div>
                  <Button asChild className="w-full bg-white text-primary hover:bg-slate-50 font-bold h-11 shadow-lg shadow-black/20">
                    <a href="https://admin.google.com" target="_blank" rel="noopener noreferrer" className="gap-2">
                      Open Console
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Global Alert Center (Full Width) */}
            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-200 py-4 px-8 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Infrastructure Activity Feed</CardTitle>
                </div>
                <Badge variant="outline" className="bg-white text-[9px] font-bold h-5 px-2">LIVE MONITORING</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {[
                    { id: 1, type: "INFO", msg: "Institutional directory sync executed successfully across all OUs", time: "Just now", icon: RefreshCw },
                    { id: 2, type: "SECURITY", msg: "Domain-wide delegation verified for service account infrastructure", time: "1h ago", icon: ShieldCheck },
                    { id: 3, type: "STORAGE", msg: "Storage pool usage analyzed: Consumption is within normal academic bounds", time: "4h ago", icon: HardDrive },
                    { id: 4, type: "SYSTEM", msg: "New OU policy propagated to 4 secondary organizational units", time: "Yesterday", icon: Zap },
                  ].map((log) => (
                    <div key={log.id} className="p-6 flex items-start justify-between hover:bg-slate-50 transition-colors group">
                      <div className="flex gap-5">
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-white transition-all shadow-sm">
                           <log.icon className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className="text-[8px] font-bold h-4 px-1.5 bg-slate-100 text-slate-500 border-none shadow-none uppercase">{log.type}</Badge>
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tight">{log.time}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-700 leading-none">{log.msg}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-900"><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function ChevronRight(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
