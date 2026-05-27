import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Database, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function HostingPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-headline font-bold">Web Hosting</h1>
          <Button><Plus className="mr-2 h-4 w-4" /> New Deployment</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Active Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['Main Website', 'Student Portal', 'LMS'].map((site) => (
                <div key={site} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="font-bold">{site}</p>
                      <p className="text-xs text-slate-500">ku.edu.np/portal</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Manage</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
