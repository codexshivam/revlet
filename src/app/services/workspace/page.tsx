import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, ShieldCheck, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function WorkspacePage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold">Google Workspace Sync</h1>
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-500" /> Synchronization Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm font-bold uppercase text-slate-500 mb-1">Last Full Sync</p>
                <p className="text-lg font-headline font-bold">12:45 PM Today</p>
              </div>
              <Button className="w-full">Force Sync Now</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" /> Domain Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><span>SPF Record</span><span className="text-emerald-600 font-bold">Valid</span></li>
                <li className="flex justify-between"><span>DKIM Signing</span><span className="text-emerald-600 font-bold">Enabled</span></li>
                <li className="flex justify-between"><span>DMARC Policy</span><span className="text-amber-600 font-bold">P=None</span></li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
