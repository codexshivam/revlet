import { DashboardShell } from "@/components/layout/dashboard-shell"
import { BillingCard } from "@/components/dashboard/billing-card"

export default function BillingPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold">Institutional Billing</h1>
        <div className="max-w-3xl">
          <BillingCard />
        </div>
      </div>
    </DashboardShell>
  )
}
