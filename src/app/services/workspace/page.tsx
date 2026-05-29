
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  ShieldCheck, 
  Settings, 
  Key,
  Archive,
  Trash2,
  Loader2,
  Network,
  Cloud,
  UserPlus,
  ArrowUpRight,
  Search,
  Copy,
  AlertCircle,
  Bell,
  HardDrive,
  UserCog,
  Zap,
  Globe,
  GraduationCap,
  Users,
  Plus,
  Calendar,
  Lock,
  ArrowRightLeft,
  MessageSquare,
  Clock,
  ChevronRight,
  CheckCircle2,
  X,
  RefreshCw,
  Check
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { 
  listWorkspaceUsers, 
  createWorkspaceUser, 
  updateWorkspaceUser, 
  resetUserPassword, 
  archiveUser, 
  deleteWorkspaceUser,
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

const SCOPES = [
  { url: "https://www.googleapis.com/auth/admin.directory.user" },
  { url: "https://www.googleapis.com/auth/admin.directory.orgunit" },
  { url: "https://www.googleapis.com/auth/admin.reports.usage.readonly" },
  { url: "https://www.googleapis.com/auth/admin.directory.customer.readonly" }
]

const SYSTEM_CLIENT_ID = "105450959878009279492"

export default function WorkspaceManagementPage() {
  const { toast } = useToast()
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const currentTab = searchParams.get("tab") || "hub"
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [copiedScope, setCopiedScope] = useState<string | null>(null)
  
  // Dashboard state
  const [users, setUsers] = useState<WorkspaceUser[]>([])
  const [isUsersLoading, setIsUsersLoading] = useState(false)
  const [storageStats, setStorageStats] = useState({ used: 0, total: 10 })
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [isOUDialogOpen, setIsOUDialogOpen] = useState(false)
  const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false)
  
  // Form states
  const [newUser, setNewUser] = useState({ firstName: "", lastName: "", emailPrefix: "", password: "", orgUnit: "" })
  const [resetData, setResetData] = useState({ userId: "", userName: "", newPassword: "", forceChange: true })
  const [newOUType, setNewOUType] = useState("")
  
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
      } else {
        toast({ variant: "destructive", title: "Sync Failed", description: usersRes.error })
      }

      if (storageRes.success) setStorageStats(storageRes.data)
    } catch (e: any) {
      toast({ variant: "destructive", title: "API Connection Error" })
    } finally {
      setIsUsersLoading(false)
    }
  }, [selectedOrg, toast])

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

  const handleCreateUser = async () => {
    if (!selectedOrg) return
    setIsUpdating(true)
    const res = await createWorkspaceUser({
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: `${newUser.emailPrefix}@${selectedOrg.domain}`,
      password: newUser.password,
      orgUnitPath: `/${newUser.orgUnit}`
    }, selectedOrg.contactEmail)

    if (res.success) {
      toast({ title: "User Created", description: `${newUser.firstName} has been added to the directory.` })
      setIsCreateDialogOpen(false)
      fetchWorkspaceData()
    } else {
      toast({ variant: "destructive", title: "Creation Failed", description: res.error })
    }
    setIsUpdating(false)
  }

  const handleArchiveUser = async (userId: string, currentStatus: string) => {
    const suspend = currentStatus === 'Active'
    setIsUpdating(true)
    const res = await archiveUser(userId, suspend, selectedOrg?.contactEmail)
    if (res.success) {
      toast({ title: suspend ? "Account Suspended" : "Account Reactivated" })
      fetchWorkspaceData()
    }
    setIsUpdating(false)
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure? This action is permanent and wipes all data associated with the user account.")) return
    setIsUpdating(true)
    const res = await deleteWorkspaceUser(userId, selectedOrg?.contactEmail)
    if (res.success) {
      toast({ title: "User Wiped", description: "The account and its data have been purged." })
      fetchWorkspaceData()
    }
    setIsUpdating(false)
  }

  const handleAddUserType = async () => {
    if (!selectedOrg || !newOUType) return
    setIsUpdating(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    updateDoc(orgRef, {
      customUserTypes: arrayUnion(newOUType)
    }).then(() => {
      toast({ title: "User Type Registered", description: `"${newOUType}" OU created.` })
      setNewOUType("")
      setIsOUDialogOpen(false)
    }).finally(() => setIsUpdating(false))
  }

  const handleCopyIndividualScope = (url: string) => {
    navigator.clipboard.text = url;
    navigator.clipboard.writeText(url)
    setCopiedScope(url)
    toast({ title: "Scope Copied", description: "API Scope URL ready for pasting." })
    setTimeout(() => setCopiedScope(null), 2000)
  }

  const defaultOUs = selectedOrg?.gEducation 
    ? ["Students", "Teachers", "Main People", "Staffs"] 
    : ["Users", "Main People"]
  
  const allOUs = [...defaultOUs, ...(selectedOrg?.customUserTypes || [])]

  // Dynamic Metrics for Hub
  const hubMetrics = useMemo(() => {
    if (!selectedOrg) return []
    const metricsMap = users.reduce((acc: any, u) => {
      const ou = u.orgUnitPath.substring(1);
      acc[ou] = (acc[ou] || 0) + 1;
      return acc;
    }, {});

    const baseItems = selectedOrg.gEducation 
      ? [
        { label: "Students Count", val: metricsMap["Students"] || 0, icon: GraduationCap },
        { label: "Teachers Count", val: metricsMap["Teachers"] || 0, icon: Users },
        { label: "Main People", val: metricsMap["Main People"] || 0, icon: UserCog },
        { label: "Staffs Count", val: metricsMap["Staffs"] || 0, icon: Network },
      ]
      : [
        { label: "Total Users", val: users.length, icon: Users },
        { label: "Main People", val: metricsMap["Main People"] || 0, icon: UserCog },
        { label: "OUs Count", val: allOUs.length, icon: Network },
        { label: "Groups", val: "Calculated", icon: Bell },
      ]

    return baseItems;
  }, [users, selectedOrg, allOUs]);

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
              <Badge variant="ghost" className="h-9 gap-2 text-slate-500 font-bold text-xs bg-slate-50 border border-slate-200 px-4">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Enterprise Managed
              </Badge>
            )}
          </div>
        </div>
        
        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        {/* State 1: Declaration */}
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
                <Button 
                  onClick={() => handleDeclare(true)}
                  disabled={isUpdating}
                  className="flex-1 h-14 bg-white hover:bg-slate-50 text-slate-900 border-slate-200 border shadow-sm font-bold gap-3"
                >
                  <ArrowRightLeft className="w-5 h-5 text-primary" />
                  We have Workspace
                </Button>
                <Button 
                  onClick={() => handleDeclare(false)}
                  disabled={isUpdating}
                  className="flex-1 h-14 bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-200 font-bold gap-3"
                >
                  <Plus className="w-5 h-5 text-slate-400" />
                  No Workspace yet
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* State 2: Apply (Pending deployment call) */}
        {selectedOrg && selectedOrg.workspaceActive === false && selectedOrg.workspaceStatus !== 'pending' && (
          <div className="max-w-5xl mx-auto py-8 space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-headline font-bold text-slate-900">Institutional Cloud Deployment</h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">
                Access professional collaboration tools for your entire organization with zero license overhead for eligible institutions.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { title: "Managed Onboarding", desc: "Our team handles the verification and DNS setup for your institutional domain.", icon: Zap, color: "text-blue-500 bg-blue-50" },
                { title: "EDU Exclusive", desc: "Unlock 100TB of collective storage and advanced teaching tools.", icon: GraduationCap, color: "text-emerald-500 bg-emerald-50" },
                { title: "Security First", desc: "DLP rules and advanced threat protection enabled by default.", icon: Lock, color: "text-purple-500 bg-purple-50" },
              ].map((feat) => (
                <Card key={feat.title} className="bg-white border-slate-200 shadow-sm p-8 space-y-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", feat.color)}>
                    <feat.icon className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-slate-900">{feat.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">{feat.desc}</p>
                </Card>
              ))}
            </div>

            <div className="flex justify-center">
              <Button onClick={() => setIsApplyConfirmOpen(true)} size="lg" className="h-14 px-12 text-lg font-bold shadow-xl">
                Apply for Institutional Workspace
              </Button>
            </div>

            <AlertDialog open={isApplyConfirmOpen} onOpenChange={setIsApplyConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-headline font-bold">Confirm Application Request?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm leading-relaxed">
                    This will initiate a Google Workspace deployment request for <span className="font-bold">{selectedOrg.domain}</span>. Our engineering team will contact you to discuss the plan and finalize deployment.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleApply} className="bg-slate-900 text-white font-bold">Confirm & Apply</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* State 3: Pending Engineering Call */}
        {selectedOrg && selectedOrg.workspaceStatus === 'pending' && !selectedOrg.managedWorkspace && (
          <div className="max-w-4xl mx-auto py-20">
            <Card className="bg-amber-50 border-amber-200 shadow-sm border-dashed">
              <CardContent className="p-20 flex flex-col items-center text-center gap-6">
                <div className="w-20 h-20 rounded-full bg-white border border-amber-100 flex items-center justify-center shadow-sm relative">
                  <Clock className="w-10 h-10 text-amber-500" />
                  <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white font-bold border-2 border-white">PENDING</Badge>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-headline font-bold text-amber-900">Infrastructure Setup in Progress</h3>
                  <p className="text-amber-700/80 max-w-lg mx-auto text-sm leading-relaxed font-medium">
                    Our engineering team will call you shortly to discuss your institutional plan and finalize the Google Workspace deployment for <span className="font-bold">{selectedOrg.domain}</span>.
                  </p>
                </div>
                <Link href="/support">
                  <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 font-bold gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Contact Support
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        )}

        {/* State 4: Connection Guideline */}
        {selectedOrg && selectedOrg.workspaceActive === true && !selectedOrg.managedWorkspace && (
          <div className="max-w-5xl mx-auto py-8 space-y-12">
            <Card className="bg-slate-900 text-white p-8 shadow-2xl border-none">
                 <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                       <Settings className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-4 flex-1">
                       <h4 className="text-xl font-bold">Domain-Wide Delegation Protocol</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">1</Badge>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Initialize</span>
                             </div>
                             <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                Log in to your <span className="text-white font-bold">Google Admin Console</span>.
                             </p>
                          </div>
                          <div className="space-y-3">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">2</Badge>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Locate API</span>
                             </div>
                             <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                Navigate to <span className="text-white font-bold">Security &gt; API Controls &gt; Manage Domain Wide Delegation</span>.
                             </p>
                          </div>
                          <div className="space-y-3">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">3</Badge>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Register ID</span>
                             </div>
                             <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                Add new Client, paste <span className="text-primary font-bold">{SYSTEM_CLIENT_ID}</span>.
                             </p>
                          </div>
                          <div className="space-y-3">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">4</Badge>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Authorize</span>
                             </div>
                             <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                Copy required scopes from the list below and click Authorize.
                             </p>
                          </div>
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
                    <CardHeader className="py-3 px-6 bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between">
                       <span className="text-[10px] font-bold uppercase text-slate-400">Required OAuth Scopes</span>
                       <Badge variant="outline" className="bg-white h-5">{SCOPES.length} Scopes</Badge>
                    </CardHeader>
                    <div className="divide-y divide-slate-100">
                       {SCOPES.map(s => (
                         <div key={s.url} className="p-4 flex items-center justify-between hover:bg-slate-50 group">
                            <code className="text-[9px] font-mono text-slate-500 truncate pr-4">{s.url}</code>
                            <Button variant="ghost" size="icon" onClick={() => handleCopyIndividualScope(s.url)} className="h-8 w-8 text-slate-300 hover:text-primary">
                               {copiedScope === s.url ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </Button>
                         </div>
                       ))}
                    </div>
                 </Card>
              </div>

              <div className="flex flex-col items-center pt-8 border-t">
                 <Button onClick={handleVerify} disabled={isUpdating} className="h-14 px-16 text-lg font-bold shadow-xl gap-3">
                   {isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-6 h-6" />}
                   Verify & Activate Dashboard
                 </Button>
              </div>
          </div>
        )}

        {/* State 5: Active Management */}
        {selectedOrg && selectedOrg.managedWorkspace === true && (
          <Tabs value={currentTab} onValueChange={(v) => router.push(`/services/workspace?tab=${v}`)} className="space-y-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
              <TabsList className="bg-transparent h-auto p-0 gap-8">
                {["hub", "users", "storage", "archived"].map((t) => (
                  <TabsTrigger 
                    key={t} 
                    value={t} 
                    className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-slate-900 rounded-none h-10 px-0 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 transition-all"
                  >
                    {t === 'hub' ? 'Workspace Hub' : t}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button variant="ghost" size="sm" onClick={fetchWorkspaceData} disabled={isUsersLoading} className="h-8 text-xs font-bold gap-2">
                <RefreshCw className={cn("w-3 h-3", isUsersLoading && "animate-spin")} />
                Sync Cloud Directory
              </Button>
            </div>

            <TabsContent value="hub" className="m-0 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {hubMetrics.map((m) => (
                  <Card key={m.label} className="bg-white border-slate-200 shadow-sm group">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-primary/5 transition-colors">
                           <m.icon className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                        </div>
                        <Badge variant="outline" className="text-[9px] font-bold h-4 bg-emerald-50 text-emerald-600 border-emerald-100">LIVE</Badge>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</p>
                      <p className="text-3xl font-headline font-bold text-slate-900 mt-1">{m.val}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="py-4 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                     <HardDrive className="w-4 h-4 text-slate-400" />
                     <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Storage Pool</CardTitle>
                  </div>
                  <span className="text-[11px] font-bold text-slate-900">{storageStats.used} TB / {storageStats.total} TB</span>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="space-y-4">
                    <Progress value={(storageStats.used / storageStats.total) * 100} className="h-2.5 bg-slate-100" />
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                       <span>{Math.round((storageStats.used / storageStats.total) * 100)}% Cloud Capacity Utilised</span>
                       <span>{(storageStats.total - storageStats.used).toFixed(1)} TB Available</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 bg-white border-slate-200 overflow-hidden">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6">
                    <div className="flex items-center gap-2">
                       <Bell className="w-4 h-4 text-slate-400" />
                       <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Audit Activity Feed</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100">
                      {[
                        { id: 1, type: "INFO", msg: "Institutional directory sync executed successfully", time: "Just now" },
                        { id: 2, type: "INFO", msg: "Domain-wide security policy verified", time: "1h ago" },
                      ].map((log) => (
                        <div key={log.id} className="p-5 flex items-start justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex gap-4">
                            <Badge className="text-[9px] font-bold h-5 px-1.5 bg-slate-50 text-slate-500 border-slate-100">{log.type}</Badge>
                            <p className="text-xs font-medium text-slate-700">{log.msg}</p>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{log.time}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900 text-white p-8 flex flex-col justify-center space-y-6">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                       <Cloud className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-headline font-bold">Admin Panel</h4>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        Secure gateway to the master Google Admin environment.
                      </p>
                    </div>
                    <Button asChild className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold h-12">
                      <a href="https://admin.google.com" target="_blank" rel="noopener noreferrer">
                        Launch Console
                        <ArrowUpRight className="w-4 h-4 ml-2" />
                      </a>
                    </Button>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="users" className="m-0 space-y-6">
               <Card className="bg-white border-slate-200 overflow-hidden">
                 <Tabs defaultValue={allOUs[0].toLowerCase()} className="w-full">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-0">
                      <div className="flex flex-col md:flex-row items-center justify-between p-4 px-6 gap-4">
                        <TabsList className="bg-slate-200/50 h-9 p-1">
                          {allOUs.map((ou) => (
                            <TabsTrigger key={ou} value={ou.toLowerCase()} className="text-[9px] font-bold uppercase tracking-widest px-4 h-7 data-[state=active]:bg-white">
                              {ou}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        <div className="flex items-center gap-3">
                           <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setIsOUDialogOpen(true)}
                              className="h-9 text-primary font-bold text-[9px] uppercase"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add OU
                           </Button>
                           <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="h-9 font-bold px-4 gap-2 bg-slate-900 text-white">
                             <UserPlus className="w-3.5 h-3.5" />
                             Create User
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 min-h-[400px]">
                      {isUsersLoading ? (
                        <div className="py-40 flex flex-col items-center justify-center gap-3">
                           <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                           <p className="text-[10px] font-bold text-slate-400 uppercase">Syncing Profiles...</p>
                        </div>
                      ) : (
                        allOUs.map((ou) => (
                          <TabsContent key={ou} value={ou.toLowerCase()} className="m-0">
                             <Table>
                               <TableHeader className="bg-slate-50/30">
                                 <TableRow className="border-b border-slate-100">
                                   <TableHead className="text-[10px] font-bold uppercase py-4 pl-8">Identity</TableHead>
                                   <TableHead className="text-[10px] font-bold uppercase py-4">Cloud Email</TableHead>
                                   <TableHead className="text-[10px] font-bold uppercase py-4">Status</TableHead>
                                   <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8">Actions</TableHead>
                                 </TableRow>
                               </TableHeader>
                               <TableBody>
                                 {users.filter(u => u.orgUnitPath === `/${ou}`).length === 0 ? (
                                   <TableRow>
                                      <TableCell colSpan={4} className="py-24 text-center text-slate-400 text-xs italic">
                                         No active accounts in the {ou} unit.
                                      </TableCell>
                                   </TableRow>
                                 ) : (
                                   users.filter(u => u.orgUnitPath === `/${ou}`).map((u) => (
                                     <TableRow key={u.id} className="hover:bg-slate-50 transition-colors border-b last:border-0">
                                       <TableCell className="pl-8 py-5">
                                          <div className="flex items-center gap-3">
                                             <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                                {u.name.substring(0, 1)}
                                             </div>
                                             <span className="text-sm font-bold text-slate-800">{u.name}</span>
                                          </div>
                                       </TableCell>
                                       <TableCell className="font-mono text-xs text-slate-500">{u.email}</TableCell>
                                       <TableCell>
                                          <Badge className={cn("text-[9px] font-bold shadow-none", u.status === 'Active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100")}>
                                            {u.status.toUpperCase()}
                                          </Badge>
                                       </TableCell>
                                       <TableCell className="text-right pr-8">
                                          <div className="flex items-center justify-end gap-1">
                                             <Button variant="ghost" size="icon" onClick={() => {setResetData({userId: u.id, userName: u.name, newPassword: "", forceChange: true}); setIsResetDialogOpen(true)}} className="h-8 w-8 text-slate-400 hover:text-primary"><Key className="w-3.5 h-3.5" /></Button>
                                             <Button variant="ghost" size="icon" onClick={() => handleArchiveUser(u.id, u.status)} className="h-8 w-8 text-slate-400 hover:text-amber-500"><Archive className="w-3.5 h-3.5" /></Button>
                                             <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u.id)} className="h-8 w-8 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
                                          </div>
                                       </TableCell>
                                     </TableRow>
                                   ))
                                 )}
                               </TableBody>
                             </Table>
                          </TabsContent>
                        ))
                      )}
                    </CardContent>
                 </Tabs>
               </Card>
            </TabsContent>

            <TabsContent value="storage" className="m-0">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {allOUs.map((ou) => (
                   <Card key={ou} className="bg-white border-slate-200 shadow-sm overflow-hidden">
                     <CardHeader className="py-4 px-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                        <HardDrive className="w-4 h-4 text-slate-400" />
                        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{ou} Allocation</CardTitle>
                     </CardHeader>
                     <CardContent className="p-6 space-y-4">
                        <div className="space-y-1.5">
                           <Label className="text-[10px] font-bold text-slate-400 uppercase">Max Quota (GB)</Label>
                           <Input defaultValue={ou === "Students" ? "5" : "100"} className="h-10 font-bold border-slate-200" />
                        </div>
                        <Button className="w-full bg-slate-900 text-white font-bold h-10">Apply Cloud Policy</Button>
                     </CardContent>
                   </Card>
                 ))}
               </div>
            </TabsContent>

            <TabsContent value="archived" className="m-0 space-y-6">
               <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                 <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6 flex flex-row items-center justify-between">
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Retention Registry</CardTitle>
                    <Badge variant="outline" className="bg-white">{users.filter(u => u.archived).length} Archived</Badge>
                 </CardHeader>
                 <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50/30">
                         <TableRow className="border-b border-slate-100">
                           <TableHead className="text-[10px] font-bold uppercase py-4 pl-8">Former Identity</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4">Cloud Email</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8">Actions</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.filter(u => u.archived).length === 0 ? (
                          <TableRow>
                             <TableCell colSpan={3} className="py-24 text-center text-slate-400 text-xs italic">No archived records found.</TableCell>
                          </TableRow>
                        ) : (
                          users.filter(u => u.archived).map(u => (
                            <TableRow key={u.id} className="hover:bg-slate-50 transition-colors border-b last:border-0">
                              <TableCell className="pl-8 py-5">
                                 <span className="text-sm font-bold text-slate-400 line-through">{u.name}</span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-slate-400">{u.email}</TableCell>
                              <TableCell className="text-right pr-8">
                                 <Button variant="outline" size="sm" onClick={() => handleArchiveUser(u.id, u.status)} className="h-8 text-[10px] font-bold uppercase">Restore Access</Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                 </CardContent>
               </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Create User Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
               <DialogTitle className="font-headline font-bold text-xl">Provision New Cloud Identity</DialogTitle>
               <p className="text-slate-400 text-xs mt-1">Deploy new credentials to {selectedOrg?.domain}.</p>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <Label className="text-[10px] font-bold uppercase text-slate-500">First Name</Label>
                   <Input value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} placeholder="Sagar" className="h-10 text-xs font-bold" />
                </div>
                <div className="space-y-1.5">
                   <Label className="text-[10px] font-bold uppercase text-slate-500">Last Name</Label>
                   <Input value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} placeholder="Poudel" className="h-10 text-xs font-bold" />
                </div>
              </div>
              <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">User Email Prefix</Label>
                 <div className="flex items-center gap-2">
                    <Input value={newUser.emailPrefix} onChange={e => setNewUser({...newUser, emailPrefix: e.target.value})} placeholder="username" className="h-10 text-xs font-bold flex-1" />
                    <span className="text-xs font-bold text-slate-400">@{selectedOrg?.domain}</span>
                 </div>
              </div>
              <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">Master Password</Label>
                 <Input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} placeholder="••••••••" className="h-10 text-xs font-bold" />
              </div>
              <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">Assign to OU</Label>
                 <select 
                   className="w-full h-10 px-3 text-xs font-bold border border-slate-200 rounded-md outline-none"
                   value={newUser.orgUnit}
                   onChange={e => setNewUser({...newUser, orgUnit: e.target.value})}
                 >
                   <option value="">Select Unit</option>
                   {allOUs.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                 </select>
              </div>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t">
               <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
               <Button onClick={handleCreateUser} disabled={isUpdating} className="px-8 bg-slate-900 text-white font-bold h-11">
                 {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Commit Identity"}
               </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Custom OU Dialog */}
        <Dialog open={isOUDialogOpen} onOpenChange={setIsOUDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <DialogTitle className="font-headline font-bold text-xl">Register Custom OU</DialogTitle>
            </DialogHeader>
            <div className="p-8 space-y-4">
              <Label className="text-[10px] font-bold uppercase text-slate-500">Unit Name</Label>
              <Input 
                placeholder="e.g. Alumni, Contractor" 
                value={newOUType}
                className="h-11 font-bold border-slate-200"
                onChange={(e) => setNewOUType(e.target.value)}
              />
              <p className="text-[10px] text-slate-400 font-medium">Custom units allow for granular storage and security rules.</p>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t">
              <Button variant="ghost" onClick={() => setIsOUDialogOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
              <Button onClick={handleAddUserType} disabled={isUpdating || !newOUType} className="px-8 bg-slate-900 text-white font-bold h-11">
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Deploy Unit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
               <DialogTitle className="font-headline font-bold text-xl">Reset Access Credentials</DialogTitle>
               <p className="text-slate-400 text-xs mt-1">Issue new secure password for {resetData.userName}.</p>
            </DialogHeader>
            <div className="p-6 space-y-4">
               <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">New Password</Label>
                  <Input 
                    type="password" 
                    value={resetData.newPassword} 
                    onChange={e => setResetData({...resetData, newPassword: e.target.value})} 
                    placeholder="Min. 8 characters" 
                    className="h-11 text-xs font-bold" 
                  />
               </div>
               <div className="flex items-center space-x-3 p-4 bg-slate-50 border rounded-lg">
                  <Checkbox 
                    id="force-reset" 
                    checked={resetData.forceChange} 
                    onCheckedChange={checked => setResetData({...resetData, forceChange: !!checked})} 
                  />
                  <label htmlFor="force-reset" className="text-xs font-bold text-slate-900 cursor-pointer">Force change on next login</label>
               </div>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t">
               <Button variant="ghost" onClick={() => setIsResetDialogOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
               <Button 
                 onClick={async () => {
                   setIsUpdating(true)
                   const res = await resetUserPassword(resetData.userId, resetData.newPassword, resetData.forceChange, selectedOrg?.contactEmail)
                   if (res.success) {
                     toast({ title: "Password Updated", description: "Cloud access credentials have been reset." })
                     setIsResetDialogOpen(false)
                   }
                   setIsUpdating(false)
                 }} 
                 disabled={isUpdating || !resetData.newPassword} 
                 className="px-8 bg-slate-900 text-white font-bold h-11"
               >
                 {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Commit New Password"}
               </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
