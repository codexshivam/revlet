
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { History, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

const activity = [
  { action: "DNS Record Modified", user: "S. Poudel", time: "12m ago", change: "-1 quota" },
  { action: "New Site Provisioned", user: "R. Karki", time: "1h ago", change: "-5 quota" },
  { action: "SSL Certificate Renewed", user: "System", time: "3h ago", change: "0 quota" },
]

export function QuotaHistory() {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-base font-headline font-bold">
          Site Updates & Quotas
        </CardTitle>
        <History className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between items-end">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Monthly Resource Quota</span>
              <span className="text-sm font-bold text-slate-900">42 / 50</span>
            </div>
            <Progress value={84} className="h-2 bg-slate-100" />
            <div className="flex items-center gap-2 mt-1">
              <ShieldAlert className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] text-slate-500">Low quota warning: 8 changes remaining</span>
            </div>
          </div>

          <div className="space-y-3">
             <span className="text-[11px] font-bold text-slate-400 uppercase">Audit Log</span>
             {activity.map((item, i) => (
               <div key={i} className="flex items-start justify-between py-2 border-b border-slate-50 last:border-0">
                 <div className="flex flex-col">
                   <span className="text-xs font-semibold text-slate-700">{item.action}</span>
                   <span className="text-[10px] text-slate-400">{item.user} • {item.time}</span>
                 </div>
                 <span className={cn(
                   "text-[10px] font-bold px-1.5 rounded",
                   item.change.startsWith('-') ? "text-amber-600 bg-amber-50" : "text-slate-400 bg-slate-50"
                 )}>
                   {item.change}
                 </span>
               </div>
             ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
