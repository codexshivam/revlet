import { DashboardShell } from "@/components/layout/dashboard-shell"
import { InfrastructureCard } from "@/components/dashboard/infrastructure-card"
import { WorkflowVisualizer } from "@/components/dashboard/workflow-visualizer"
import { BillingCard } from "@/components/dashboard/billing-card"
import { QuotaHistory } from "@/components/dashboard/quota-history"

export default function DashboardPage() {
  return (
    <DashboardShell>
      <div className="space-y-8">
        <section className="flex flex-col gap-1">
          <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">
            IT Overview
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            Real-time governance and institutional metrics for <span className="text-primary font-bold">Kathmandu University</span>
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1 md:col-span-2">
              <WorkflowVisualizer />
            </div>
            <InfrastructureCard />
            <QuotaHistory />
          </div>

          <div className="lg:col-span-1 space-y-6">
            <BillingCard />
            
            <div className="p-6 bg-primary rounded-xl text-white shadow-lg shadow-primary/20 relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 opacity-10 transition-transform group-hover:scale-110 duration-500">
                <ShieldCheck className="w-32 h-32" />
              </div>
              <h3 className="text-lg font-headline font-bold mb-2">Compliance Score</h3>
              <div className="flex items-end gap-2 mb-4">
                <span className="text-4xl font-headline font-bold">94</span>
                <span className="text-sm opacity-80 pb-1">/100</span>
              </div>
              <p className="text-xs opacity-90 leading-relaxed mb-4">
                Your institutional security posture is currently "Elite". 2 minor records require verification.
              </p>
              <button className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-bold transition-colors backdrop-blur-sm">
                View Audit Logs
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}

function ShieldCheck(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
