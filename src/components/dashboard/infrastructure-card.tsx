
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Globe, ShieldCheck, Activity, Terminal } from "lucide-react"

const records = [
  { name: "api.edusphere.edu.np", type: "A", status: "Active", health: 98 },
  { name: "mail.edusphere.edu.np", type: "MX", status: "Active", health: 100 },
  { name: "cdn.edusphere.edu.np", type: "CNAME", status: "Active", health: 94 },
]

export function InfrastructureCard() {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-base font-headline font-bold">
          Infrastructure Control
        </CardTitle>
        <Activity className="h-4 w-4 text-accent" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">System Health</span>
              <span className="text-lg font-headline font-bold text-slate-900">99.8%</span>
            </div>
            <div className="w-px h-8 bg-slate-200 self-center" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Requests/s</span>
              <span className="text-lg font-headline font-bold text-slate-900">1.2k</span>
            </div>
            <div className="w-px h-8 bg-slate-200 self-center" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Errors</span>
              <span className="text-lg font-headline font-bold text-red-500">0.02%</span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Critical DNS Records</span>
            {records.map((record) => (
              <div key={record.name} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded transition-colors group">
                <div className="flex items-center gap-3">
                  <Terminal className="h-3.5 w-3.5 text-slate-400" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">{record.name}</span>
                    <span className="text-[10px] text-slate-400">Record Type: {record.type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px]">
                    {record.status}
                  </Badge>
                  <div className="h-1.5 w-12 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent" 
                      style={{ width: `${record.health}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
