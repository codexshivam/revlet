
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { OrgSwitcher } from "@/components/layout/org-switcher"
import { GlobalSearch } from "@/components/layout/global-search"
import { InfrastructureCard } from "@/components/dashboard/infrastructure-card"
import { WorkflowVisualizer } from "@/components/dashboard/workflow-visualizer"
import { BillingCard } from "@/components/dashboard/billing-card"
import { QuotaHistory } from "@/components/dashboard/quota-history"
import { Bell, HelpCircle, LayoutGrid } from "lucide-react"

export default function DashboardPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <RecursiveSidebar />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200 z-10 shrink-0">
          <div className="flex items-center gap-6 flex-1">
            <OrgSwitcher />
            <GlobalSearch />
          </div>
          
          <div className="flex items-center gap-4 ml-4">
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-white" />
            </button>
            <div className="w-px h-6 bg-slate-200 mx-2" />
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-all">
              <LayoutGrid className="w-4 h-4" />
              Apps
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-8">
            <section className="flex flex-col gap-1">
              <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">
                IT Overview
              </h1>
              <p className="text-slate-500 text-sm font-medium">
                Real-time governance and institutional metrics for <span className="text-primary font-bold">Kathmandu University</span>
              </p>
            </section>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Left Column Span */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-1 md:col-span-2">
                  <WorkflowVisualizer />
                </div>
                <InfrastructureCard />
                <QuotaHistory />
              </div>

              {/* Right Column Sidebar */}
              <div className="lg:col-span-1 space-y-6">
                <BillingCard />
                
                {/* Secondary Small Card */}
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
        </div>
      </main>
    </div>
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
