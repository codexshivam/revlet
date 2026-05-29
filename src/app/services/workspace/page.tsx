"use client"

import * as React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
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
  Users,
  Plus,
  Lock,
  ArrowRightLeft,
  MessageSquare,
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  GraduationCap
} from "lucide-react"
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
  getCustomerStorageUsage,
  listSystemActivities,
  createRequiredOUs
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
  contactEmail?: string
}

interface WorkspaceUser {
  id: string
  name: string
  email: string
  orgUnitPath: string
}

const SYSTEM_CLIENT_ID = "105450959878009279492"

const SCOPES = [
  { url: "https://www.googleapis.com/auth/admin.directory.user" },
  { url: "https://www.googleapis.com/auth/admin.directory.orgunit" },
  { url: "https://www.googleapis.com/auth/admin.reports.usage.readonly" },
  { url: "https://www.googleapis.com/auth/admin.reports.audit.readonly" },
  { url: "https://www.googleapis.com/auth/admin.directory.customer.readonly" }
]

export default function WorkspaceManagementPage() {
  const { toast } = useToast()
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  
  // Dashboard state
  const [users, setUsers] = useState<WorkspaceUser[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [storageStats, setStorageStats] = useState({ used: 0, total: 100 })
  const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false)
  
  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

  const fetchWorkspaceData = useCallback(async () => {
    if (!selectedOrg?.managedWorkspace || !selectedOrg?.contactEmail) return
    
    setIsDataLoading(true)
    try {
      const [usersRes, storageRes, activityRes] = await Promise.all([
        listWorkspaceUsers('/', selectedOrg.contactEmail),
        getCustomerStorageUsage(selectedOrg.contactEmail),
        listSystemActivities(selectedOrg.contactEmail)
      ])

      if (usersRes.success) setUsers(usersRes.data)
      if (storageRes.success) setStorageStats(storageRes.data)
      if (activityRes.success) setActivities(activityRes.data)
    } catch (e: any) {
      console.error('Hub sync failed')
    } finally {
      setIsDataLoading(false)
    }
  }, [selectedOrg])

  useEffect(() => {
    if (authLoading || !user) return
    const q = query(collection(db, "organizations"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Organization[]
      setOrgs(fetched)
      if (fetched.length > 0 && !selectedOrgId) setSelectedOrgId(fetched[0].id)
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
    await updateDoc(orgRef, { workspaceActive: active, updatedAt: serverTimestamp() })
    toast({ title: "Declaration Saved" })
    setIsUpdating(false)
  }

  const handleApply = async () => {
    if (!selectedOrg) return
    setIsUpdating(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    await updateDoc(orgRef, { workspaceStatus: "pending", updatedAt: serverTimestamp() })
    toast({ title: "Request Logged" })
    setIsApplyConfirmOpen(false)
    setIsUpdating(false)
  }

  const handleVerify = async () => {
    if (!selectedOrg || !selectedOrg.contactEmail) return
    setIsUpdating(true)
    
    // Create Required OUs first
    await createRequiredOUs(selectedOrg.contactEmail, !!selectedOrg.gEducation)

    const orgRef = doc(db, "organizations", selectedOrg.id)
    await updateDoc(orgRef, {
      managedWorkspace: true,
      workspaceStatus: "active",
      workspaceDomain: selectedOrg.domain,
      updatedAt: serverTimestamp()
    })
    
    toast({ title: "Infrastructure Ready" })
    fetchWorkspaceData()
    setIsUpdating(false)
  }

  const handleCopyScope = (url: string) => {
    navigator.clipboard.writeText(url)
    toast({ title: "Scope Copied" })
  }

  const directoryBreakdown = useMemo(() => {
    if (!selectedOrg) return []
    const total = users.length
    const breakdown: any = { Total: total }
    
    users.forEach(u => {
      const ou = u.orgUnitPath.substring(1) || 'Root'
      breakdown[ou] = (breakdown[ou] || 0) + 1
    })

    return Object.entries(breakdown).map(([label, val]) => ({ label, val }))
  }, [users, selectedOrg])

  if (isLoading || authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Initialising Context...</p>
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
              <Button variant="ghost" size="sm" onClick={fetchWorkspaceData} disabled={isDataLoading} className="h-9 gap-2 text-slate-500 font-bold text-xs bg-slate-50 border border-slate-200 px-4">
                <RefreshCw className={cn("w-3.5 h-3.5", isDataLoading && "animate-spin")} />
                Sync Cloud
              </Button>
            )}
          </div>
        </div>
        
        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

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
            <div className="space-y-6">
              <h2 className="text-3xl font-headline font-bold text-slate-900">Connection Protocol</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  {[
                    { s: "1", t: "Log In", d: "Access admin.google.com with your institutional account." },
                    { s: "2", t: "Navigation", d: "Navigate to Security > API Controls > Manage Domain Wide Delegation." },
                    { s: "3", t: "Registration", d: "Add a new client and paste the Client ID provided." },
                    { s: "4", t: "Authorization", d: "Copy and paste each required scope and authorize." },
                  ].map(step => (
                    <div key={step.s} className="flex gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary">{step.s}</div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{step.t}</h4>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">{step.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Card className="bg-slate-900 text-white p-8 space-y-8 h-fit">
                   <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase text-slate-400">System Client ID</Label>
                     <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
                       <code className="text-xs font-mono font-bold text-primary">{SYSTEM_CLIENT_ID}</code>
                       <Button variant="ghost" size="icon" onClick={() => {navigator.clipboard.writeText(SYSTEM_CLIENT_ID); toast({title: "Copied ID"})}} className="h-8 w-8 text-slate-400 hover:text-white"><Plus className="w-4 h-4" /></Button>
                     </div>
                   </div>
                   <div className="space-y-4">
                     <Label className="text-[10px] font-bold uppercase text-slate-400">Required Scopes</Label>
                     <div className="space-y-2">
                        {SCOPES.map(s => (
                          <div key={s.url} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg group">
                            <code className="text-[9px] font-mono text-slate-400 truncate pr-4">{s.url}</code>
                            <Button variant="ghost" size="icon" onClick={() => handleCopyScope(s.url)} className="h-6 w-6 text-slate-600 hover:text-white"><ArrowUpRight className="w-3 h-3" /></Button>
                          </div>
                        ))}
                     </div>
                   </div>
                </Card>
              </div>
            </div>
            <div className="flex flex-col items-center pt-8 border-t"><Button onClick={handleVerify} disabled={isUpdating} className="h-14 px-16 text-lg font-bold shadow-xl gap-3">{isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-6 h-6" />}Verify & Activate Dashboard</Button></div>
          </div>
        )}

        {selectedOrg && selectedOrg.managedWorkspace === true && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-white border-slate-200 shadow-sm flex flex-col justify-between h-56">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cloud Roster</CardTitle>
                  <Network className="w-4 h-4 text-slate-300" />
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center space-y-1">
                  {directoryBreakdown.map((m) => (
                    <div key={m.label} className="flex items-center justify-between text-slate-700 border-b border-slate-50 last:border-0 py-1">
                       <span className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{m.label}</span>
                       <span className="text-lg font-headline font-bold">{m.val}</span>
                    </div>
                  ))}
                  <Button variant="ghost" asChild className="w-full h-8 mt-4 text-[10px] font-bold text-primary hover:bg-primary/5">
                    <Link href="/services/workspace/users">Manage Identities <ChevronRight className="w-3 h-3 ml-1" /></Link>
                  </Button>
                </CardContent>
                <div className="h-1 w-full bg-primary/20" />
              </Card>

              <Card className="bg-white border-slate-200 shadow-sm flex flex-col justify-between h-56">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Storage</CardTitle>
                  <HardDrive className="w-4 h-4 text-slate-300" />
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center space-y-5 px-6">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-end">
                      <span className="text-2xl font-headline font-bold text-slate-900">{storageStats.used} TB</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">/ {storageStats.total} TB Capacity</span>
                    </div>
                    <Progress value={(parseFloat(storageStats.used.toString()) / storageStats.total) * 100} className="h-2.5 bg-slate-50" />
                  </div>
                  <Button variant="ghost" asChild className="w-full h-8 text-[10px] font-bold text-slate-400 hover:bg-slate-50">
                    <Link href="/services/workspace/storage">Policy Controls <ChevronRight className="w-3 h-3 ml-1" /></Link>
                  </Button>
                </CardContent>
                <div className="h-1 w-full bg-emerald-500/20" />
              </Card>

              <Card className="bg-primary text-primary-foreground border-none shadow-xl flex flex-col justify-between h-56 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10"><Cloud className="w-32 h-32" /></div>
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest opacity-80">Google Admin Center</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center space-y-4 px-6 z-10">
                  <div className="space-y-1">
                    <h4 className="text-xl font-headline font-bold">Administrative Gateway</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed font-medium">Global policies and domain billing controls.</p>
                  </div>
                  <Button asChild className="w-full bg-white text-primary hover:bg-slate-50 font-bold h-11">
                    <a href="https://admin.google.com" target="_blank" rel="noopener noreferrer" className="gap-2">Open Console <ExternalLink className="w-4 h-4" /></a>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-200 py-4 px-8 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Audit Activity Feed</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {activities.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 text-xs italic">Scanning system logs...</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {activities.map((log) => (
                      <div key={log.id} className="p-6 flex items-start justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex gap-5">
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100"><Clock className="w-4 h-4 text-slate-400" /></div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tight">{log.time}</span>
                            <p className="text-sm font-medium text-slate-700">{log.msg}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
