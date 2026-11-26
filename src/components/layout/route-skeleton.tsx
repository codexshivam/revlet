import { Skeleton } from "@/components/ui/skeleton"

export function OverviewRouteSkeleton() {
  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded-md bg-slate-200/80" />
          <Skeleton className="h-4 w-72 rounded bg-slate-100" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg bg-slate-200/70" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200/80 bg-white p-5 space-y-3">
            <Skeleton className="h-3.5 w-24 rounded bg-slate-100" />
            <Skeleton className="h-7 w-20 rounded bg-slate-200/80" />
            <Skeleton className="h-3 w-32 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-200/80 bg-white p-5 space-y-4">
          <Skeleton className="h-5 w-40 rounded bg-slate-200/70" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg bg-slate-100" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-36 rounded bg-slate-200/70" />
                  <Skeleton className="h-3 w-52 rounded bg-slate-100" />
                </div>
              </div>
              <Skeleton className="h-6 w-16 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 space-y-4">
          <Skeleton className="h-5 w-32 rounded bg-slate-200/70" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function TableRouteSkeleton() {
  return (
    <div className="space-y-5 py-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44 rounded-md bg-slate-200/80" />
          <Skeleton className="h-4 w-64 rounded bg-slate-100" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-lg bg-slate-100" />
          <Skeleton className="h-9 w-32 rounded-lg bg-slate-200/80" />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <Skeleton className="h-9 w-64 rounded-lg bg-slate-100" />
          <Skeleton className="h-8 w-24 rounded-lg bg-slate-100" />
        </div>
        <div className="divide-y divide-slate-100">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <Skeleton className="h-4 w-16 rounded bg-slate-200/70" />
              <Skeleton className="h-4 flex-1 max-w-[220px] rounded bg-slate-200/70" />
              <Skeleton className="h-4 flex-1 max-w-[280px] rounded bg-slate-100 hidden sm:block" />
              <Skeleton className="h-6 w-16 rounded-full bg-slate-100 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
