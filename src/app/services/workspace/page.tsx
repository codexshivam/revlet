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
  listOrgUnits,
  createOrgUnit,
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
  
  // Connection state
  const [selectedScopes, setSelectedScopes] = useState<string[]>(SCOPES.map(s => s.url))
  
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
    if (!selectedOrg?.managedWorkspace) return
    
    setIsUsersLoading(true)
    const [usersRes, storageRes] = await Promise.all([
      listWorkspaceUsers('/', selectedOrg.contactEmail),
      getCustomerStorageUsage(selectedOrg.contactEmail)
    ])

    if (usersRes.success) setUsers(usersRes.data)
    if (storageRes.success) setStorageStats(storageRes.data)
    setIsUsersLoading(false)
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: "Copied", description: `${label} copied to clipboard.` })
  }

  const handleCopyIndividualScope = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedScope(url)
    toast({ title: "Scope Copied", description: "API Scope URL ready for pasting." })
    setTimeout(() => setCopiedScope(null), 2000)
  }

  const defaultOUs = selectedOrg?.gEducation 
    ? ["Students", "Teachers", "Main People", "Staffs"] 
    : ["Users", "Main People"]
  
  const allOUs = [...defaultOUs, ...(selectedOrg?.customUserTypes || [])]

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
              
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
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

        {/* State 4: Migration Guideline (DWD Authorization) */}
        {selectedOrg && selectedOrg.workspaceActive === true && !selectedOrg.managedWorkspace && (
          <div className="max-w-5xl mx-auto py-8 space-y-12">
            <div className="text-center space-y-2">
              <Badge className="bg-blue-50 text-blue-600 border-blue-100 mb-2">MIGRATION PROTOCOL</Badge>
              <h2 className="text-3xl font-headline font-bold text-slate-900">Authorize Domain-Wide Delegation</h2>
              <p className="text-slate-500 text-sm font-medium">Follow these steps to securely link your Google Admin environment to our management platform.</p>
            </div>

            <div className="space-y-8">
              {/* Instructions First */}
              <Card className="bg-slate-900 text-white p-8 shadow-2xl border-none">
                 <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                       <Settings className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-4 flex-1">
                       <h4 className="text-xl font-bold">Step-by-Step Instructions</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">1</Badge>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Initialize Console</span>
                             </div>
                             <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                Log in to your <span className="text-white font-bold">Google Admin Console</span> with super-admin credentials.
                             </p>
                          </div>
                          <div className="space-y-3">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">2</Badge>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Locate Security Controls</span>
                             </div>
                             <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                Navigate to <span className="text-white font-bold">Security &gt; API Controls &gt; Manage Domain Wide Delegation</span>.
                             </p>
                          </div>
                          <div className="space-y-3">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">3</Badge>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Register API Client</span>
                             </div>
                             <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                Click <span className="text-white font-bold">Add new</span> and paste the <span className="text-primary font-bold">System Client ID</span> provided below.
                             </p>
                          </div>
                          <div className="space-y-3">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-white/20 text-white h-5 w-5 p-0 flex items-center justify-center font-bold">4</Badge>
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Delegate Permissions</span>
                             </div>
                             <p className="text-xs text-slate-300 leading-relaxed font-medium">
                                Copy the <span className="text-primary font-bold">API Scopes</span> from the checklist and click <span className="text-white font-bold">Authorize</span>.
                             </p>
                          </div>
                       </div>
                    </div>
                 </div>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-1 bg-white border-slate-200 shadow-sm flex flex-col">
                  <CardHeader className="py-4 px-6 border-b border-slate-100 bg-slate-50/50">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System Client ID</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 flex-1 flex flex-col justify-center gap-4">
                    <div className="relative group">
                       <code className="text-sm font-mono font-bold text-primary block text-center py-6 bg-slate-50 rounded-xl border border-slate-200 group-hover:border-primary/30 transition-colors">
                        {SYSTEM_CLIENT_ID}
                      </code>
                    </div>
                    <Button onClick={() => copyToClipboard(SYSTEM_CLIENT_ID, "Client ID")} className="w-full bg-slate-900 text-white font-bold h-12 shadow-lg">
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Client ID
                    </Button>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 bg-white border-slate-200 shadow-sm flex flex-col">
                  <CardHeader className="py-4 px-6 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Required API Scopes</CardTitle>
                    <Badge variant="outline" className="text-[9px] font-bold h-5 bg-white">{selectedScopes.length} Scopes Selected</Badge>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 flex flex-col">
                    <div className="flex-1 max-h-[300px] overflow-y-auto no-scrollbar divide-y divide-slate-100">
                      {SCOPES.map((scope) => (
                        <div key={scope.url} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-all group">
                          <div className="flex items-center space-x-4 flex-1 min-w-0">
                            <Checkbox 
                              id={scope.url} 
                              checked={selectedScopes.includes(scope.url)} 
                              onCheckedChange={(checked) => {
                                setSelectedScopes(prev => checked ? [...prev, scope.url] : prev.filter(s => s !== scope.url))
                              }}
                            />
                            <label htmlFor={scope.url} className="text-[10px] font-mono font-bold text-slate-500 cursor-pointer flex-1 truncate pr-4">
                              {scope.url}
                            </label>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleCopyIndividualScope(scope.url)}
                            className="h-8 w-8 text-slate-300 hover:text-primary shrink-0"
                          >
                            {copiedScope === scope.url ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                       <Button 
                        variant="outline" 
                        onClick={() => copyToClipboard(selectedScopes.join(', '), "All Scopes")} 
                        disabled={selectedScopes.length === 0}
                        className="w-full border-slate-200 font-bold h-11 bg-white"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Selected Comma-Separated List
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col items-center gap-6 pt-8 border-t border-slate-100">
                 <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 max-w-lg text-center">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                       Propagation of delegation settings typically takes 2-5 minutes in Google's systems.
                    </p>
                 </div>
                 <Button onClick={handleVerify} disabled={isUpdating} className="h-14 px-16 text-lg font-bold shadow-xl shadow-primary/20 gap-3 group">
                   {isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-6 h-6 group-hover:scale-110 transition-transform" />}
                   Verify & Activate Connection
                 </Button>
              </div>
            </div>
          </div>
        )}

        {/* State 5: Active Management Dashboard */}
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
                Sync Data
              </Button>
            </div>

            <TabsContent value="hub" className="m-0 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {(selectedOrg.gEducation 
                  ? [
                    { label: "Students Count", val: "1,420", icon: GraduationCap },
                    { label: "Teachers Count", val: "85", icon: Users },
                    { label: "Main People", val: "12", icon: UserCog },
                    { label: "Staffs Count", val: "42", icon: Network },
                  ]
                  : [
                    { label: "Total Users", val: "156", icon: Users },
                    { label: "Main People", val: "5", icon: UserCog },
                    { label: "OUs Count", val: "3", icon: Network },
                    { label: "Groups", val: "8", icon: Bell },
                  ]
                ).map((m) => (
                  <Card key={m.label} className="bg-white border-slate-200 shadow-sm overflow-hidden group">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-primary/5 transition-colors">
                           <m.icon className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                        </div>
                        <Badge variant="outline" className="text-[9px] font-bold h-4 bg-emerald-50 text-emerald-600 border-emerald-100">ACTIVE</Badge>
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
                       <span>{Math.round((storageStats.used / storageStats.total) * 100)}% Utilised</span>
                       <span>{(storageStats.total - storageStats.used).toFixed(1)} TB Available</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 bg-white border-slate-200 shadow-sm overflow-hidden">
                  <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6">
                    <div className="flex items-center gap-2">
                       <Bell className="w-4 h-4 text-slate-400" />
                       <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Alert Center</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100">
                      {[
                        { id: 1, type: "CRITICAL", msg: "Multiple failed login attempts detected on administrative account", time: "2m ago" },
                        { id: 2, type: "WARNING", msg: "Students OU collective storage has reached 88% capacity", time: "1h ago" },
                        { id: 3, type: "INFO", msg: "Directory sync executed successfully", time: "4h ago" },
                      ].map((log) => (
                        <div key={log.id} className="p-5 flex items-start justify-between hover:bg-slate-50/50 transition-colors">
                          <div className="flex gap-4">
                            <Badge className={cn(
                              "text-[9px] font-bold h-5 px-1.5 border shadow-none",
                              log.type === "CRITICAL" ? "bg-red-50 text-red-600 border-red-100" :
                              log.type === "WARNING" ? "bg-amber-50 text-amber-700 border-amber-100" :
                              "bg-slate-50 text-slate-500 border-slate-100"
                            )}>
                              {log.type}
                            </Badge>
                            <p className="text-xs font-medium text-slate-700 leading-tight">{log.msg}</p>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{log.time}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900 text-white shadow-2xl relative overflow-hidden flex flex-col justify-center p-8">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Network className="w-32 h-32 rotate-12" />
                  </div>
                  <div className="relative space-y-6">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                       <Cloud className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-headline font-bold">Admin Console</h4>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        Secure gateway to Google's master control panel for advanced policy enforcement.
                      </p>
                    </div>
                    <Button asChild className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold h-12 group">
                      <a href="https://admin.google.com" target="_blank" rel="noopener noreferrer">
                        Launch Console
                        <ArrowUpRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </a>
                    </Button>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="users" className="m-0 space-y-6">
               <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                 <Tabs defaultValue={allOUs[0].toLowerCase()} className="w-full">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-0">
                      <div className="flex flex-col md:flex-row items-center justify-between p-4 px-6 gap-4">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0">
                          <TabsList className="bg-slate-200/50 h-9 p-1">
                            {allOUs.map((ou) => (
                              <TabsTrigger key={ou} value={ou.toLowerCase()} className="text-[9px] font-bold uppercase tracking-widest px-4 h-7 data-[state=active]:bg-white">
                                {ou}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setIsOUDialogOpen(true)}
                            disabled={(selectedOrg.customUserTypes?.length || 0) >= 5}
                            className="h-8 text-primary font-bold text-[9px] uppercase gap-1 px-3 hover:bg-primary/5"
                          >
                            <Plus className="w-3 h-3" />
                            Add Type
                          </Button>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
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
                           <p className="text-[10px] font-bold text-slate-400 uppercase">Indexing Directory...</p>
                        </div>
                      ) : (
                        allOUs.map((ou) => (
                          <TabsContent key={ou} value={ou.toLowerCase()} className="m-0">
                             <Table>
                               <TableHeader className="bg-slate-50/30">
                                 <TableRow className="border-b border-slate-100">
                                   <TableHead className="text-[10px] font-bold uppercase py-4 pl-8 w-1/3">User Identity</TableHead>
                                   <TableHead className="text-[10px] font-bold uppercase py-4">Workspace Email</TableHead>
                                   <TableHead className="text-[10px] font-bold uppercase py-4">Storage Usage</TableHead>
                                   <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8">Actions</TableHead>
                                 </TableRow>
                               </TableHeader>
                               <TableBody>
                                 {users.filter(u => u.orgUnitPath === `/${ou}`).length === 0 ? (
                                   <TableRow>
                                      <TableCell colSpan={4} className="py-24 text-center text-slate-400 text-xs italic">
                                         No users found in the {ou} organizational unit.
                                      </TableCell>
                                   </TableRow>
                                 ) : (
                                   users.filter(u => u.orgUnitPath === `/${ou}`).map((u) => (
                                     <TableRow key={u.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                                       <TableCell className="pl-8 py-5">
                                          <div className="flex items-center gap-3">
                                             <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
                                                {u.name.substring(0, 1)}
                                             </div>
                                             <div className="flex flex-col">
                                                <span className="text-sm font-bold text-slate-800">{u.name}</span>
                                                <Badge variant="outline" className={cn(
                                                  "text-[8px] font-bold h-4 w-fit px-1 shadow-none border",
                                                  u.status === 'Active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                                                )}>
                                                  {u.status.toUpperCase()}
                                                </Badge>
                                             </div>
                                          </div>
                                       </TableCell>
                                       <TableCell className="font-mono text-xs text-slate-500 font-medium">{u.email}</TableCell>
                                       <TableCell className="text-xs font-bold text-slate-600">{u.storage}</TableCell>
                                       <TableCell className="text-right pr-8">
                                          <div className="flex items-center justify-end gap-1">
                                             <Button 
                                               variant="ghost" 
                                               size="icon" 
                                               title="Reset Password"
                                               onClick={() => {
                                                 setResetData({ userId: u.id, userName: u.name, newPassword: "", forceChange: true })
                                                 setIsResetDialogOpen(true)
                                               }}
                                               className="h-8 w-8 text-slate-400 hover:text-primary"
                                             >
                                               <Key className="w-3.5 h-3.5" />
                                             </Button>
                                             <Button 
                                               variant="ghost" 
                                               size="icon" 
                                               title={u.status === 'Active' ? "Archive Account" : "Activate Account"}
                                               onClick={() => handleArchiveUser(u.id, u.status)}
                                               className="h-8 w-8 text-slate-400 hover:text-amber-500"
                                             >
                                               <Archive className="w-3.5 h-3.5" />
                                             </Button>
                                             <Button 
                                               variant="ghost" 
                                               size="icon" 
                                               title="Delete Permanently"
                                               onClick={() => handleDeleteUser(u.id)}
                                               className="h-8 w-8 text-slate-400 hover:text-red-500"
                                             >
                                               <Trash2 className="w-3.5 h-3.5" />
                                             </Button>
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

            <TabsContent value="storage" className="m-0 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {allOUs.map((ou) => (
                   <Card key={ou} className="bg-white border-slate-200 shadow-sm overflow-hidden">
                     <CardHeader className="py-4 px-6 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                           <div className="p-2 bg-white rounded-lg shadow-sm">
                              <HardDrive className="w-4 h-4 text-slate-400" />
                           </div>
                           <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-600">{ou} Allocation</CardTitle>
                        </div>
                     </CardHeader>
                     <CardContent className="p-6 space-y-6">
                        <div className="space-y-2">
                           <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max Storage Limit (GB)</Label>
                           <div className="relative">
                              <Input defaultValue={ou === "Students" ? "5" : "100"} className="h-11 font-bold border-slate-200 bg-slate-50/50" />
                              <span className="absolute right-4 top-3 text-[10px] font-bold text-slate-400 uppercase">GB</span>
                           </div>
                        </div>
                        <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex gap-3">
                           <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                           <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                             This policy controls the hard quota tier directly for all accounts under this specific Google Workspace User Type.
                           </p>
                        </div>
                        <Button className="w-full h-11 font-bold bg-slate-900 text-white">Apply Storage Policy</Button>
                     </CardContent>
                   </Card>
                 ))}
               </div>
            </TabsContent>

            <TabsContent value="archived" className="m-0 space-y-6">
               <Card className="bg-white border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-6">
                    <div className="flex-1 space-y-1.5">
                       <Label className="text-[10px] font-bold uppercase text-slate-400">Filter Archive Timeline</Label>
                       <div className="flex items-center gap-3">
                          <div className="relative flex-1">
                             <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                             <Input type="date" className="pl-10 h-10 border-slate-200 text-xs font-bold" />
                          </div>
                          <span className="text-slate-300 text-xs font-bold">to</span>
                          <div className="relative flex-1">
                             <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                             <Input type="date" className="pl-10 h-10 border-slate-200 text-xs font-bold" />
                          </div>
                       </div>
                    </div>
                  </div>
               </Card>

               <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                 <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6 flex flex-row items-center justify-between">
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archived Retention Ledger</CardTitle>
                    <Badge variant="outline" className="text-[10px] font-bold text-slate-400 px-2 h-5 bg-white border-slate-200">
                      {users.filter(u => u.archived).length} Archived Records
                    </Badge>
                 </CardHeader>
                 <CardContent className="p-0 min-h-[300px]">
                    <Table>
                      <TableHeader className="bg-slate-50/30">
                         <TableRow className="border-b border-slate-100">
                           <TableHead className="text-[10px] font-bold uppercase py-4 pl-8">Former Identity</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4">Original Type</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4">Status</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8">Actions</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.filter(u => u.archived).length === 0 ? (
                          <TableRow>
                             <TableCell colSpan={4} className="py-24 text-center text-slate-400 text-xs italic">
                               No archived accounts found in the directory.
                             </TableCell>
                          </TableRow>
                        ) : (
                          users.filter(u => u.archived).map(u => (
                            <TableRow key={u.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50">
                              <TableCell className="pl-8 py-5">
                                 <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-400 line-through">{u.name}</span>
                                    <span className="text-[10px] font-mono text-slate-400">{u.email}</span>
                                 </div>
                              </TableCell>
                              <TableCell className="text-xs font-bold text-slate-600">{u.orgUnitPath.substring(1)}</TableCell>
                              <TableCell className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">SUSPENDED</TableCell>
                              <TableCell className="text-right pr-8">
                                 <div className="flex items-center justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => handleArchiveUser(u.id, u.status)} className="h-8 text-[10px] font-bold uppercase tracking-widest border-slate-200">Restore</Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u.id)} className="h-8 w-8 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
                                 </div>
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
               <DialogTitle className="font-headline font-bold text-xl">Create Workspace Identity</DialogTitle>
               <p className="text-slate-400 text-xs mt-1">Authorize new account access for {selectedOrg?.domain}.</p>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <Label className="text-[10px] font-bold uppercase text-slate-500">First Name</Label>
                   <Input value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} placeholder="e.g. Sagar" className="h-10 text-xs font-bold" />
                </div>
                <div className="space-y-1.5">
                   <Label className="text-[10px] font-bold uppercase text-slate-500">Last Name</Label>
                   <Input value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} placeholder="e.g. Poudel" className="h-10 text-xs font-bold" />
                </div>
              </div>
              <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">Email Identifier</Label>
                 <div className="flex items-center gap-2">
                    <Input value={newUser.emailPrefix} onChange={e => setNewUser({...newUser, emailPrefix: e.target.value})} placeholder="username" className="h-10 text-xs font-bold flex-1" />
                    <span className="text-xs font-bold text-slate-400">@{selectedOrg?.domain}</span>
                 </div>
              </div>
              <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">Security Password</Label>
                 <Input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} placeholder="••••••••" className="h-10 text-xs font-bold" />
              </div>
              <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">Assign to OU</Label>
                 <select 
                   className="w-full h-10 px-3 text-xs font-bold border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-primary"
                   value={newUser.orgUnit}
                   onChange={e => setNewUser({...newUser, orgUnit: e.target.value})}
                 >
                   <option value="">Select Unit</option>
                   {allOUs.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                 </select>
              </div>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
               <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
               <Button onClick={handleCreateUser} disabled={isUpdating} className="px-8 bg-slate-900 text-white font-bold h-11">
                 {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Deploy Identity"}
               </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
               <DialogTitle className="font-headline font-bold text-xl">Reset Security Access</DialogTitle>
               <p className="text-slate-400 text-xs mt-1">Issue new credentials for {resetData.userName}.</p>
            </DialogHeader>
            <div className="p-6 space-y-4">
               <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">New Secure Password</Label>
                  <Input 
                    type="password" 
                    value={resetData.newPassword} 
                    onChange={e => setResetData({...resetData, newPassword: e.target.value})} 
                    placeholder="Min. 8 characters" 
                    className="h-11 text-xs font-bold" 
                  />
               </div>
               <div className="flex items-center space-x-3 p-4 bg-slate-50 border border-slate-100 rounded-lg">
                  <Checkbox 
                    id="force-reset" 
                    checked={resetData.forceChange} 
                    onCheckedChange={checked => setResetData({...resetData, forceChange: !!checked})} 
                  />
                  <div className="space-y-0.5">
                    <label htmlFor="force-reset" className="text-xs font-bold text-slate-900 block cursor-pointer">Force change on next login</label>
                    <p className="text-[10px] text-slate-400 font-medium">Ensures only the user knows the actual password.</p>
                  </div>
               </div>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
               <Button variant="ghost" onClick={() => setIsResetDialogOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
               <Button 
                 onClick={async () => {
                   setIsUpdating(true)
                   const res = await resetUserPassword(resetData.userId, resetData.newPassword, resetData.forceChange, selectedOrg?.contactEmail)
                   if (res.success) {
                     toast({ title: "Password Updated", description: `Credentials for ${resetData.userName} have been reset.` })
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

        {/* Custom OU Dialog */}
        <Dialog open={isOUDialogOpen} onOpenChange={setIsOUDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <DialogTitle className="font-headline font-bold text-xl">Register Custom User Type</DialogTitle>
              <p className="text-slate-400 text-xs mt-1">This will create a new top-level Organizational Unit (OU).</p>
            </DialogHeader>
            <div className="p-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ou-name" className="text-[10px] font-bold uppercase text-slate-500">User Type Name</Label>
                <Input 
                  id="ou-name" 
                  placeholder="e.g. Contractors, Alumni, Guest" 
                  value={newOUType}
                  className="h-11 font-bold border-slate-200"
                  onChange={(e) => setNewOUType(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                Custom types allow for granular storage allocation and specific security policies within the Google Workspace environment.
              </p>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setIsOUDialogOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
              <Button onClick={handleAddUserType} disabled={isUpdating || !newOUType} className="px-8 bg-slate-900 hover:bg-black text-white font-bold h-11">
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Register Type"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
