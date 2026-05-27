
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Edit2, Globe, Activity, AlertCircle } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"

export default function AccountHomePage() {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState("Main IT Administrator")

  return (
    <DashboardShell>
      <div className="space-y-6">
        <section className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  className="text-2xl font-headline font-bold h-10 w-64"
                />
                <Button size="sm" onClick={() => setIsEditing(false)}>Save</Button>
              </div>
            ) : (
              <>
                <h2 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">
                  {name}
                </h2>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-slate-400 hover:text-primary"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
          <p className="text-slate-500 text-sm font-medium">Enterprise Management Portal</p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Organizations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-4xl font-headline font-bold text-slate-900">12</span>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 font-bold border-emerald-100">+2 this month</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Domains</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { domain: "kvm.edu.np", status: "Active" },
                { domain: "lss.edu.np", status: "Active" }
              ].map((d) => (
                <div key={d.domain} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">{d.domain}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className="w-2/3 h-full bg-primary" />
                    </div>
                    <span className="text-emerald-500 font-bold">●</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pending Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 bg-red-50 rounded border border-red-100">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold text-red-700">3 Overdue Invoices</span>
                </div>
                <div className="flex items-center gap-2 p-2 bg-amber-50 rounded border border-amber-100">
                  <Activity className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-amber-700">2 Pending DNS Changes</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
