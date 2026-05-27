import { DashboardShell } from "@/components/layout/dashboard-shell"
import { InfrastructureCard } from "@/components/dashboard/infrastructure-card"

export default function DNSPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold">DNS & Infrastructure</h1>
        <InfrastructureCard />
      </div>
    </DashboardShell>
  )
}
