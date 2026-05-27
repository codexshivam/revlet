import { DashboardShell } from "@/components/layout/dashboard-shell"
import { QuotaHistory } from "@/components/dashboard/quota-history"

export default function QuotaPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold">Quota Audit</h1>
        <QuotaHistory />
      </div>
    </DashboardShell>
  )
}
