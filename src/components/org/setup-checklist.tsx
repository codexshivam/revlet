"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Circle, Sparkles, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useActiveOrg } from "@/hooks/use-active-org"
import { buildOrgRoute } from "@/lib/org-routes"
import { cn } from "@/lib/utils"

const DISMISS_KEY_PREFIX = "revlet_setup_checklist_dismissed_"

export function SetupChecklist() {
  const { activeOrg } = useActiveOrg()
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    if (!activeOrg?.id || typeof window === "undefined") return
    try {
      setDismissed(window.localStorage.getItem(`${DISMISS_KEY_PREFIX}${activeOrg.id}`) === "1")
    } catch {
      setDismissed(false)
    }
  }, [activeOrg?.id])

  if (!activeOrg || dismissed) return null

  const hasDomain = Boolean(activeOrg.domain)
  const hasDns = Boolean(activeOrg.cloudflareZoneId || activeOrg.dnsRequested)
  const hasMail = Boolean(activeOrg.mailServiceActive)
  const hasTeam = Array.isArray(activeOrg.memberEmails) && activeOrg.memberEmails.length > 0

  const steps = [
    {
      id: "org",
      label: "Register organization",
      done: hasDomain,
      href: buildOrgRoute("overview"),
    },
    {
      id: "dns",
      label: "Connect DNS management",
      done: hasDns,
      href: buildOrgRoute("dns"),
    },
    {
      id: "email",
      label: "Activate Email Service",
      done: hasMail,
      href: buildOrgRoute("email", "users"),
    },
    {
      id: "team",
      label: "Invite team members",
      done: hasTeam,
      href: buildOrgRoute("team"),
    },
  ]

  const completedCount = steps.filter((s) => s.done).length
  const allDone = completedCount === steps.length

  const handleDismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(`${DISMISS_KEY_PREFIX}${activeOrg.id}`, "1")
    } catch {
      // ignore storage errors
    }
  }

  return (
    <Card className="bg-white border-slate-200 shadow-none rounded-xl overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              {allDone ? (
                <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              ) : null}
              <h2 className="text-sm font-semibold text-slate-900">
                {allDone
                  ? `${activeOrg.name || activeOrg.domain} is ready`
                  : `Workspace setup for ${activeOrg.name || activeOrg.domain}`}
              </h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 tabular-nums">
                {completedCount}/{steps.length}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {allDone
                ? "All core infrastructure services are configured."
                : "Complete these steps to finish configuring your organization."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            aria-label="Dismiss setup checklist"
            className="h-7 w-7 text-slate-400 hover:text-slate-700 rounded-lg shrink-0"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {steps.map((step) => (
            <Link
              key={step.id}
              href={step.href}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors",
                step.done
                  ? "bg-slate-50/80 border-slate-200/80 text-slate-600"
                  : "bg-white border-slate-200 text-slate-900 hover:border-primary/50 hover:bg-primary/5 font-medium"
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {step.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
                )}
                <span className={cn("truncate", step.done && "line-through decoration-slate-300")}>
                  {step.label}
                </span>
              </div>
              {!step.done && (
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
