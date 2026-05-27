
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ArrowRight,
  Send,
  Globe
} from "lucide-react"
import { cn } from "@/lib/utils"

const workflows = [
  { id: 1, name: "Academic CMS Update", status: "Published", institution: "KU" },
  { id: 2, name: "Google Workspace Sync", status: "Waiting", institution: "TU" },
  { id: 3, name: "DNS Propagation", status: "Ready", institution: "SXC" },
]

const getStatusStyles = (status: string) => {
  switch (status) {
    case "Published": return "bg-emerald-50 text-emerald-700 border-emerald-100"
    case "Waiting": return "bg-amber-50 text-amber-700 border-amber-100"
    case "Ready": return "bg-primary/5 text-primary border-primary/20"
    default: return ""
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Published": return <CheckCircle2 className="h-3.5 w-3.5" />
    case "Waiting": return <Clock className="h-3.5 w-3.5" />
    case "Ready": return <Send className="h-3.5 w-3.5" />
    default: return <AlertCircle className="h-3.5 w-3.5" />
  }
}

export function WorkflowVisualizer() {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-base font-headline font-bold">
          Deployment Funnel
        </CardTitle>
        <Globe className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <div className="relative flex justify-between px-2">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-200 -z-10" />
            {['Pending', 'Staging', 'Ready', 'Published'].map((step, i) => (
              <div key={step} className="flex flex-col items-center gap-2 bg-white px-2">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-500",
                  i <= 2 ? "bg-primary border-primary" : "bg-white border-slate-300"
                )}>
                  {i <= 2 && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{step}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {workflows.map((flow) => (
              <div key={flow.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:border-primary/20 transition-all cursor-pointer group">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-800">{flow.name}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{flow.institution} • Last updated 2m ago</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={cn("flex items-center gap-1.5 py-0.5", getStatusStyles(flow.status))}>
                    {getStatusIcon(flow.status)}
                    {flow.status}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
