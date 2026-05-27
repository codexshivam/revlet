import { DashboardShell } from "@/components/layout/dashboard-shell"
import { WorkflowVisualizer } from "@/components/dashboard/workflow-visualizer"

export default function WorkflowsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold">Workflow States</h1>
        <WorkflowVisualizer />
      </div>
    </DashboardShell>
  )
}
