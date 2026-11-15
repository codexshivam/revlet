import Link from "next/link"
import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface EmptyOrgStateProps {
  icon: React.ReactNode
  title?: string
  description: string
}

export function EmptyOrgState({
  icon,
  title = "No Organizations Registered",
  description,
}: EmptyOrgStateProps) {
  return (
    <Card className="bg-white border-slate-200 border-dashed shadow-none rounded-xl py-12">
      <CardContent className="flex flex-col items-center text-center gap-4 max-w-md mx-auto">
        <div className="p-3 bg-slate-50 rounded-full border border-slate-100 text-slate-400">
          {icon}
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <Link href="/account/home">
          <Button className="h-9 px-4 text-xs font-medium rounded-lg shadow-none">
            Go to Account Home
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
