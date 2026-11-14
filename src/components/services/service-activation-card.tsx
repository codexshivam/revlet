import * as React from "react"
import { Card } from "@/components/ui/card"

export interface ServiceFeature {
  title: string
  description: string
}

interface ServiceActivationCardProps {
  domain: string
  domainIcon: React.ReactNode
  title: string
  description: string
  features: ServiceFeature[]
  rightPanel: React.ReactNode
}

export function ServiceActivationCard({
  domain,
  domainIcon,
  title,
  description,
  features,
  rightPanel,
}: ServiceActivationCardProps) {
  return (
    <Card className="bg-white border-slate-200 shadow-none rounded-xl overflow-hidden">
      <div className="flex flex-col lg:flex-row">
        {/* 65% Blue Feature Panel */}
        <div className="w-full lg:w-[65%] bg-primary text-white p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80">
              {domainIcon}
              Domain: {domain}
            </span>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
              {description}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
            {features.map((f) => (
              <div key={f.title} className="space-y-1">
                <p className="font-semibold text-white">{f.title}</p>
                <p className="text-white/85 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 35% Activation Controls */}
        <div className="w-full lg:w-[35%] p-6 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col justify-between gap-5">
          {rightPanel}
        </div>
      </div>
    </Card>
  )
}
