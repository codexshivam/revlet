import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5",
        className
      )}
    >
      <h1 className="text-2xl font-headline font-semibold text-slate-900 tracking-tight">
        {title}
      </h1>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
