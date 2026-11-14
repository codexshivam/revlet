import { Skeleton } from "@/components/ui/skeleton"

interface TableSkeletonProps {
  rows?: number
  cols?: number
}

export function TableSkeleton({ rows = 5, cols = 4 }: TableSkeletonProps) {
  const widths = ["w-36", "w-28", "w-44", "w-20", "w-16"]

  return (
    <div className="divide-y divide-slate-100">
      {[...Array(rows)].map((_, r) => (
        <div key={r} className="flex items-center justify-between gap-4 px-6 py-4">
          {[...Array(cols)].map((__, c) => (
            <Skeleton
              key={c}
              className={`h-3.5 ${widths[c % widths.length]} bg-slate-100 ${
                c === cols - 1 ? "ml-auto" : ""
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
