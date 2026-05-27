
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
  CirclePlus
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
import { useState } from "react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

type WebsiteStatus = "not_found" | "external" | "waiting_for_changes" | "ready_and_published"

export default function WebsiteManagementPage() {
  const [status, setStatus] = useState<WebsiteStatus>("ready_and_published")

  const handleRequestChange = () => {
    toast({
      title: "Request Submitted",
      description: "Our developers will review your website change request.",
    })
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-headline font-bold text-slate-900">Website Management</h1>
          <div className="flex gap-2 bg-white p-1 border border-slate-200 rounded-lg shadow-sm">
             <Button variant="ghost" size="xs" className="h-7 text-[10px] font-bold" onClick={() => setStatus("not_found")}>Test: Not Found</Button>
             <Button variant="ghost" size="xs" className="h-7 text-[10px] font-bold" onClick={() => setStatus("external")}>Test: External</Button>
             <Button variant="ghost" size="xs" className="h-7 text-[10px] font-bold" onClick={() => setStatus("waiting_for_changes")}>Test: Waiting</Button>
             <Button variant="ghost" size="xs" className="h-7 text-[10px] font-bold" onClick={() => setStatus("ready_and_published")}>Test: Ready</Button>
          </div>
        </div>
        
        <OrgSelector />

        {status === "not_found" && (
          <Card className="bg-slate-50 border-slate-200 border-dashed">
            <CardContent className="p-16 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                <CircleAlert className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <h3 className="text-xl font-headline font-bold text-slate-900">Website Not Found</h3>
                <p className="text-slate-500 max-w-sm mt-1">No managed website records associated with this organization were found in our directory.</p>
              </div>
              <Button className="font-bold shadow-lg shadow-primary/10">Initialize Website Setup</Button>
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
                    <h3 className="text-lg font-headline font-bold text-slate-900">External Hosting Detected</h3>
                    <p className="text-slate-500 text-sm mt-1 max-w-md">Your current website is hosted externally and is not managed by our core team. Configuration controls are limited.</p>
                  </div>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="lg" className="font-bold px-8 shadow-lg shadow-primary/20">
                      Upgrade Your Website
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-xl">
                    <DialogHeader>
                      <DialogTitle>Request Managed Hosting Upgrade</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <p className="text-sm text-slate-500">Upgrade to our high-performance managed infrastructure for educational institutions. We handle the migration for you.</p>
                      <div className="grid gap-2">
                        <Label htmlFor="current-url">Current Website URL</Label>
                        <Input id="current-url" placeholder="https://www.example.edu.np" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="upgrade-note">Special Instructions</Label>
                        <Textarea id="upgrade-note" placeholder="Include any specific requirements for migration..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => toast({ title: "Upgrade request sent" })}>Submit Request</Button>
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
                <h3 className="text-lg font-headline font-bold text-amber-900">Waiting for Changes</h3>
                <p className="text-amber-700/80 text-sm mt-1 max-w-lg">Our development team is currently migrating and deploying your new platform. Changes are temporarily locked while synchronization is in progress.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "ready_and_published" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between px-6 py-4">
                  <CardTitle className="text-xs font-bold text-slate-600 uppercase tracking-widest">Change History Ledger</CardTitle>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" className="font-bold h-8">
                        <CirclePlus className="w-3.5 h-3.5 mr-1.5" />
                        Request Website Change
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>New Website Change Request</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="req-title">Brief Summary</Label>
                          <Input id="req-title" placeholder="e.g. Update fee structure page" />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="req-desc">Detailed Instructions</Label>
                          <Textarea id="req-desc" placeholder="Describe the exact changes needed..." className="min-h-[120px]" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleRequestChange}>Submit Request</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/30 border-b border-slate-200">
                        <TableHead className="text-[10px] font-bold uppercase py-3 pl-6">Request Details</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Date Requested</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3 text-right pr-6">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { detail: "Update Academic Calendar for 2024", date: "May 20, 2024", status: "Completed" },
                        { detail: "Add new faculty profile pictures", date: "May 24, 2024", status: "Pending" },
                        { detail: "Revise Fee Structure Page", date: "May 26, 2024", status: "Not Started" },
                      ].map((req, i) => (
                        <TableRow key={i} className="hover:bg-slate-50/30 border-b border-slate-100 last:border-0">
                          <TableCell className="font-bold text-slate-800 text-sm pl-6">{req.detail}</TableCell>
                          <TableCell className="text-slate-500 text-xs font-medium">{req.date}</TableCell>
                          <TableCell className="text-right pr-6">
                            <Badge className={cn(
                              "text-[10px] font-bold px-2 py-0.5 border shadow-none",
                              req.status === "Completed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              req.status === "Pending" ? "bg-amber-50 text-amber-600 border-amber-100" :
                              "bg-slate-100 text-slate-500 border-slate-200"
                            )}>
                              [{req.status}]
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
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Quota Monitoring</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase">Change Limitations</p>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-3xl font-headline font-bold text-primary">2 / 5</span>
                      <span className="text-[10px] font-bold text-slate-400 pb-1">Changes Used</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full mt-3 overflow-hidden">
                      <div className="h-full bg-primary w-[40%] transition-all" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <CircleCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-700">Environment: Published</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 text-white shadow-xl shadow-slate-200">
                <CardContent className="p-6 space-y-4">
                  <Rocket className="w-8 h-8 text-primary" />
                  <h4 className="font-headline font-bold text-lg leading-tight">Elite Website Management</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Need deep technical integrations or custom features? Our technical team is available for 1-on-1 consultations.
                  </p>
                  <Button variant="outline" className="w-full border-slate-700 text-white hover:bg-slate-800 text-xs font-bold h-9">
                    Contact Tech Lead
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
