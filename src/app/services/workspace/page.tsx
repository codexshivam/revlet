"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck, Mail, Info, CheckCircle, Clock, GraduationCap } from "lucide-react"
import { useState } from "react"

type WorkspaceStatus = null | "applied" | "pending" | "active"

export default function WorkspaceManagementPage() {
  const [status, setStatus] = useState<WorkspaceStatus>("active")

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Services</span>
            <h1 className="text-3xl font-headline font-bold text-slate-900">Google Workspace for Ed.</h1>
          </div>
          <div className="flex gap-2">
             <Button variant="ghost" size="sm" onClick={() => setStatus(null)}>Test: Unregistered</Button>
             <Button variant="ghost" size="sm" onClick={() => setStatus("applied")}>Test: Pending</Button>
             <Button variant="ghost" size="sm" onClick={() => setStatus("active")}>Test: Active</Button>
          </div>
        </div>
        
        <OrgSelector />

        {status === null && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="p-3 bg-primary/10 rounded-xl w-fit">
                <GraduationCap className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-4xl font-headline font-bold text-slate-900 leading-tight">
                Unlock Enterprise-Grade Productivity
              </h2>
              <h3 className="text-slate-500 leading-relaxed">
                Empower your students and faculty with professional collaboration tools. Google Workspace for Education Fundamentals is available at no cost for qualifying institutions.
              </h3>
              <ul className="space-y-3">
                {[
                  "Custom @institution.edu.np email addresses",
                  "100 TB of pooled cloud storage",
                  "Secure Google Classroom & Meet integration",
                  "Advanced data protection & admin controls"
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button size="lg" className="h-12 px-10 font-bold shadow-xl shadow-primary/20">
                Apply for Google Workspace
              </Button>
            </div>
            
            <Card className="bg-white border-slate-200 overflow-hidden shadow-2xl">
              <img src="https://picsum.photos/seed/workspace/800/600" alt="Workspace Preview" className="w-full h-auto grayscale opacity-50" />
              <CardContent className="p-8 text-center bg-slate-50">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Configuration Locked</p>
              </CardContent>
            </Card>
          </div>
        )}

        {(status === "applied" || status === "pending") && (
          <Card className="bg-amber-50 border-amber-200 shadow-sm">
            <CardContent className="p-12 flex flex-col items-center text-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-white border-2 border-amber-200 flex items-center justify-center">
                  <Clock className="w-10 h-10 text-amber-500" />
                </div>
                <Badge className="absolute -top-2 -right-2 bg-amber-500 text-white border-2 border-white px-3 font-bold">
                  [Pending Approval]
                </Badge>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-headline font-bold text-amber-900">Application Under Verification</h3>
                <p className="text-amber-700/80 max-w-lg mx-auto">
                  Application submitted. Our administrative team is currently managing your verification with Google. Configuration controls are locked until domain ownership is verified.
                </p>
              </div>

              <div className="flex gap-4">
                <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 font-bold">Check Domain Status</Button>
                <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 font-bold">Contact Support</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "active" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Deployment Status</CardTitle>
                <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-bold px-3">[Active]</Badge>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="flex items-center gap-4 p-4 bg-emerald-50/50 rounded-lg border border-emerald-100">
                  <ShieldCheck className="w-8 h-8 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Domain Verified</p>
                    <p className="text-[10px] text-slate-500 font-medium">Auto-renewing DNS confirmation</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-500">Storage Pool</span>
                    <span className="text-slate-900">12.4 TB / 100 TB</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-[12.4%]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Account Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Active Users", value: "2,450" },
                  { label: "Faculty Accounts", value: "182" },
                  { label: "Managed Devices", value: "84" }
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0">
                    <span className="text-sm font-medium text-slate-500">{s.label}</span>
                    <span className="text-sm font-bold text-slate-900">{s.value}</span>
                  </div>
                ))}
                <Button variant="outline" className="w-full text-xs font-bold mt-2">Manage Directory</Button>
              </CardContent>
            </Card>

            <Card className="bg-blue-600 text-white shadow-xl shadow-blue-100">
              <CardContent className="p-6 flex flex-col h-full justify-between">
                <Mail className="w-8 h-8 mb-4" />
                <div className="space-y-2">
                  <h4 className="font-headline font-bold text-lg">Admin Console</h4>
                  <p className="text-xs text-blue-100 leading-relaxed">
                    Directly access Google's central administrative controls for users, groups, and device policies.
                  </p>
                </div>
                <Button className="w-full bg-white text-blue-600 hover:bg-blue-50 font-bold mt-6 h-9 text-xs">
                  Launch Google Admin Console
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
