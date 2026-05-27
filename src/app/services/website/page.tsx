
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
  History, 
  Rocket,
  CirclePlus,
  CircleHelp
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

type WebsiteStatus = "not_found" | "external" | "waiting_for_changes" | "ready_and_published"

export default function WebsiteManagementPage() {
  const [status, setStatus] = useState<WebsiteStatus>("ready_and_published")

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-headline font-bold text-slate-900">Website Management</h1>
          <div className="flex gap-2">
             <Button variant="ghost" size="sm" onClick={() => setStatus("not_found")}>Test: Not Found</Button>
             <Button variant="ghost" size="sm" onClick={() => setStatus("external")}>Test: External</Button>
             <Button variant="ghost" size="sm" onClick={() => setStatus("waiting_for_changes")}>Test: Waiting</Button>
             <Button variant="ghost" size="sm" onClick={() => setStatus("ready_and_published")}>Test: Ready</Button>
          </div>
        </div>
        
        <OrgSelector />

        {status === "not_found" && (
          <Card className="bg-slate-50 border-slate-200 border-dashed">
            <CardContent className="p-12 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                <CircleAlert className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <h3 className="text-xl font-headline font-bold text-slate-900">Website Not Found</h3>
                <p className="text-slate-500 max-w-sm mt-1">No managed website records associated with this organization were found in our directory.</p>
              </div>
              <Button className="font-bold">Initialize Website Setup</Button>
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
                <Button size="lg" className="font-bold px-8 shadow-lg shadow-primary/20">
                  Upgrade Your Website
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {status === "waiting_for_changes" && (
          <Card className="bg-amber-50 border-amber-200 overflow-hidden shadow-sm">
            <div className="h-1.5 w-full bg-amber-100 relative">
              <div className="absolute top-0 left-0 h-full bg-amber-400 animate-pulse w-2/3" />
            </div>
            <CardContent className="p-8 flex items-start gap-4">
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
                <CardHeader className="bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold text-slate-600">Change History Ledger</CardTitle>
                  <Button size="sm" className="font-bold h-8">
                    <CirclePlus className="w-3.5 h-3.5 mr-1.5" />
                    Request New Website Change
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/30">
                        <TableHead className="text-[10px] font-bold uppercase py-3">Request Details</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Date Requested</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-3">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { detail: "Update Academic Calendar for 2024", date: "May 20, 2024", status: "Completed" },
                        { detail: "Add new faculty profile pictures", date: "May 24, 2024", status: "Pending" },
                        { detail: "Revise Fee Structure Page", date: "May 26, 2024", status: "Not Started" },
                      ].map((req, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-slate-800">{req.detail}</TableCell>
                          <TableCell className="text-slate-500 text-xs">{req.date}</TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "text-[10px] font-bold px-2 py-0.5 border",
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
                <CardHeader>
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Quota Monitoring</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-sm font-bold text-slate-900">Change Limitations Remaining</p>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-3xl font-headline font-bold text-primary">2 / 5</span>
                      <span className="text-xs font-medium text-slate-500 pb-1">Changes Used</span>
                    </div>
                    <div className="h-2 w-full bg-slate-200 rounded-full mt-3 overflow-hidden">
                      <div className="h-full bg-primary w-[40%]" />
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
