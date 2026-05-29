
"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  ShieldCheck, 
  Settings, 
  MoreVertical,
  Key,
  Archive,
  Trash2,
  Loader2,
  Network,
  Cloud,
  ChevronRight,
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
  CheckCircle,
  Plus,
  Calendar,
  X,
  Lock,
  ArrowRightLeft,
  Mail
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
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore"
import { cn } from "@/lib/utils"

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
}

const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user",
  "https://www.googleapis.com/auth/admin.directory.orgunit",
  "https://www.googleapis.com/auth/admin.reports.usage.readonly"
].join(", ")

const ALERT_LOGS = [
  { id: 1, type: "CRITICAL", msg: "Multiple failed login attempts detected on administrative account", time: "2m ago" },
  { id: 2, type: "WARNING", msg: "Students OU collective storage has reached 88% capacity", time: "1h ago" },
  { id: 3, type: "INFO", msg: "Directory sync with local infrastructure executed successfully", time: "4h ago" },
]

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
  const [isOUDialogOpen, setIsOUDialogOpen] = useState(false)
  const [newOUType, setNewOUType] = useState("")
  
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

  const handleAddUserType = async () => {
    if (!selectedOrg || !newOUType) return
    if ((selectedOrg.customUserTypes?.length || 0) >= 5) {
      toast({ variant: "destructive", title: "Limit Reached", description: "You can define a maximum of 5 custom user types." })
      return
    }
    
    setIsUpdating(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    updateDoc(orgRef, {
      customUserTypes: arrayUnion(newOUType)
    }).then(() => {
      toast({ title: "User Type Added", description: `"${newOUType}" has been registered as a new OU.` })
      setNewOUType("")
      setIsOUDialogOpen(false)
    }).finally(() => setIsUpdating(false))
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: "Copied", description: `${label} copied to clipboard.` })
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

        {/* 1. Declaration View */}
        {selectedOrg && selectedOrg.workspaceActive === undefined && (
          <Card className="bg-slate-50 border-slate-200 border-dashed animate-in slide-in-from-bottom-2 duration-500">
            <CardContent className="p-16 flex flex-col items-center text-center gap-10">
              <div className="w-16 h-16 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                <Mail className="w-8 h-8 text-slate-400" />
              </div>
              
              <div className="space-y-8">
                <div className="space-y-3">
                  <h3 className="text-3xl font-headline font-bold text-slate-900 uppercase tracking-tight">Workspace Infrastructure Configuration</h3>
                  <div className="space-y-1">
                    <p className="text-primary font-bold text-sm uppercase tracking-widest">Simplified Administration for Modern Institutions</p>
                    <p className="text-slate-500 max-w-xl mx-auto text-sm leading-relaxed font-medium">
                      Select your institution's current workspace status for <span className="font-bold text-slate-900">{selectedOrg?.domain}</span> to activate the managed administrative interface and automated security protocols.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
                  {[
                    { title: "Simple Management", desc: "Take care of only what matters. We remove Google's administrative complexity.", icon: Zap },
                    { title: "Matter-Only Focus", desc: "A streamlined surface designed for rapid institutional oversight.", icon: ShieldCheck },
                    { title: "Zero Configuration", desc: "Automated policy enforcement and institutional security defaults.", icon: Lock }
                  ].map((feat) => (
                    <div key={feat.title} className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3 group hover:border-primary/20 transition-all">
                      <div className="p-2 bg-slate-50 rounded-lg w-fit group-hover:bg-primary/5 transition-colors">
                        <feat.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-900">{feat.title}</h4>
                        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">{feat.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
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

        {/* 2. Apply View (Declaration: False) */}
        {selectedOrg && selectedOrg.workspaceActive === false && !selectedOrg.managedWorkspace && (
          <div className="max-w-5xl mx-auto py-8 space-y-12 animate-in slide-in-from-bottom-4">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-headline font-bold text-slate-900">Enterprise Cloud Deployment</h2>
              <p className="text-slate-500 text-lg max-w-2xl mx-auto">Access professional collaboration tools for your entire organization at zero license cost for eligible institutions.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { title: "Managed Onboarding", desc: "Our team handles the verification and DNS setup for your new domain.", icon: Zap, color: "text-blue-500 bg-blue-50" },
                { title: "EDU Exclusive", desc: "Unlock 100TB of collective storage and advanced teaching tools.", icon: GraduationCap, color: "text-emerald-500 bg-emerald-50" },
                { title: "Security First", desc: "DLP rules and advanced threat protection enabled by default.", icon: Lock, color: "text-purple-500 bg-purple-50" },
              ].map((feat) => (
                <Card key={feat.title} className="bg-white border-slate-200 shadow-sm p-8 space-y-4">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", feat.color)}>
                    <feat.icon className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-slate-900">{feat.title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{feat.desc}</p>
                </Card>
              ))}
            </div>

            <div className="flex justify-center">
              <Button size="lg" className="h-14 px-12 text-lg font-bold shadow-xl shadow-primary/20 gap-3">
                <Globe className="w-5 h-5" />
                Apply for Institutional Workspace
              </Button>
            </div>
          </div>
        )}

        {/* 3. Connection Guidelines (Declaration: True, Managed: False) */}
        {selectedOrg && selectedOrg.workspaceActive === true && !selectedOrg.managedWorkspace && (
          <div className="max-w-4xl mx-auto py-8">
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <Badge className="bg-blue-50 text-blue-600 border-blue-100 mb-2">MIGRATION PROTOCOL</Badge>
                <h2 className="text-2xl font-headline font-bold text-slate-900">Authorize Domain-Wide Delegation</h2>
                <p className="text-slate-500 text-sm">Follow Approach A to securely link your Google Admin environment to our platform.</p>
              </div>

              <div className="grid gap-6">
                {[
                  {
                    step: 1,
                    title: "System Client ID",
                    content: "982734982734-edu-revlet.apps.googleusercontent.com",
                    action: () => copyToClipboard("982734982734-edu-revlet.apps.googleusercontent.com", "Client ID")
                  },
                  {
                    step: 2,
                    title: "Authorized API Scopes",
                    content: SCOPES,
                    action: () => copyToClipboard(SCOPES, "API Scopes")
                  }
                ].map((item) => (
                  <Card key={item.step} className="bg-white border-slate-200 shadow-sm">
                    <CardHeader className="py-4 px-6 border-b border-slate-100 flex flex-row items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                          {item.step}
                        </div>
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-600">{item.title}</CardTitle>
                      </div>
                      <Button variant="ghost" size="sm" onClick={item.action} className="h-8 text-primary font-bold text-[10px] uppercase gap-1.5">
                        <Copy className="w-3 h-3" />
                        Copy String
                      </Button>
                    </CardHeader>
                    <CardContent className="p-6 bg-slate-50/50">
                      <code className="text-xs font-mono text-slate-500 break-all leading-relaxed">
                        {item.content}
                      </code>
                    </CardContent>
                  </Card>
                ))}

                <Card className="bg-white border-slate-200 shadow-sm p-6">
                   <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                         <Settings className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="space-y-4">
                         <div className="space-y-1">
                            <h4 className="text-sm font-bold text-slate-900">Step 3 & 4: Finalize in Google Admin</h4>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Navigate to <span className="font-bold text-slate-900">Security {'&gt;'} API Controls {'&gt;'} Manage Domain Wide Delegation</span> in your Google Admin console. 
                              Add a new API Client, paste the values copied above, and click <span className="font-bold text-slate-900">Authorize</span>.
                            </p>
                         </div>
                         <Button onClick={handleVerify} disabled={isUpdating} className="bg-slate-900 text-white font-bold h-11 px-8 shadow-xl">
                           {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Verify and Activate Connection"}
                         </Button>
                      </div>
                   </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* 4. Active Management Dashboard */}
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
                <CardHeader className="py-4 px-6 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <HardDrive className="w-4 h-4 text-slate-400" />
                       <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Storage Pool</CardTitle>
                    </div>
                    <span className="text-[11px] font-bold text-slate-900">4.8 TB / 10.0 TB</span>
                  </div>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="space-y-4">
                    <Progress value={48} className="h-2.5 bg-slate-100" />
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                       <span>48% Utilised</span>
                       <span>5.2 TB Available</span>
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
                      {ALERT_LOGS.map((log) => (
                        <div key={log.id} className="p-5 flex items-start justify-between hover:bg-slate-50/50 transition-colors">
                          <div className="flex gap-4">
                            <Badge className={cn(
                              "text-[9px] font-bold h-5 px-1.5 border shadow-none",
                              log.type === "CRITICAL" ? "bg-red-50 text-red-600 border-red-100" :
                              log.type === "WARNING" ? "bg-amber-50 text-amber-600 border-amber-100" :
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
                    <Button className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold h-12 group">
                      Launch Console
                      <ArrowUpRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
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
                          <div className="relative flex-1 md:w-64">
                             <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                             <Input placeholder="Search directory..." className="h-9 pl-8 text-xs font-medium bg-white border-slate-200" />
                          </div>
                          <Button size="sm" className="h-9 font-bold px-4 gap-2 bg-slate-900 text-white">
                             <UserPlus className="w-3.5 h-3.5" />
                             Create User
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {allOUs.map((ou) => (
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
                               {[1, 2, 3].map((i) => (
                                 <TableRow key={i} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                                   <TableCell className="pl-8 py-5">
                                      <div className="flex items-center gap-3">
                                         <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                            {ou.substring(0, 1)}
                                         </div>
                                         <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-800">Sample User {i}</span>
                                            <Badge variant="outline" className="text-[8px] font-bold h-4 w-fit px-1 bg-emerald-50 text-emerald-600 border-emerald-100">ACTIVE</Badge>
                                         </div>
                                      </div>
                                   </TableCell>
                                   <TableCell className="font-mono text-xs text-slate-500 font-medium">user.{i}@{selectedOrg?.domain}</TableCell>
                                   <TableCell className="text-xs font-bold text-slate-600">0.5 GB</TableCell>
                                   <TableCell className="text-right pr-8">
                                      <div className="flex items-center justify-end gap-1">
                                         <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary"><Settings className="w-3.5 h-3.5" /></Button>
                                         <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary"><Key className="w-3.5 h-3.5" /></Button>
                                         <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500"><Archive className="w-3.5 h-3.5" /></Button>
                                      </div>
                                   </TableCell>
                                 </TableRow>
                               ))}
                             </TableBody>
                           </Table>
                        </TabsContent>
                      ))}
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
                             <Input type="date" className="pl-10 h-10 border-slate-200 text-xs" />
                          </div>
                          <span className="text-slate-300 text-xs font-bold">to</span>
                          <div className="relative flex-1">
                             <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                             <Input type="date" className="pl-10 h-10 border-slate-200 text-xs" />
                          </div>
                       </div>
                    </div>
                  </div>
               </Card>

               <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                 <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6 flex flex-row items-center justify-between">
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archived Retention Ledger</CardTitle>
                    <Badge variant="outline" className="text-[10px] font-bold text-slate-400">Archived Records</Badge>
                 </CardHeader>
                 <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50/30">
                         <TableRow className="border-b border-slate-100">
                           <TableHead className="text-[10px] font-bold uppercase py-4 pl-8">Former Identity</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4">Original Type</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4">Deactivation Date</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4">Storage Saved</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8">Actions</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="hover:bg-slate-50/50 transition-colors border-b border-slate-50">
                          <TableCell className="pl-8 py-5">
                             <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-400 line-through">Alice Johnson</span>
                                <span className="text-[10px] font-mono text-slate-400">a.johnson@{selectedOrg?.domain}</span>
                             </div>
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-600">{allOUs[0]}</TableCell>
                          <TableCell className="text-[10px] font-bold text-slate-400 uppercase">Suspended Dec 2025</TableCell>
                          <TableCell className="text-xs font-bold text-emerald-600">4.2 GB</TableCell>
                          <TableCell className="text-right pr-8">
                             <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold uppercase tracking-widest border-slate-200">Restore</Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
                             </div>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                 </CardContent>
               </Card>
            </TabsContent>
          </Tabs>
        )}

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
              <p className="text-[10px] text-slate-400 leading-relaxed">
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
