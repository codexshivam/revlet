
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  CircleAlert, 
  Clock, 
  CircleCheck, 
  Rocket,
  CirclePlus,
  Loader2,
  Globe,
  Ban,
  ShieldCheck,
  Zap,
  Server,
  MessageSquare,
  Sparkles,
  Cloud,
  Shield
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useState, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import Link from "next/link"

interface Organization {
  id: string
  name: string
  domain: string
  hasWebsite?: boolean
  siteActiveOn?: boolean
}

interface SiteModification {
  id: string
  title: string
  description: string
  status: "Pending" | "Completed" | "Rejected"
  requestedAt: Timestamp
  organizationId: string
  ownerId: string
}

export default function WebsiteManagementPage() {
  const { toast } = useToast()
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [modifications, setModifications] = useState<SiteModification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  
  // Modification Form State
  const [modTitle, setModTitle] = useState("")
  const [modDesc, setModDesc] = useState("")
  const [isModDialogOpen, setIsModDialogOpen] = useState(false)

  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

  // Fetch Organizations
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
    }, (error) => {
      const permissionError = new FirestorePermissionError({
        path: 'organizations',
        operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
    })
    return unsub
  }, [user, authLoading, db, selectedOrgId])

  // Fetch Modifications for selected org
  useEffect(() => {
    if (!selectedOrgId || !user) return

    const q = query(
      collection(db, "siteModifications"), 
      where("organizationId", "==", selectedOrgId),
      where("ownerId", "==", user.uid)
    )

    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SiteModification[]
      // Sort by requestedAt descending
      setModifications(fetched.sort((a, b) => b.requestedAt?.toMillis() - a.requestedAt?.toMillis()))
    })

    return unsub
  }, [selectedOrgId, user, db])

  const handleDeclareWebsite = (hasWebsite: boolean) => {
    if (!selectedOrgId) return
    setIsUpdating(true)
    
    const orgRef = doc(db, "organizations", selectedOrgId)
    updateDoc(orgRef, {
      hasWebsite: hasWebsite
    }).then(() => {
      toast({
        title: "Status Updated",
        description: `Website status for ${selectedOrg?.name} has been recorded.`,
      })
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: orgRef.path,
        operation: 'update',
        requestResourceData: { hasWebsite }
      })
      errorEmitter.emit('permission-error', permissionError)
    }).finally(() => {
      setIsUpdating(false)
    })
  }

  const handleRequestUpgrade = () => {
    if (!selectedOrgId) return
    setIsUpdating(true)
    
    const orgRef = doc(db, "organizations", selectedOrgId)
    updateDoc(orgRef, {
      siteActiveOn: false // Setting to false triggers "Pending" state
    }).then(() => {
      toast({
        title: "Upgrade Requested",
        description: "Your infrastructure upgrade request has been logged successfully.",
      })
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: orgRef.path,
        operation: 'update',
        requestResourceData: { siteActiveOn: false }
      })
      errorEmitter.emit('permission-error', permissionError)
    }).finally(() => {
      setIsUpdating(false)
    })
  }

  const handleRequestModification = async () => {
    if (!selectedOrgId || !user || !modTitle || !modDesc) return
    setIsUpdating(true)

    const payload = {
      organizationId: selectedOrgId,
      ownerId: user.uid,
      title: modTitle,
      description: modDesc,
      status: "Pending",
      requestedAt: serverTimestamp()
    }

    addDoc(collection(db, "siteModifications"), payload)
      .then(() => {
        toast({
          title: "Modification Request Logged",
          description: "Our engineering queue will implement your changes within 24 hours.",
        })
        setIsModDialogOpen(false)
        setModTitle("")
        setModDesc("")
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: 'siteModifications',
          operation: 'create',
          requestResourceData: payload
        })
        errorEmitter.emit('permission-error', permissionError)
      })
      .finally(() => {
        setIsUpdating(false)
      })
  }

  // Quota Calculation (Simplified: Count modifications in current month)
  const currentMonthMods = useMemo(() => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    return modifications.filter(m => {
      const date = m.requestedAt?.toDate()
      return date && date >= firstDay
    }).length
  }, [modifications])

  const quotaTotal = 5

  if (isLoading || authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Context...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Network</span>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Website Management</h1>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <div className="flex items-center gap-1.5">
                <Cloud className="w-3 h-3" />
                Powered by Cloudflare
              </div>
              <div className="w-px h-3 bg-slate-200" />
              <div className="flex items-center gap-1.5 text-primary">
                <Sparkles className="w-3 h-3" />
                Manage website content from our dashboard
              </div>
            </div>
          </div>
        </div>
        
        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        {/* 1. ACTIVE CONTROL PANEL: siteActiveOn === true */}
        {selectedOrg?.siteActiveOn === true && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between px-6 py-4">
                  <div className="space-y-1">
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Change Ledger</CardTitle>
                    <p className="text-[10px] text-slate-500 font-medium">Tracking all technical and content modifications.</p>
                  </div>
                  <Dialog open={isModDialogOpen} onOpenChange={setIsModDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="font-bold h-8 bg-slate-900 hover:bg-black text-white">
                        <CirclePlus className="w-3.5 h-3.5 mr-1.5" />
                        Request Modification
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle className="font-headline font-bold">Infrastructure Modification Request</DialogTitle>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-primary font-bold uppercase">
                          <MessageSquare className="w-3 h-3" />
                          Processed by Engineering within 24 hours
                        </div>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="req-title" className="text-xs font-bold uppercase text-slate-500">Subject / Area of Change</Label>
                          <Input 
                            id="req-title" 
                            placeholder="e.g. Update staff directory or MX record change" 
                            value={modTitle}
                            onChange={(e) => setModTitle(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="req-desc" className="text-xs font-bold uppercase text-slate-500">Modification Details</Label>
                          <Textarea 
                            id="req-desc" 
                            placeholder="Describe the specific modifications required..." 
                            className="min-h-[120px]" 
                            value={modDesc}
                            onChange={(e) => setModDesc(e.target.value)}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
                          Requests are implemented manually by our engineering team to ensure zero-downtime and security compliance.
                        </p>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleRequestModification} disabled={isUpdating} className="font-bold px-8 w-full sm:w-auto">
                          {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Submit Modification Request"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/30 border-b border-slate-100">
                        <TableHead className="text-[10px] font-bold uppercase py-4 pl-6">Modification Detail</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4">Timestamp</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-6">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modifications.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-12 text-center text-slate-400 text-xs italic font-medium">
                            No modifications logged in the global ledger.
                          </TableCell>
                        </TableRow>
                      ) : (
                        modifications.map((mod) => (
                          <TableRow key={mod.id} className="hover:bg-slate-50/30 border-b border-b-slate-50 last:border-0">
                            <TableCell className="font-bold text-slate-800 text-sm pl-6">{mod.title}</TableCell>
                            <TableCell className="text-slate-400 text-xs font-medium">
                              {mod.requestedAt?.toDate?.().toLocaleString() || 'Pending Sync...'}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <Badge className={cn(
                                "text-[9px] font-bold px-2 py-0.5 border shadow-none",
                                mod.status === "Completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                mod.status === "Rejected" ? "bg-red-50 text-red-600 border-red-100" :
                                "bg-amber-50 text-amber-600 border-amber-100"
                              )}>
                                {mod.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resource Quota</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Monthly Modifications</p>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-3xl font-headline font-bold text-primary">{currentMonthMods} / {quotaTotal}</span>
                      <span className="text-[10px] font-bold text-slate-400 pb-1">Units Consumed</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-700" 
                        style={{ width: `${(currentMonthMods / quotaTotal) * 100}%` }} 
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100 shadow-sm">
                    <CircleCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Live & Published</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 text-white shadow-xl shadow-slate-200">
                <CardContent className="p-6 space-y-4">
                  <ShieldCheck className="w-8 h-8 text-primary" />
                  <h4 className="font-headline font-bold text-lg leading-tight">Infrastructure Active</h4>
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">
                    Your site is optimized for global edge delivery. All modifications are implementation-guaranteed within 24 hours.
                  </p>
                  <Link href="/support" className="block w-full">
                    <Button variant="outline" className="w-full border-slate-700 text-white hover:bg-slate-800 text-xs font-bold h-10">
                      Technical Consultation
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* 2. PENDING STATUS: siteActiveOn === false */}
        {selectedOrg?.siteActiveOn === false && (
          <div className="max-w-4xl mx-auto py-20">
            <Card className="bg-amber-50 border-amber-200 shadow-sm border-dashed">
              <CardContent className="p-20 flex flex-col items-center text-center gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-white border border-amber-100 flex items-center justify-center shadow-sm relative">
                    <Clock className="w-10 h-10 text-amber-500" />
                    <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white font-bold border-2 border-white uppercase text-[9px]">
                      PENDING
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-headline font-bold text-amber-900">Provisioning Managed Infrastructure</h3>
                  <p className="text-amber-700/80 max-w-lg mx-auto text-sm leading-relaxed font-medium">
                    Our engineering team is building your secure institution portal for <span className="font-bold">{selectedOrg.domain}</span>. This process typically initializes within 24 hours.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Link href="/support">
                    <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 font-bold gap-2 h-11 px-8">
                      <MessageSquare className="w-4 h-4" />
                      Contact Support
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 3. INITIAL DECLARATION: No status or declaration found */}
        {selectedOrg?.siteActiveOn === undefined && selectedOrg?.hasWebsite === undefined && (
          <Card className="bg-slate-50 border-slate-200 border-dashed">
            <CardContent className="p-16 flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                <CircleAlert className="w-8 h-8 text-slate-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-bold text-slate-900">Infrastructure Declaration Required</h3>
                <p className="text-slate-500 max-w-sm mx-auto text-sm leading-relaxed font-medium">
                  Please declare the current website status for <span className="font-bold text-slate-900">{selectedOrg?.domain}</span> to initialize service contexts.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                <Button 
                  onClick={() => handleDeclareWebsite(true)}
                  disabled={isUpdating}
                  className="flex-1 h-14 bg-white hover:bg-slate-50 text-slate-900 border-slate-200 border shadow-sm font-bold gap-3"
                >
                  <Globe className="w-5 h-5 text-primary" />
                  We have a website
                </Button>
                <Button 
                  onClick={() => handleDeclareWebsite(false)}
                  disabled={isUpdating}
                  className="flex-1 h-14 bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-200 font-bold gap-3"
                >
                  <Ban className="w-5 h-5 text-slate-400" />
                  No website yet
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. UPGRADE PATH: hasWebsite declared but not on managed infra yet */}
        {selectedOrg?.siteActiveOn === undefined && selectedOrg?.hasWebsite !== undefined && (
          <div className="space-y-12">
            <div className="max-w-5xl mx-auto space-y-12 text-center animate-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-4">
                <h2 className="text-4xl font-headline font-bold text-slate-900 leading-tight">
                  {selectedOrg.hasWebsite ? "Upgrade Your Institutional Presence" : "Get Your Professional Website"}
                </h2>
                <div className="max-w-3xl mx-auto space-y-4">
                  <p className="text-slate-500 text-xs leading-relaxed font-medium">
                    Launch a high-performance, secure presence for your institution on our optimized enterprise infrastructure. This is not an AI-built website or a generic template. Our engineering team provides consistent, long-term support so you never feel lost.
                  </p>
                  <p className="text-slate-400 text-[10px] leading-relaxed font-medium italic">
                    We train AI using your website data after building it once, so that modification get easier for us to do, ensuring rapid turnaround for your requests.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
                {[
                  { title: "Custom Development", desc: "No templates or AI generation. We build professional, hand-coded portals tailored for institutions.", icon: Zap, color: "bg-amber-50 text-amber-600 border-amber-100" },
                  { title: "Peace of Mind", desc: "Always have full control. Modify your content or request technical changes anytime via our central dashboard.", icon: ShieldCheck, color: "bg-blue-50 text-blue-600 border-blue-100" },
                  { title: "24/7 Updates", desc: "Our platform ensures your digital presence is never stagnant. Request modifications and see them live within hours.", icon: MessageSquare, color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
                  { title: "Enterprise Speed", desc: "Ultra-fast global performance with Cloudflare edge caching for superior student and faculty access.", icon: Server, color: "bg-purple-50 text-purple-600 border-purple-100" }
                ].map((feature) => (
                  <div key={feature.title} className={cn("p-6 rounded-2xl border flex items-start gap-5 transition-all shadow-sm hover:shadow-md", feature.color)}>
                    <div className="p-3 bg-white rounded-xl shadow-sm shrink-0">
                      <feature.icon className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-base font-bold">{feature.title}</h4>
                      <p className="text-xs opacity-80 leading-relaxed font-medium">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-8 flex flex-col items-center gap-4">
                <Button 
                  onClick={handleRequestUpgrade} 
                  size="lg" 
                  disabled={isUpdating}
                  className="font-bold px-12 h-14 shadow-xl shadow-primary/20 text-lg group"
                >
                  {isUpdating ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <Rocket className="w-5 h-5 mr-3 group-hover:translate-y-[-2px] transition-transform" />}
                  Request Managed Website
                </Button>
                <div className="flex items-center gap-2 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Shield className="w-3 h-3" />
                  Full Administrative Control Guaranteed
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
