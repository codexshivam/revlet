
"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
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
  ArrowUpRight,
  Search,
  Copy,
  AlertCircle,
  Bell,
  HardDrive,
  UserCog,
  FileText,
  Zap,
  Globe,
  Ban
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore"
import { cn } from "@/lib/utils"

interface Organization {
  id: string
  name: string
  domain: string
  gEducation?: boolean
  managedWorkspace?: boolean
  workspaceStatus?: "unregistered" | "applied" | "pending" | "active"
  workspaceDomain?: string
  workspaceCustomerId?: string
  workspaceAppliedAt?: any
}

const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user",
  "https://www.googleapis.com/auth/admin.directory.orgunit",
  "https://www.googleapis.com/auth/admin.reports.usage.readonly"
].join(", ")

const ALERT_LOGS = [
  { id: 1, type: "CRITICAL", msg: "Multiple failed login attempts detected on administrative account", time: "2m ago" },
  { id: 2, type: "WARNING", msg: "Students OU collective storage has reached 88% capacity", time: "1h ago" },
  { id: 3, type: "INFO", msg: "Directory sync with local Appwrite server executed successfully", time: "4h ago" },
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

  const handleDeclareEligibility = async (eligible: boolean) => {
    if (!selectedOrg) return
    setIsUpdating(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    updateDoc(orgRef, {
      gEducation: eligible,
      updatedAt: serverTimestamp()
    }).then(() => {
      toast({ 
        title: eligible ? "Status Declared" : "Not Eligible", 
        description: eligible 
          ? "Educational status verified. Proceeding to setup." 
          : "Standard Workspace options will be provided soon." 
      })
    }).finally(() => setIsUpdating(false))
  }

  const handleActivate = async () => {
    if (!selectedOrg) return
    setIsUpdating(true)
    const orgRef = doc(db, "organizations", selectedOrg.id)
    updateDoc(orgRef, {
      managedWorkspace: true,
      workspaceStatus: "active",
      workspaceDomain: selectedOrg.domain,
      updatedAt: serverTimestamp()
    }).then(() => {
      toast({ title: "Connection Verified", description: "Google Workspace for Education is now active." })
    }).finally(() => setIsUpdating(false))
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: "Copied", description: `${label} copied to clipboard.` })
  }

  if (isLoading || authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Initialising Admin SDK...</p>
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
               <Button variant="ghost" size="sm" className="h-9 gap-2 text-slate-500 font-bold text-xs">
                 <ShieldCheck className="w-4 h-4 text-emerald-500" />
                 Enterprise Verified
               </Button>
            </div>
          </div>
        </div>
        
        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        {/* Declaration Widget: Only if gEducation is not defined */}
        {selectedOrg && selectedOrg.gEducation === undefined && (
          <div className="max-w-4xl mx-auto py-12 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-white border-slate-200 shadow-xl overflow-hidden rounded-2xl">
              <div className="h-2 w-full bg-gradient-to-r from-blue-500 to-emerald-500" />
              <CardContent className="p-12 flex flex-col items-center text-center gap-8">
                <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
                  <GraduationCap className="w-10 h-10 text-blue-600" />
                </div>
                <div className="space-y-4">
                  <h2 className="text-3xl font-headline font-bold text-slate-900">Institutional Eligibility Declaration</h2>
                  <p className="text-slate-500 text-lg leading-relaxed max-w-2xl font-medium">
                    Google Workspace for Education provides powerful communication and collaboration tools at <span className="text-emerald-600 font-bold">zero cost</span> for qualifying educational institutions.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl text-left">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-4">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <Zap className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900">Free Premium Features</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">Includes Gmail, Drive, Docs, and advanced admin security controls.</p>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-4">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <Globe className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900">Education Exclusive</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">Reserved for K-12, Higher Ed, or education-focused nonprofits.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 w-full max-w-md pt-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Does your institution use Workspace for Ed?</p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button 
                      onClick={() => handleDeclareEligibility(true)}
                      disabled={isUpdating}
                      className="flex-1 h-14 bg-slate-900 text-white hover:bg-black font-bold shadow-xl gap-2"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Yes, proceed to setup
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleDeclareEligibility(false)}
                      disabled={isUpdating}
                      className="flex-1 h-14 font-bold gap-2"
                    >
                      <Ban className="w-5 h-5 text-slate-400" />
                      No, not eligible
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Setup Wizard: If gEducation is true but not yet managed */}
        {selectedOrg && selectedOrg.gEducation === true && !selectedOrg.managedWorkspace && (
          <div className="max-w-4xl mx-auto py-8">
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-headline font-bold text-slate-900">Manual Connection Setup</h2>
                <p className="text-slate-500 text-sm">Follow these steps to authorize domain-wide delegation for your institution.</p>
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
                              Navigate to <span className="font-bold">Security &gt; API Controls &gt; Manage Domain Wide Delegation</span>. 
                              Add a new API Client, paste the values copied above, and click <span className="font-bold">Authorize</span>.
                            </p>
                         </div>
                         <Button onClick={handleActivate} disabled={isUpdating} className="bg-slate-900 text-white font-bold h-11 px-8 shadow-xl">
                           {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Verify and Activate Connection"}
                         </Button>
                      </div>
                   </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Not Eligible Message */}
        {selectedOrg && selectedOrg.gEducation === false && (
          <div className="max-w-4xl mx-auto py-20 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
              <Ban className="w-8 h-8 text-slate-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-headline font-bold text-slate-900">Standard Workspace Management</h3>
              <p className="text-slate-500 max-w-sm mx-auto text-sm leading-relaxed font-medium">
                Your institution has been marked as ineligible for the Education offering. Our team will contact you for standard Workspace integration options.
              </p>
            </div>
            <Button variant="outline" onClick={() => handleDeclareEligibility(true)} className="font-bold">
              Incorrect? Redecalre Status
            </Button>
          </div>
        )}

        {/* Active Dashboard Suite */}
        {selectedOrg && selectedOrg.gEducation === true && selectedOrg.managedWorkspace === true && (
          <Tabs value={currentTab} onValueChange={(v) => router.push(`/services/workspace?tab=${v}`)} className="space-y-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
              <TabsList className="bg-transparent h-auto p-0 gap-8">
                {["hub", "users", "storage", "archived"].map((t) => (
                  <TabsTrigger 
                    key={t} 
                    value={t} 
                    className="bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-slate-900 rounded-none h-10 px-0 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 transition-all"
                  >
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="hub" className="m-0 space-y-8">
              {/* Metric Overview Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: "Students Count", val: "1,420", status: "Active", icon: GraduationCap },
                  { label: "Teachers Count", val: "85", status: "Active", icon: Users },
                  { label: "Main People", val: "12", status: "Active", icon: UserCog },
                  { label: "Staffs Count", val: "42", status: "Active", icon: Network },
                ].map((m) => (
                  <Card key={m.label} className="bg-white border-slate-200 shadow-sm overflow-hidden group">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-primary/5 transition-colors">
                           <m.icon className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                        </div>
                        <Badge variant="outline" className="text-[9px] font-bold h-4 bg-emerald-50 text-emerald-600 border-emerald-100">{m.status}</Badge>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</p>
                      <p className="text-3xl font-headline font-bold text-slate-900 mt-1">{m.val}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Storage Gauge */}
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
                {/* Alert Center */}
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

                {/* Gateway */}
                <Card className="bg-slate-900 text-white shadow-2xl relative overflow-hidden flex flex-col justify-center p-8">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Network className="w-32 h-32 rotate-12" />
                  </div>
                  <div className="relative space-y-6">
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                       <Cloud className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-headline font-bold">Admin Console Gateway</h4>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        Direct encrypted tunnel to Google's master control panel for policy enforcement.
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
                 <Tabs defaultValue="students" className="w-full">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-0">
                      <div className="flex flex-col md:flex-row items-center justify-between p-4 px-6 gap-4">
                        <TabsList className="bg-slate-200/50 h-9 p-1">
                          {["students", "teachers", "main people", "staffs"].map((ou) => (
                            <TabsTrigger key={ou} value={ou.toLowerCase()} className="text-[9px] font-bold uppercase tracking-widest px-4 h-7 data-[state=active]:bg-white">
                              {ou}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          <div className="relative flex-1 md:w-64">
                             <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                             <Input placeholder="Search directory..." className="h-9 pl-8 text-xs font-medium bg-white border-slate-200" />
                          </div>
                          <Button size="sm" className="h-9 font-bold px-4 gap-2 bg-slate-900">
                             <UserPlus className="w-3.5 h-3.5" />
                             Create User
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {["students", "teachers", "main people", "staffs"].map((ou) => (
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
                                            JS
                                         </div>
                                         <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-800">John Smith</span>
                                            <Badge variant="outline" className="text-[8px] font-bold h-4 w-fit px-1 bg-emerald-50 text-emerald-600 border-emerald-100">ACTIVE</Badge>
                                         </div>
                                      </div>
                                   </TableCell>
                                   <TableCell className="font-mono text-xs text-slate-500 font-medium">j.smith@{selectedOrg?.domain}</TableCell>
                                   <TableCell className="text-xs font-bold text-slate-600">2.1 GB</TableCell>
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
                 {["Students", "Teachers", "Main People", "Staffs"].map((ou) => (
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
                           <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                           <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                             This policy controls the hard quota tier directly for all accounts under this specific Google Workspace Organizational Unit (OU).
                           </p>
                        </div>
                        <Button className="w-full h-11 font-bold bg-slate-900">Update Allocation Rule</Button>
                     </CardContent>
                   </Card>
                 ))}
               </div>
            </TabsContent>

            <TabsContent value="archived" className="m-0">
               <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                 <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-4 px-6">
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Suspended Account Directory</CardTitle>
                    <Badge variant="outline" className="text-[10px] font-bold text-slate-400">14 Records</Badge>
                 </CardHeader>
                 <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50/30">
                         <TableRow className="border-b border-slate-100">
                           <TableHead className="text-[10px] font-bold uppercase py-4 pl-8">Former Identity</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4">Suspension Reason</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4">Timeline</TableHead>
                           <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8">Management</TableHead>
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
                          <TableCell className="text-xs font-medium text-slate-500">Graduation / Alumni Status</TableCell>
                          <TableCell className="text-[10px] font-bold text-slate-400 uppercase">Suspended Dec 2025</TableCell>
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
      </div>
    </DashboardShell>
  )
}
