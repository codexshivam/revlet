"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  CircleAlert, 
  ExternalLink, 
  Clock, 
  CircleCheck, 
  Rocket,
  CirclePlus,
  Loader2,
  Globe,
  Ban
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
import { toast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'

type WebsiteStatus = "not_found" | "external" | "waiting_for_changes" | "ready_and_published"

interface Organization {
  id: string
  name: string
  domain: string
  hasWebsite?: boolean
}

export default function WebsiteManagementPage() {
  const { user } = userUser()
  const db = useFirestore()
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  
  // For demo/UI states - derived from organization data
  const [status, setStatus] = useState<WebsiteStatus>("not_found")

  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

  useEffect(() => {
    const { user, loading: authLoading } = useUser()
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
  }, [db, selectedOrgId])

  // Determine status based on organization data
  useEffect(() => {
    if (selectedOrg) {
      if (selectedOrg.hasWebsite === undefined) {
        setStatus("not_found")
      } else if (selectedOrg.hasWebsite === true) {
        setStatus("external")
      } else {
        setStatus("waiting_for_changes")
      }
    }
  }, [selectedOrg])

  const handleDeclareWebsite = async (hasWebsite: boolean) => {
    if (!selectedOrgId) return
    setIsUpdating(true)
    
    const orgRef = doc(db, "organizations", selectedOrgId)
    updateDoc(orgRef, {
      hasWebsite: hasWebsite
    }).then(() => {
      toast({
        title: "Status Updated",
        description: `Organization website preference has been registered.`,
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

  const handleRequestChange = () => {
    toast({
      title: "Request Submitted",
      description: "Our developers will review your website change request.",
    })
  }

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Directory...</p>
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
            <div className="flex gap-2 bg-white p-1 border border-slate-200 rounded-lg shadow-sm">
               <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setStatus("not_found")}>Test: Not Found</Button>
               <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setStatus("external")}>Test: External</Button>
               <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setStatus("waiting_for_changes")}>Test: Waiting</Button>
               <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold" onClick={() => setStatus("ready_and_published")}>Test: Ready</Button>
            </div>
          </div>
        </div>
        
        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        {status === "not_found" && (
          <Card className="bg-slate-50 border-slate-200 border-dashed">
            <CardContent className="p-16 flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shadow-sm">
                <CircleAlert className="w-8 h-8 text-slate-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-bold text-slate-900">Infrastructure Declaration Required</h3>
                <p className="text-slate-500 max-w-sm mx-auto text-sm leading-relaxed">
                  We currently have no managed website records for <span className="font-bold text-slate-900">{selectedOrg?.name}</span>. Please declare the current status to initialize services.
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

        {status === "external" && (
          <div className="space-y-6">
            <Card className="bg-primary/5 border-primary/20 shadow-sm">
              <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg shrink-0">
                    <ExternalLink className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-headline font-bold text-slate-900">External Hosting Active</h3>
                    <p className="text-slate-500 text-sm mt-1 max-w-md">The website for <span className="font-bold">{selectedOrg?.domain}</span> is hosted externally. Core management features are restricted.</p>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="lg" className="font-bold px-8 shadow-lg shadow-primary/20">
                      Request Managed Migration
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle className="font-headline font-bold">Managed Hosting Migration</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <p className="text-sm text-slate-500">Transition to our high-performance enterprise infrastructure. Our technical team handles the entire migration process.</p>
                      <div className="grid gap-2">
                        <Label htmlFor="current-url" className="text-xs font-bold uppercase text-slate-500">Target URL</Label>
                        <Input id="current-url" defaultValue={`https://${selectedOrg?.domain}`} className="font-bold" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="upgrade-note" className="text-xs font-bold uppercase text-slate-500">Special Requirements</Label>
                        <Textarea id="upgrade-note" placeholder="List any specific CMS or database requirements..." className="min-h-[100px]" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => toast({ title: "Migration request logged" })} className="font-bold px-8">Confirm Migration Request</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>
        )}

        {status === "waiting_for_changes" && (
          <Card className="bg-amber-50 border-amber-200 overflow-hidden shadow-sm">
            <div className="h-1.5 w-full bg-amber-100 relative">
              <div className="absolute top-0 left-0 h-full bg-amber-400 animate-pulse w-2/3" />
            </div>
            <CardContent className="p-12 flex items-start gap-4">
              <div className="p-3 bg-amber-100 rounded-lg shrink-0">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-headline font-bold text-amber-900">Provisioning in Progress</h3>
                <p className="text-amber-700/80 text-sm mt-1 max-w-lg">Our infrastructure team is currently deploying the base platform for {selectedOrg?.domain}. Access controls will unlock once the edge cache is initialized.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "ready_and_published" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between px-6 py-4">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Change Ledger</CardTitle>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" className="font-bold h-8 bg-slate-900 hover:bg-black text-white">
                        <CirclePlus className="w-3.5 h-3.5 mr-1.5" />
                        Request Content Change
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="font-headline font-bold">Content Modification Request</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="req-title" className="text-xs font-bold uppercase text-slate-500">Subject</Label>
                          <Input id="req-title" placeholder="e.g. Update executive profiles" />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="req-desc" className="text-xs font-bold uppercase text-slate-500">Modification Details</Label>
                          <Textarea id="req-desc" placeholder="Provide specific instructions for the development team..." className="min-h-[120px]" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleRequestChange} className="font-bold px-8">Submit to DevOps</Button>
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
                      {[
                        { detail: "Update primary contact records", date: "Jan 12, 2026", status: "Completed" },
                        { detail: "Redesign service landing pages", date: "Feb 04, 2026", status: "Pending" },
                        { detail: "Apply security patch 12.0.4", date: "Feb 15, 2026", status: "Not Started" },
                      ].map((req, i) => (
                        <TableRow key={i} className="hover:bg-slate-50/30 border-b border-slate-50 last:border-0">
                          <TableCell className="font-bold text-slate-800 text-sm pl-6">{req.detail}</TableCell>
                          <TableCell className="text-slate-400 text-xs font-medium">{req.date}</TableCell>
                          <TableCell className="text-right pr-6">
                            <Badge className={cn(
                              "text-[9px] font-bold px-2 py-0.5 border shadow-none",
                              req.status === "Completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              req.status === "Pending" ? "bg-amber-50 text-amber-600 border-amber-100" :
                              "bg-slate-100 text-slate-500 border-slate-200"
                            )}>
                              {req.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
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
                      <span className="text-3xl font-headline font-bold text-primary">2 / 5</span>
                      <span className="text-[10px] font-bold text-slate-400 pb-1">Units Consumed</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full mt-3 overflow-hidden">
                      <div className="h-full bg-primary w-[40%] transition-all" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100 shadow-sm">
                    <CircleCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Live & Synchronized</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 text-white shadow-xl shadow-slate-200">
                <CardContent className="p-6 space-y-4">
                  <Rocket className="w-8 h-8 text-primary" />
                  <h4 className="font-headline font-bold text-lg leading-tight">Advanced Technical Support</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Require custom API integrations or complex database architectures? Our engineering team is available for deep-tech consultations.
                  </p>
                  <Button variant="outline" className="w-full border-slate-700 text-white hover:bg-slate-800 text-xs font-bold h-10">
                    Consult Engineering Lead
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

import { useUser } from "@/firebase/auth/use-user"
