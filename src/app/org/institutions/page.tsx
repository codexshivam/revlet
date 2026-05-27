import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function InstitutionsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-headline font-bold">Institutions</h1>
          <Button><Plus className="mr-2 h-4 w-4" /> Add Institution</Button>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {['Kathmandu University', 'Tribhuvan University', 'St. Xavier\'s College'].map((name) => (
            <Card key={name} className="hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-slate-500" />
                </div>
                <CardTitle className="text-lg">{name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500">Institutional code: {name.substring(0, 2).toUpperCase()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
