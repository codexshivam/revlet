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

type WebsiteStatus = "not_found" | "external" | "ready_and_published"

interface Organization {
  id: string
  name: string
  domain: string
  hasWebsite?: boolean
}

export default function WebsiteManagementPage() {
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

  // Real-world status logic based on Firestore data
  const status = useMemo((): WebsiteStatus => {
    if (!selectedOrg) return "not_found"
    if (selectedOrg.hasWebsite === undefined) return "not_found"
    if (selectedOrg.hasWebsite === true) return "external"
    return "ready_and_published"
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
    }, (error) => {
      const permissionError = new FirestorePermissionError({
        path: 'organizations',
        operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
    })
    return unsub
  }, [user, authLoading, db, selectedOrgId])

  const handleDeclareWebsite = (hasWebsite: boolean) => {
    if (!selectedOrgId) return
    setIsUpdating(true)
    
    const orgRef = doc(db, "organizations", selectedOrgId)
    updateDoc(orgRef, {
      hasWebsite: hasWebsite
    }).then(() => {
      toast({
        title: "Infrastructure Context Updated",
        description: `Website preference for ${selectedOrg?.name} has been registered.`,
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
      description: "Your modification request has been queued for review by the DevOps team.",
    })
  }

  if (isLoading || authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Infrastructure...</p>
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
          </div>
        </div>
        
        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        {status === "not_found" && (
          <Card className="bg-slate-50 border-slate-200 border-dashed">
            <CardContent className="p-16 flex flex-col items-center text-center gap-6">
              <div className="w-16 h-16 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                <CircleAlert className="w-8 h-8 text-slate-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-bold text-slate-900">Infrastructure Declaration Required</h3>
                <p className="text-slate-500 max-w-sm mx-auto text-sm leading-relaxed">
                  No managed website records exist for <span className="font-bold text-slate-900">{selectedOrg?.name}</span>. Please declare the current status to initialize services.
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
                    <p className="text-slate-500 text-sm mt-1 max-w-md">The website for <span className="font-bold">{selectedOrg?.domain}</span> is hosted on external infrastructure. Advanced edge controls are restricted.</p>
                  </div>
                </div>
                <div className="flex gap-3">
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
                        <Button onClick={() => toast({ title: "Migration request logged", description: "A technical lead will contact you within 24 hours." })} className="font-bold px-8">Confirm Migration Request</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button variant="outline" onClick={() => handleDeclareWebsite(false)} className="border-slate-200 h-11 px-6 font-bold text-slate-500 hover:text-destructive">
                    Remove Declaration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
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
                        { detail: "Initial architecture deployment", date: "Feb 10, 2026", status: "Completed" },
                        { detail: "Edge security rules configuration", date: "Feb 12, 2026", status: "Completed" },
                      ].map((req, i) => (
                        <TableRow key={i} className="hover:bg-slate-50/30 border-b border-slate-50 last:border-0">
                          <TableCell className="font-bold text-slate-800 text-sm pl-6">{req.detail}</TableCell>
                          <TableCell className="text-slate-400 text-xs font-medium">{req.date}</TableCell>
                          <TableCell className="text-right pr-6">
                            <Badge className="text-[9px] font-bold px-2 py-0.5 border shadow-none bg-emerald-50 text-emerald-600 border-emerald-100">
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
                      <span className="text-3xl font-headline font-bold text-primary">0 / 5</span>
                      <span className="text-[10px] font-bold text-slate-400 pb-1">Units Consumed</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full mt-3 overflow-hidden">
                      <div className="h-full bg-primary w-[0%] transition-all" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100 shadow-sm">
                    <CircleCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-[10px] font-bold text-emerald-700 uppercase">Live & Published</span>
                  </div>
                  <Button variant="ghost" onClick={() => handleDeclareWebsite(true)} className="w-full text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-destructive">
                    Switch to External
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 text-white shadow-xl shadow-slate-200">
                <CardContent className="p-6 space-y-4">
                  <Rocket className="w-8 h-8 text-primary" />
                  <h4 className="font-headline font-bold text-lg leading-tight">Advanced Engineering Support</h4>
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
