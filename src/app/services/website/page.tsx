"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { useActiveOrg } from "@/hooks/use-active-org"
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
  Shield,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  X,
  CreditCard
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { stripScripts } from "@/lib/security/sanitize"
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, Timestamp } from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import Link from "next/link"

interface Organization {
  id: string
  name: string
  domain: string
  hasWebsite?: boolean
  siteActiveOn?: boolean
  maxWebEdits?: number
  usedWebEdits?: number
  lastWebQuota?: Timestamp
  createdAt?: Timestamp
}

interface SiteModification {
  id: string
  title: string
  description: string
  status: "Not started" | "Pending" | "Completed" | "Rejected"
  requestedAt: Timestamp
  updatedAt?: Timestamp
  organizationId: string
  ownerId: string
}

export default function WebsiteManagementPage() {
  const { toast } = useToast()
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()
  
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: orgLoading } = useActiveOrg()
  const [modifications, setModifications] = useState<SiteModification[]>([])
  const isLoading = orgLoading
  const [isUpdating, setIsUpdating] = useState(false)
  const [expandedModId, setExpandedModId] = useState<string | null>(null)
  const [isUpgradeConfirmOpen, setIsUpgradeConfirmOpen] = useState(false)
  
  // Modification Form State
  const [modTitle, setModTitle] = useState("")
  const [modDesc, setModDesc] = useState("")
  const [isModDialogOpen, setIsModDialogOpen] = useState(false)

  // Quota Reset Logic (Client Side)
  useEffect(() => {
    if (!selectedOrg || !db) return;

    const now = new Date();
    const lastResetDate = selectedOrg.lastWebQuota?.toDate() || selectedOrg.createdAt?.toDate() || new Date();
    const diffTime = Math.abs(now.getTime() - lastResetDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 30) {
      const orgRef = doc(db, "organizations", selectedOrg.id);
      updateDoc(orgRef, {
        usedWebEdits: 0,
        lastWebQuota: serverTimestamp()
      }).catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: orgRef.path,
          operation: 'update',
          requestResourceData: { usedWebEdits: 0, lastWebQuota: "serverTimestamp()" }
        })
        errorEmitter.emit('permission-error', permissionError)
      });
    }
  }, [selectedOrg, db]);

  // Unified active organization syncing via global context hook

  useEffect(() => {
    if (!selectedOrgId || !user) return

    const q = query(
      collection(db, "siteModifications"), 
      where("organizationId", "==", selectedOrgId),
      where("ownerId", "==", user.uid)
    )

    const fetchModifications = async () => {
      try {
        const snap = await getDocs(q);
        const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SiteModification[];
        setModifications(fetched.sort((a, b) => {
          const timeA = a.requestedAt?.toMillis() || 0;
          const timeB = b.requestedAt?.toMillis() || 0;
          return timeB - timeA;
        }));
      } catch (error) {
        console.error("Error fetching site modifications", error);
      }
    };

    fetchModifications();
  }, [selectedOrgId, user, db])

  const handleDeclareWebsite = (hasWebsite: boolean) => {
    if (!selectedOrgId) return
    setIsUpdating(true)
    
    const orgRef = doc(db, "organizations", selectedOrgId)
    updateDoc(orgRef, {
      hasWebsite: hasWebsite,
      usedWebEdits: 0,
      maxWebEdits: 5,
      lastWebQuota: serverTimestamp()
    }).then(() => {
      toast({
        title: "Status Updated",
        description: `Website status for ${selectedOrg?.name} has been recorded.`,
      })
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: orgRef.path,
        operation: 'update',
        requestResourceData: { hasWebsite, lastWebQuota: "serverTimestamp()" }
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
      siteActiveOn: false
    }).then(() => {
      toast({
        title: "Upgrade Requested",
        description: "Your website upgrade request has been logged successfully.",
      })
      setIsUpgradeConfirmOpen(false)
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
    
    // Strict input sanitization to block script injection
    const cleanTitle = stripScripts(modTitle, { maxLength: 120 })
    const cleanDesc = stripScripts(modDesc, { maxLength: 2000 })

    if (!cleanTitle || !cleanDesc) {
      toast({
        variant: "destructive",
        title: "Disallowed Content",
        description: "Scripts, executable code, and HTML tags are strictly blocked in modification requests."
      });
      return;
    }

    if (usedEdits >= maxEdits) {
      toast({
        variant: "destructive",
        title: "Quota Exceeded",
        description: "You have reached your monthly modification limit. Please wait for the cycle reset."
      });
      return;
    }

    setIsUpdating(true)

    const payload = {
      organizationId: selectedOrgId,
      ownerId: user.uid,
      title: cleanTitle,
      description: cleanDesc,
      status: "Not started",
      requestedAt: serverTimestamp()
    }

    addDoc(collection(db, "siteModifications"), payload)
      .then(() => {
        const orgRef = doc(db, "organizations", selectedOrgId)
        updateDoc(orgRef, {
          usedWebEdits: (selectedOrg?.usedWebEdits || 0) + 1
        })

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

  const toggleRow = (id: string) => {
    setExpandedModId(expandedModId === id ? null : id)
  }

  const maxEdits = selectedOrg?.maxWebEdits || 5
  const usedEdits = selectedOrg?.usedWebEdits || 0
  const isQuotaExceeded = usedEdits >= maxEdits
  
  const resetAnchor = selectedOrg?.lastWebQuota?.toDate() || selectedOrg?.createdAt?.toDate() || new Date();
  const resetDateDisplay = new Date(resetAnchor.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Website Management</h1>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 self-start sm:self-auto">
              <div className="flex items-center gap-1.5">
                <Cloud className="w-3 h-3" />
                Powered by Cloudflare
              </div>
            </div>
          </div>
        </div>
        
        

        {selectedOrg?.siteActiveOn === true ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-white border-slate-200 shadow-sm md:col-span-2 rounded-xl">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resource Quota</CardTitle>
                    <div className="flex items-center gap-2">
                       <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold text-[9px] shadow-none uppercase">
                         <CircleCheck className="w-3 h-3 mr-1" />
                         Live & Published
                       </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                    <div className="flex-1 w-full space-y-2">
                      <div className="flex justify-between items-end">
                        <span className={cn("text-2xl font-headline font-bold", isQuotaExceeded ? "text-red-600" : "text-primary")}>
                          {usedEdits} / {maxEdits}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Monthly Modification Units</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-50">
                        <div 
                          className={cn("h-full transition-all duration-700", isQuotaExceeded ? "bg-red-500" : "bg-primary")}
                          style={{ width: `${Math.min((usedEdits / maxEdits) * 100, 100)}%` }} 
                        />
                      </div>
                    </div>
                    <div className="shrink-0 p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3 w-full md:w-auto">
                      <CalendarDays className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Quota Resets On</p>
                        <p className="text-xs font-bold text-slate-700">{resetDateDisplay}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/10 shadow-sm flex flex-col justify-center p-6 space-y-2 rounded-xl">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <h4 className="text-[10px] font-bold uppercase tracking-widest">Manage website content</h4>
                </div>
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  Modification requests are manually verified by engineering to ensure zero-downtime deployments.
                </p>
              </Card>
            </div>

            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
              <CardHeader className="bg-slate-50/50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 sm:px-6 py-4">
                <div className="space-y-1">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Change Ledger</CardTitle>
                  <p className="text-[10px] text-slate-500 font-medium">Comprehensive log of modifications requested for the organization&apos;s website</p>
                </div>
                <Dialog open={isModDialogOpen} onOpenChange={setIsModDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      size="sm" 
                      className="font-bold h-9 bg-slate-900 hover:bg-black text-white w-full sm:w-auto px-6 shadow-md shadow-slate-200 disabled:opacity-50"
                      disabled={isQuotaExceeded}
                    >
                      <CirclePlus className="w-3.5 h-3.5 mr-2" />
                      New Modification
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md border-none shadow-2xl bg-white p-0 overflow-hidden [&>button]:text-white [&>button]:opacity-100">
                    <DialogHeader className="bg-slate-900 text-white p-6 relative">
                      <DialogTitle className="font-headline font-bold text-xl">Request Website Modification</DialogTitle>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/60 font-bold uppercase tracking-widest">
                        <MessageSquare className="w-3 h-3" />
                        Processed within 24 business hours
                      </div>
                    </DialogHeader>
                    <div className="p-6 space-y-6">
                      <div className="grid gap-2">
                        <Label htmlFor="req-title" className="text-[10px] font-bold uppercase text-slate-500">Subject / Area of Change</Label>
                        <Input 
                          id="req-title" 
                          placeholder="e.g. Navigation update or page content change" 
                          value={modTitle}
                          className="h-10 text-xs font-bold border-slate-200"
                          onChange={(e) => setModTitle(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="req-desc" className="text-[10px] font-bold uppercase text-slate-500">Modification Details</Label>
                        <Textarea 
                          id="req-desc" 
                          placeholder="Describe specific changes..." 
                          className="min-h-[120px] text-xs font-medium border-slate-200 leading-relaxed" 
                          value={modDesc}
                          onChange={(e) => setModDesc(e.target.value)}
                        />
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold leading-relaxed uppercase tracking-tighter">
                        * All changes are hand-implemented for security and performance compliance.
                      </p>
                    </div>
                    <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
                      <Button 
                        onClick={handleRequestModification} 
                        disabled={isUpdating || !modTitle || !modDesc} 
                        className="font-bold px-8 w-full bg-slate-900 hover:bg-black text-white h-11"
                      >
                        {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Commit Modification Request"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0">
                {/* DESKTOP TABLE VIEW */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/30 border-b border-slate-100">
                        <TableHead className="text-[10px] font-bold uppercase py-4 pl-8 tracking-wider">Request Title</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 tracking-wider">Request Date</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 tracking-wider">Updated On</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8 tracking-wider">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modifications.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-24 text-center text-slate-400 text-xs italic font-medium">
                            <div className="flex flex-col items-center gap-2">
                               <Server className="w-8 h-8 text-slate-100" />
                               No active modification records in the global ledger.
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        modifications.map((mod) => (
                          <React.Fragment key={mod.id}>
                            <TableRow 
                              className={cn(
                                "hover:bg-slate-50/50 border-b border-b-slate-50 cursor-pointer transition-colors group",
                                expandedModId === mod.id && "bg-slate-50/30"
                              )}
                              onClick={() => toggleRow(mod.id)}
                            >
                              <TableCell className="font-semibold text-slate-800 text-xs pl-8">
                                <div className="flex items-center gap-3">
                                  {expandedModId === mod.id ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors" />
                                  )}
                                  {mod.title}
                                </div>
                              </TableCell>
                              <TableCell className="text-slate-500 text-[11px] font-bold font-mono">
                                {mod.requestedAt?.toDate?.().toLocaleDateString('en-GB') || 'Syncing...'}
                              </TableCell>
                              <TableCell className="text-slate-400 text-[11px] font-bold font-mono">
                                {mod.updatedAt?.toDate?.().toLocaleDateString('en-GB') || '--'}
                              </TableCell>
                              <TableCell className="text-right pr-8">
                                <Badge className={cn(
                                  "text-[9px] font-bold px-2.5 py-0.5 border shadow-none rounded-sm uppercase tracking-tighter",
                                  mod.status === "Completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                  mod.status === "Rejected" ? "bg-red-50 text-red-600 border-red-100" :
                                  mod.status === "Pending" ? "bg-amber-50 text-amber-600 border-amber-100" :
                                  "bg-slate-50 text-slate-500 border-slate-200"
                                )}>
                                  {mod.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                            {expandedModId === mod.id && (
                              <TableRow className="bg-slate-50/20 border-b border-slate-100">
                                <TableCell colSpan={4} className="p-8">
                                  <div className="space-y-3 max-w-4xl">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                      <Sparkles className="w-3 h-3" />
                                      Modification Instructions
                                    </h5>
                                    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                      <p className="text-xs text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                                        {mod.description}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* MOBILE RESPONSIVE CARD LIST VIEW */}
                <div className="block md:hidden space-y-6 py-6 px-4">
                  {modifications.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-xs italic font-medium space-y-2">
                      <Server className="w-8 h-8 text-slate-100 mx-auto" />
                      <p>No active modification records in the global ledger.</p>
                    </div>
                  ) : (
                    modifications.map((mod) => {
                      const isExpanded = expandedModId === mod.id
                      return (
                        <div 
                          key={mod.id}
                          className={cn(
                            "bg-white border rounded-xl p-6 relative overflow-hidden transition-all shadow-sm flex flex-col gap-4 cursor-pointer hover:border-slate-300",
                            isExpanded ? "border-primary ring-2 ring-primary/5 shadow-primary/5" : "border-slate-200"
                          )}
                          onClick={() => toggleRow(mod.id)}
                        >
                          {/* Left visual accent colored strip */}
                          <div 
                            className={cn(
                              "absolute left-0 top-0 bottom-0 w-[5px]",
                              mod.status === "Completed" ? "bg-emerald-500" :
                              mod.status === "Rejected" ? "bg-red-500" :
                              mod.status === "Pending" ? "bg-amber-500" : "bg-slate-400"
                            )}
                          />

                          {/* Top Row: Title & Status Badge */}
                          <div className="flex items-start justify-between gap-3">
                            <span className="font-headline font-bold text-slate-800 text-sm leading-snug">{mod.title}</span>
                            <Badge className={cn(
                              "text-[9px] font-bold px-2.5 py-0.5 border shadow-none rounded-sm uppercase tracking-tighter shrink-0",
                              mod.status === "Completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              mod.status === "Rejected" ? "bg-red-50 text-red-600 border-red-100" :
                              mod.status === "Pending" ? "bg-amber-50 text-amber-600 border-amber-100" :
                              "bg-slate-50 text-slate-500 border-slate-200"
                            )}>
                              {mod.status}
                            </Badge>
                          </div>

                          {/* Middle Row: Request & Update Dates */}
                          <div className="grid grid-cols-2 gap-3 text-slate-500 text-xs">
                            <div>
                              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5 leading-none">Requested</p>
                              <p className="font-mono font-bold text-slate-700">
                                {mod.requestedAt?.toDate?.().toLocaleDateString('en-GB') || 'Syncing...'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5 leading-none">Updated On</p>
                              <p className="font-mono font-bold text-slate-700">
                                {mod.updatedAt?.toDate?.().toLocaleDateString('en-GB') || '--'}
                              </p>
                            </div>
                          </div>

                          {/* Bottom Row: Details Accordion Toggle */}
                          <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1 text-[10px] font-bold text-primary">
                            <span>{isExpanded ? "Hide details" : "View details"}</span>
                            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200 shrink-0", isExpanded && "rotate-180")} />
                          </div>

                          {/* Expanded Description Accordion */}
                          {isExpanded && (
                            <div className="pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                              <div className="space-y-2">
                                <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                                  <Sparkles className="w-3 h-3 text-slate-400" />
                                  Modification Instructions
                                </h5>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-150">
                                  <p className="text-xs text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">
                                    {mod.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : selectedOrg?.siteActiveOn === false ? (
          <div className="w-full py-8">
            <Card className="bg-amber-50 border-amber-200 shadow-sm border-dashed">
              <CardContent className="p-12 md:p-20 flex flex-col items-center text-center gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-white border-primary/20 flex items-center justify-center shadow-sm relative">
                    <Clock className="w-10 h-10 text-amber-500" />
                    <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white font-bold border-2 border-white uppercase text-[9px]">
                      PENDING
                    </Badge>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-headline font-bold text-amber-900">Provisioning Managed Infrastructure</h3>
                    <p className="text-amber-700/80 max-w-lg mx-auto text-sm leading-relaxed font-medium">
                      Our engineering team is building your managed website for <span className="font-bold">{selectedOrg.domain}</span>. This process typically initializes within 24 hours.
                    </p>
                  </div>
                  <div className="bg-amber-100/50 p-4 rounded-lg border border-amber-200/50 max-w-lg mx-auto">
                    <p className="text-xs text-amber-800 font-bold leading-relaxed">
                      Our team will reach out to you to clarify your doubts and get a proper concept of your website before we finalize the deployment.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Link href="/support">
                    <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-yellow-500 hover:text-white hover:border-yellow-500 transition-colors font-bold gap-2 h-11 px-8">
                      <MessageSquare className="w-4 h-4" />
                      Contact Support
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : selectedOrg?.hasWebsite === undefined ? (
          <Card className="bg-slate-50 border-slate-200 border-dashed">
            <CardContent className="p-16 flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                <CircleAlert className="w-8 h-8 text-slate-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-bold text-slate-900">Infrastructure Declaration Required</h3>
                <p className="text-slate-500 max-sm mx-auto text-sm leading-relaxed font-medium">
                  Please declare the current website status for <span className="font-bold text-slate-900">{selectedOrg?.domain}</span> to initialize service contexts.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                <Button 
                  onClick={() => handleDeclareWebsite(true)}
                  disabled={isUpdating}
                  className="group flex-1 h-14 bg-white hover:bg-slate-50 text-slate-900 border-slate-200 border shadow-sm font-bold gap-3"
                >
                  <Globe className="w-5 h-5 text-primary group-hover:scale-105 transition-all" />
                  We have a website
                </Button>
                <Button 
                  onClick={() => handleDeclareWebsite(false)}
                  disabled={isUpdating}
                  className="group flex-1 h-14 bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-200 font-bold gap-3"
                >
                  <Ban className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
                  No website yet
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-12">
            <div className="max-w-5xl mx-auto space-y-12 text-center animate-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-4xl font-headline font-bold text-slate-900 leading-tight">
                    {selectedOrg.hasWebsite ? "Upgrade Your Website Presence" : "Get Your Managed Website"}
                  </h2>
                  <div className="max-w-3xl mx-auto space-y-4">
                    <p className="text-slate-500 text-[11px] leading-relaxed font-medium">
                      Launch a high-performance, secure website for your organization on our optimized enterprise infrastructure. This is not an AI-built site or a generic template. Our engineering team provides consistent, long-term support so you never feel lost.
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 max-w-2xl mx-auto">
                  <p className="text-xs text-primary font-bold leading-relaxed">
                    Our team will reach out to you to clarify your doubts and get a proper concept of your website after you request the upgrade.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
                {[
                  { title: "Custom Development", desc: "We build professional, hand-coded websites tailored for your organization.", icon: Zap, color: "bg-amber-50 text-amber-600 border-amber-100" },
                  { title: "Peace of Mind", desc: "Always have full control. Modify your content or request technical changes anytime via our central dashboard.", icon: ShieldCheck, color: "bg-blue-50 text-blue-600 border-blue-100" },
                  { title: "No Hidden Costs", desc: "Stay away from unwanted charges just to make small changes. Our monthly quota includes everything you need for regular maintenance.", icon: CreditCard, color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
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
                  onClick={() => setIsUpgradeConfirmOpen(true)} 
                  size="lg" 
                  disabled={isUpdating}
                  className="font-bold px-12 h-14 shadow-xl shadow-primary/20 text-lg group"
                >
                  {isUpdating ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <Rocket className="w-5 h-5 mr-3 group-hover:translate-y-[-2px] transition-transform" />}
                  Request Managed Website
                </Button>
                
                <AlertDialog open={isUpgradeConfirmOpen} onOpenChange={setIsUpgradeConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-headline font-bold">Confirm Website Upgrade?</AlertDialogTitle>
                      <AlertDialogDescription className="text-sm leading-relaxed">
                        This will initiate the provisioning process for your managed website. 
                        Our engineering team will contact you directly to discuss your specific requirements and website vision before we finalize the deployment.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleRequestUpgrade}
                        className="bg-slate-900 text-white font-bold"
                      >
                        Proceed with Upgrade
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <div className="flex items-center gap-2 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Shield className="w-3 h-3" />
                  Full administrative control guaranteed
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
