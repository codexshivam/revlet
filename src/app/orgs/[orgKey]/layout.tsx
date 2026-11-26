import { Suspense } from "react"

export default function LegacyWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>
}
