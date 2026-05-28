
"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  ShieldCheck, 
  Mail, 
  Info, 
  CheckCircle, 
  Clock, 
  GraduationCap, 
  Users, 
  Database, 
  Settings, 
  Plus, 
  MoreVertical,
  Key,
  Archive,
  Trash2,
  Loader2,
  Server,
  Network,
  Cloud,
  ChevronRight,
  UserPlus,
  FolderPlus,
  ArrowUpRight
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore"
import { listWorkspaceUsers, createWorkspaceUser, updateWorkspaceUser, deleteWorkspaceUser, listOrgUnits, createOrgUnit } from "@/app/actions/google-workspace"
import { cn } from "@/lib/utils"

interface Organization {
  id: string
  name: string
  domain: string
  workspaceStatus?: "unregistered" | "applied" | "pending" | "active"
  workspaceDomain?: string
  workspaceCustomerId?: string
  workspaceAppliedAt?: any
}

interface WorkspaceUser {
  id: string
  name: string
  email: string
  status: string
  storage: string
  archived: boolean
}

interface OrgUnit {
  name: string
  path: string
}

export default function WorkspaceManagementPage() {
  const { toast } = useToast()
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [wsUsers, setWsUsers] = useState<WorkspaceUser[]>([])
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  
  // Modals state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [isOUModalOpen, setIsOUModalOpen] = useState(false)
  const [isPassModalOpen, setIsPassModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<WorkspaceUser | null>(null)
  
  // Forms state
  const [userFormData, setUserFormData] = useState({ firstName: "", lastName: "", email: "", password: "" })
  const [ouFormData, setOUFormData] = useState({ name: "", parent: "/" })
  const [newPassword, setNewPassword] = useState("")

  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

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
    if (selectedOrg?.workspaceStatus === 'active') {
      fetchWorkspaceData()
    }
  }, [selectedOrg])

  const fetchWorkspaceData = async () => {
    setIsSyncing(true)
    const [usersRes, ouRes] = await Promise.all([
      listWorkspaceUsers(selectedOrg?.workspaceCustomerId),
      listOrgUnits(selectedOrg?.workspaceCustomerId)
    ])
    
    if (usersRes.success) setWsUsers(usersRes.data)
    if (ouRes.success) setOrgUnits(ouRes.data)
    setIsSyncing(false)
  }

  const handleApply = async () => {
    if (!selectedOrg) return
    setIsApplying(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    updateDoc(orgRef, {
      workspaceStatus: "applied",
      workspaceAppliedAt: serverTimestamp()
    }).then(() => {
      toast({ title: "Application Submitted", description: "Request for Google Workspace for Ed. is being processed." })
    }).finally(() => setIsApplying(false))
  }

  const handleCreateUser = async () => {
    if (!selectedOrg) return
    setIsSyncing(true)
    const res = await createWorkspaceUser(userFormData)
    if (res.success) {
      toast({ title: "User Created", description: `${userFormData.email} has been added.` })
      setIsUserModalOpen(false)
      fetchWorkspaceData()
    } else {
      toast({ variant: "destructive", title: "Creation Failed", description: res.error })
    }
    setIsSyncing(false)
  }

  const handleArchiveUser = async (user: WorkspaceUser) => {
    setIsSyncing(true)
    const res = await updateWorkspaceUser(user.id, { archived: !user.archived })
    if (res.success) {
      toast({ title: user.archived ? "User Restored" : "User Archived" })
      fetchWorkspaceData()
    }
    setIsSyncing(false)
  }

  const handleUpdatePassword = async () => {
    if (!editingUser) return
    setIsSyncing(true)
    const res = await updateWorkspaceUser(editingUser.id, { password: newPassword, changePasswordAtNextLogin: true })
    if (res.success) {
      toast({ title: "Password Reset", description: "Staff will be prompted to change it on next login." })
      setIsPassModalOpen(false)
    }
    setIsSyncing(false)
  }

  if (isLoading || authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Accessing Directory...</p>
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
            <h1 className="text-3xl font-headline font-bold text-slate-900">Google Workspace for Ed.</h1>
            <div className="flex items-center gap-3">
               {selectedOrg?.workspaceStatus === 'active' && (
                 <Button variant="outline" size="sm" onClick={fetchWorkspaceData} disabled={isSyncing} className="h-9 gap-2 font-bold text-xs border-slate-200">
                   {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                   Sync Directory
                 </Button>
               )}
            </div>
          </div>
        </div>
        
        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        {(!selectedOrg?.workspaceStatus || selectedOrg?.workspaceStatus === 'unregistered') ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center py-8">
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="p-3 bg-primary/10 rounded-xl w-fit">
                  <GraduationCap className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-4xl font-headline font-bold text-slate-900 leading-tight">
                  Professional Education Infrastructure
                </h2>
                <p className="text-slate-500 text-lg leading-relaxed max-w-lg">
                  Empower your students and faculty with the global standard for collaboration. Fundamentals is available at no cost for qualifying institutions.
                </p>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  "Institutional @domain emails",
                  "100 TB Shared Storage Pool",
                  "Google Classroom Integration",
                  "Advanced Data Protection"
                ].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm font-bold text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button onClick={handleApply} disabled={isApplying} size="lg" className="h-14 px-10 font-bold shadow-2xl shadow-primary/20 text-lg group">
                {isApplying ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <ArrowUpRight className="w-5 h-5 mr-3 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />}
                Apply for Fundamentals
              </Button>
            </div>
            
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/5 rounded-3xl blur-3xl group-hover:bg-primary/10 transition-colors" />
              <Card className="relative bg-white border-slate-200 overflow-hidden shadow-2xl rounded-3xl">
                <img src="https://picsum.photos/seed/workspace/800/600" alt="Workspace Preview" className="w-full h-auto grayscale opacity-50 contrast-125" />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[2px]">
                   <ShieldCheck className="w-16 h-16 text-slate-300 mb-4" />
                   <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Management Locked</p>
                </div>
              </Card>
            </div>
          </div>
        ) : (selectedOrg?.workspaceStatus === 'applied' || selectedOrg?.workspaceStatus === 'pending') ? (
          <div className="max-w-4xl mx-auto py-20 animate-in fade-in slide-in-from-bottom-4">
            <Card className="bg-amber-50 border-amber-200 shadow-sm border-dashed">
              <CardContent className="p-20 flex flex-col items-center text-center gap-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-white border-2 border-amber-100 flex items-center justify-center shadow-lg">
                    <Clock className="w-10 h-10 text-amber-500 animate-pulse" />
                  </div>
                  <Badge className="absolute -top-2 -right-4 bg-amber-500 text-white border-4 border-white px-4 py-1 font-bold text-[10px] uppercase shadow-md">
                    PENDING APPROVAL
                  </Badge>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-2xl font-headline font-bold text-amber-900">Application Under Verification</h3>
                  <p className="text-amber-700/70 max-w-lg mx-auto text-sm leading-relaxed font-medium">
                    Application for <span className="font-bold">{selectedOrg.domain}</span> has been submitted to Google. REVLET is managing the domain ownership verification process.
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 font-bold px-8 h-11">View Status History</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : selectedOrg?.workspaceStatus === 'active' && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Storage Status</CardTitle>
                  <Database className="w-4 h-4 text-slate-300" />
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-500 uppercase tracking-tighter">Pool Usage</span>
                      <span className="text-slate-900">12.4 TB / 100 TB</span>
                    </div>
                    <Progress value={12.4} className="h-2 bg-slate-100" />
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <p className="text-[10px] text-emerald-700 font-bold leading-relaxed">
                      Fundamentals quota active. No storage overages detected across {wsUsers.length} accounts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Directory</CardTitle>
                  <Users className="w-4 h-4 text-slate-300" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                       <p className="text-[10px] font-bold text-slate-400 uppercase">Active</p>
                       <p className="text-xl font-headline font-bold text-slate-900">{wsUsers.filter(u => !u.archived).length}</p>
                     </div>
                     <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                       <p className="text-[10px] font-bold text-slate-400 uppercase">Archived</p>
                       <p className="text-xl font-headline font-bold text-slate-900">{wsUsers.filter(u => u.archived).length}</p>
                     </div>
                  </div>
                  <Button variant="outline" className="w-full h-10 font-bold text-xs" onClick={() => setIsUserModalOpen(true)}>
                    <UserPlus className="w-3.5 h-3.5 mr-2" />
                    Provision User
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 text-white shadow-xl shadow-slate-200 overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <Network className="w-24 h-24 rotate-12" />
                </div>
                <CardContent className="p-8 flex flex-col h-full justify-between">
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center mb-4">
                       <Settings className="w-5 h-5 text-primary" />
                    </div>
                    <h4 className="font-headline font-bold text-xl tracking-tight">Admin Console</h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                      Direct access to Google's master control panel for advanced policy management.
                    </p>
                  </div>
                  <Button className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold mt-8 h-12 shadow-lg group">
                    Launch Google Admin
                    <ArrowUpRight className="w-4 h-4 ml-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
              <Tabs defaultValue="users" className="w-full">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-0">
                  <div className="flex flex-col md:flex-row md:items-center justify-between p-4 px-6 gap-4">
                    <TabsList className="bg-slate-100 h-9 p-1">
                      <TabsTrigger value="users" className="text-[10px] font-bold uppercase tracking-widest data-[state=active]:bg-white">Directory</TabsTrigger>
                      <TabsTrigger value="ous" className="text-[10px] font-bold uppercase tracking-widest data-[state=active]:bg-white">Org Units</TabsTrigger>
                      <TabsTrigger value="settings" className="text-[10px] font-bold uppercase tracking-widest data-[state=active]:bg-white">Settings</TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-3">
                      <Input placeholder="Filter by email or name..." className="h-9 text-xs w-64 bg-white border-slate-200" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <TabsContent value="users" className="m-0">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-b border-slate-100">
                          <TableHead className="text-[10px] font-bold uppercase py-4 pl-8 tracking-widest">Full Name</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 tracking-widest">Primary Email</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 tracking-widest">Storage Used</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 tracking-widest">Status</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8 tracking-widest">Manage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wsUsers.length === 0 ? (
                           <TableRow>
                             <TableCell colSpan={5} className="py-24 text-center">
                               <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-100" />
                               <p className="text-[10px] font-bold text-slate-400 uppercase mt-4">Syncing directory nodes...</p>
                             </TableCell>
                           </TableRow>
                        ) : wsUsers.map((u) => (
                          <TableRow key={u.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0 group">
                            <TableCell className="pl-8 py-5">
                              <span className="font-bold text-slate-800 text-sm">{u.name}</span>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-500 font-medium">{u.email}</TableCell>
                            <TableCell className="text-xs font-bold text-slate-600">{u.storage}</TableCell>
                            <TableCell>
                              <Badge className={cn(
                                "text-[9px] font-bold px-2.5 py-0.5 border shadow-none uppercase",
                                u.archived ? "bg-slate-50 text-slate-400 border-slate-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                              )}>
                                {u.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right pr-8">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary">
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={() => {
                                    setEditingUser(u)
                                    setIsPassModalOpen(true)
                                  }} className="gap-2 py-2.5">
                                    <Key className="w-3.5 h-3.5" />
                                    <span>Reset Password</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleArchiveUser(u)} className="gap-2 py-2.5">
                                    <Archive className="w-3.5 h-3.5" />
                                    <span>{u.archived ? 'Restore Access' : 'Archive Account'}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="gap-2 py-2.5 text-destructive font-bold">
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete Permanently</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                  
                  <TabsContent value="ous" className="m-0 p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-6">
                         <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Organizational Structure</h3>
                            <Button size="sm" variant="ghost" className="h-8 font-bold text-primary" onClick={() => setIsOUModalOpen(true)}>
                              <FolderPlus className="w-4 h-4 mr-2" />
                              Add OU
                            </Button>
                         </div>
                         <div className="space-y-2">
                           {orgUnits.map(ou => (
                             <div key={ou.path} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl group hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-4">
                                   <div className="p-2 bg-white rounded-lg shadow-sm">
                                      <GraduationCap className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
                                   </div>
                                   <div className="flex flex-col">
                                      <span className="text-sm font-bold text-slate-900">{ou.name}</span>
                                      <span className="text-[10px] text-slate-400 font-mono">{ou.path}</span>
                                   </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                                   <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                             </div>
                           ))}
                         </div>
                       </div>
                       <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 flex flex-col items-center justify-center text-center space-y-4">
                          <Cloud className="w-12 h-12 text-slate-200" />
                          <div className="space-y-2">
                             <h4 className="text-sm font-bold text-slate-900">Policy Management</h4>
                             <p className="text-xs text-slate-500 max-w-[200px] font-medium leading-relaxed">
                               Organizational units allow you to apply specific service settings to different groups of users.
                             </p>
                          </div>
                          <Button variant="outline" className="text-xs font-bold border-slate-200">Learn about OU Policies</Button>
                       </div>
                    </div>
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </div>
        )}

        {/* User Provisioning Modal */}
        <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <DialogTitle className="font-headline font-bold text-xl">Provision New User</DialogTitle>
              <p className="text-slate-400 text-xs mt-1">Authorized access for students and faculty.</p>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">First Name</Label>
                  <Input placeholder="Rajesh" value={userFormData.firstName} onChange={e => setUserFormData({...userFormData, firstName: e.target.value})} className="h-10 text-xs font-bold border-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Last Name</Label>
                  <Input placeholder="Karki" value={userFormData.lastName} onChange={e => setUserFormData({...userFormData, lastName: e.target.value})} className="h-10 text-xs font-bold border-slate-200" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Institutional Email</Label>
                <div className="relative">
                  <Input placeholder="rajesh.k" value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} className="h-10 text-xs font-bold border-slate-200 pr-24" />
                  <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400">@{selectedOrg?.workspaceDomain || selectedOrg?.domain}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Temporary Password</Label>
                <Input type="password" value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} className="h-10 text-xs font-bold border-slate-200" />
              </div>
              <p className="text-[10px] text-slate-400 font-bold leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                User will be required to change their password upon first login to {selectedOrg?.domain}.
              </p>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
              <Button onClick={handleCreateUser} disabled={isSyncing} className="px-8 bg-slate-900 hover:bg-black text-white font-bold h-11 w-full shadow-lg">
                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Provision Account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* OU Creation Modal */}
        <Dialog open={isOUModalOpen} onOpenChange={setIsOUModalOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <DialogTitle className="font-headline font-bold text-xl">Create Organizational Unit</DialogTitle>
              <p className="text-slate-400 text-xs mt-1">Categorize accounts for policy management.</p>
            </DialogHeader>
            <div className="p-6 space-y-4">
               <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">Unit Name</Label>
                 <Input placeholder="e.g. Batch of 2024" value={ouFormData.name} onChange={e => setOUFormData({...ouFormData, name: e.target.value})} className="h-10 text-xs font-bold border-slate-200" />
               </div>
               <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">Parent Path</Label>
                 <Input placeholder="/" value={ouFormData.parent} onChange={e => setOUFormData({...ouFormData, parent: e.target.value})} className="h-10 text-xs font-bold border-slate-200" />
               </div>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
               <Button onClick={async () => {
                 setIsSyncing(true)
                 const res = await createOrgUnit(selectedOrg?.workspaceCustomerId, ouFormData.name, ouFormData.parent)
                 if (res.success) {
                   toast({ title: "OU Created" })
                   setIsOUModalOpen(false)
                   fetchWorkspaceData()
                 }
                 setIsSyncing(false)
               }} disabled={isSyncing} className="w-full bg-slate-900 text-white font-bold h-11">
                  {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Unit"}
               </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Password Reset Modal */}
        <Dialog open={isPassModalOpen} onOpenChange={setIsPassModalOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none bg-white">
             <DialogHeader className="bg-slate-900 text-white p-6">
                <DialogTitle className="font-headline font-bold">Secure Password Reset</DialogTitle>
                <p className="text-slate-400 text-xs">Reset credentials for {editingUser?.email}</p>
             </DialogHeader>
             <div className="p-6 space-y-4">
               <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">New Temporary Password</Label>
                 <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="h-10 text-xs font-bold border-slate-200" />
               </div>
               <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                  <Info className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                    Account security is critical. User will be forced to rotate this password upon their next sign-in event.
                  </p>
               </div>
             </div>
             <DialogFooter className="bg-slate-50 p-6">
                <Button onClick={handleUpdatePassword} disabled={isSyncing} className="w-full bg-slate-900 text-white font-bold h-11">
                   {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Commit Security Change"}
                </Button>
             </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
