"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Check,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import {
  getZoneSecurityLevel,
  setZoneSecurityLevel,
} from "@/app/actions/cloudflare-infrastructure"

interface DdosProtectionTabProps {
  zoneId?: string
  domain?: string
  orgId?: string
  getIdToken: () => Promise<string>
}

export function DdosProtectionTab({ zoneId, domain, orgId, getIdToken }: DdosProtectionTabProps) {
  const [loading, setLoading] = useState(true)
  const [securityLevel, setSecurityLevel] = useState<string>("medium")
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false)

  const loadData = useCallback(async () => {
    if (!zoneId || !orgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const token = await getIdToken()
      const secRes = await getZoneSecurityLevel(token, orgId, zoneId)
      if (secRes.success && secRes.data?.value) {
        setSecurityLevel(secRes.data.value)
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setLoading(false)
    }
  }, [zoneId, orgId, getIdToken])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleUpdateSecurityLevel = async (level: any) => {
    if (!zoneId || !orgId) return
    setIsUpdatingSecurity(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSecurityLevel(token, orgId, zoneId, level)
      if (res.success) {
        setSecurityLevel(level)
        toast({
          title:
            level === "under_attack"
              ? "Emergency Shield Activated!"
              : "Security Level Updated",
          description:
            level === "under_attack"
              ? "All incoming visitors will now receive an interactive Cloudflare verification challenge."
              : `Edge DDoS defense set to ${level.toUpperCase().replace("_", " ")}.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: res.error || "Could not update security level.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message,
      })
    } finally {
      setIsUpdatingSecurity(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </Card>
        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Emergency Under Attack Shield */}
      <Card
        className={`border shadow-sm rounded-xl overflow-hidden transition-all ${
          securityLevel === "under_attack"
            ? "bg-red-50/70 border-red-300 ring-2 ring-red-500/30"
            : "bg-white border-slate-200/80"
        }`}
      >
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              &quot;I&apos;m Under Attack!&quot; Emergency Shield
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Mitigate aggressive Layer 7 HTTP floods in real time across the global edge network.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant={securityLevel === "under_attack" ? "destructive" : "default"}
              size="sm"
              onClick={() =>
                handleUpdateSecurityLevel(
                  securityLevel === "under_attack" ? "medium" : "under_attack"
                )
              }
              disabled={isUpdatingSecurity}
              className={`font-semibold text-xs h-9 px-4 rounded-lg shadow-xs transition-colors gap-1.5 ${
                securityLevel === "under_attack"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              }`}
            >
              {isUpdatingSecurity && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {securityLevel === "under_attack"
                  ? "Deactivate Emergency Shield"
                  : "Activate Emergency Shield"}
              </span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 text-xs text-slate-600 leading-relaxed">
          {securityLevel === "under_attack" ? (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-100/70 rounded-xl border border-red-300 text-red-900 font-medium">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-950">Active Layer 7 DDoS Mitigation Engaged</p>
                <p className="text-red-900/90 font-normal mt-0.5">
                  All traffic to {domain || "your domain"} is undergoing interactive edge verification. This suppresses flood attacks and scraper waves while keeping your origin online. Remember to deactivate this mode once the attack has passed so normal visitor latency is restored.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Use this panic button during sudden bot attacks, credential-stuffing surges, or Layer 7 HTTP floods. Deploys worldwide in under 5 seconds.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-black text-xs h-7 gap-1 ml-3 shrink-0 rounded-lg"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh Status</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Security Level Sensitivity */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              Standard Edge Security Level
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Adjust how aggressively Cloudflare reputation algorithms challenge suspicious IP addresses.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                key: "essentially_off",
                label: "Essentially Off",
                desc: "Challenges only the most obvious malicious automated attackers.",
              },
              {
                key: "low",
                label: "Low",
                desc: "Challenges IP addresses with recent threatening behavior in Cloudflare's IP intelligence database.",
              },
              {
                key: "medium",
                label: "Medium (Recommended)",
                desc: "Standard balanced protection recommended for production SaaS and customer-facing websites.",
              },
              {
                key: "high",
                label: "High",
                desc: "Challenges any IP address displaying suspicious behavior within the past 14 days.",
              },
            ].map((lvl) => (
              <button
                key={lvl.key}
                onClick={() => handleUpdateSecurityLevel(lvl.key)}
                disabled={isUpdatingSecurity}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  securityLevel === lvl.key
                    ? "border-amber-600 bg-amber-50/60 shadow-xs ring-1 ring-amber-600"
                    : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900">{lvl.label}</span>
                  {securityLevel === lvl.key && <Check className="w-3.5 h-3.5 text-amber-600" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">{lvl.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 3. Global DDoS Defense Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-5">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900">Layer 3 &amp; 4 DDoS Shield</p>
            <p className="text-[11px] text-slate-500 leading-normal">
              Always active. SYN floods, UDP amplification, and NTP reflection attacks are dropped at edge boundary.
            </p>
          </div>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-5">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900">Anycast 330+ Cities</p>
            <p className="text-[11px] text-slate-500 leading-normal">
              Distributed capacity absorbs 280+ Tbps of peak attack volume without degrading legitimate user traffic.
            </p>
          </div>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-5">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900">WAF Managed Rules</p>
            <p className="text-[11px] text-slate-500 leading-normal">
              Automated heuristics block SQL injection, cross-site scripting (XSS), and zero-day vulnerabilities.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
