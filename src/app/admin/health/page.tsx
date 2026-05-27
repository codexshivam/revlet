import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity } from "lucide-react"

export default function HealthPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold">System Health</h1>
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Global Uptime</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-headline font-bold text-emerald-500">99.99%</div>
              <p className="text-sm text-slate-500 mt-2">All systems operational</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Active Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-headline font-bold text-slate-300">0</div>
              <p className="text-sm text-slate-500 mt-2">No critical alerts found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
