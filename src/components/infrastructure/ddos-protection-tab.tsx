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
import { cn } from "@/lib/utils"

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
      // background fetch error
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
              ? "Emergency shield active"
              : "Security level updated",
          description:
            level === "under_attack"
              ? "All incoming traffic will receive an interactive verification challenge."
              : `Edge DDoS defense set to ${level.replace("_", " ")}.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: res.error || "Could not update security level.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message,
      })
    } finally {
      setIsUpdatingSecurity(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Card className="bg-white border-slate-200 shadow-none rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Emergency Under Attack Shield */}
      <Card
        className={cn(
          "bg-white border shadow-none rounded-xl overflow-hidden transition-colors",
          securityLevel === "under_attack" ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
        )}
      >
        <CardHeader className="p-6 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-semibold text-slate-900">
              Emergency attack shield
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Mitigate aggressive Layer 7 HTTP floods across the global edge network.
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
              className="h-9 px-4 text-xs font-medium rounded-lg shadow-none flex items-center gap-1.5"
            >
              {isUpdatingSecurity && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {securityLevel === "under_attack"
                  ? "Deactivate emergency shield"
                  : "Activate emergency shield"}
              </span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 text-xs text-slate-600 leading-relaxed">
          {securityLevel === "under_attack" ? (
            <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-950">Active Layer 7 DDoS mitigation engaged</p>
                <p className="text-amber-900/90 mt-0.5">
                  All traffic to {domain || "your domain"} is undergoing interactive edge verification. This suppresses flood attacks while keeping origin servers online. Deactivate once the surge subsides to restore normal latency.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                Deploy edge challenge gates during sudden bot attacks, credential stuffing, or Layer 7 floods.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="h-8 text-xs font-medium border-slate-200 rounded-lg flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                <span>Refresh</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Security Level Sensitivity */}
      <Card className="bg-white border-slate-200 shadow-none rounded-xl">
        <CardHeader className="p-6 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">
            Standard edge security level
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Adjust reputation heuristics applied to incoming visitor IP addresses.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                key: "essentially_off",
                label: "Essentially off",
                desc: "Challenges only obvious malicious automated threats.",
              },
              {
                key: "low",
                label: "Low",
                desc: "Challenges IP addresses exhibiting known abusive behavior.",
              },
              {
                key: "medium",
                label: "Medium (recommended)",
                desc: "Standard balanced protection for production web applications.",
              },
              {
                key: "high",
                label: "High",
                desc: "Challenges any IP address displaying suspicious activity recently.",
              },
            ].map((lvl) => (
              <button
                key={lvl.key}
                onClick={() => handleUpdateSecurityLevel(lvl.key)}
                disabled={isUpdatingSecurity}
                className={cn(
                  "p-3 rounded-lg border text-left transition-colors",
                  securityLevel === lvl.key
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-900">{lvl.label}</span>
                  {securityLevel === lvl.key && <Check className="w-3.5 h-3.5 text-slate-900" />}
                </div>
                <p className="text-xs text-slate-500 leading-normal">{lvl.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 3. Global DDoS Defense Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200 shadow-none rounded-xl p-5 space-y-1">
          <p className="text-xs font-semibold text-slate-900">Layer 3 &amp; 4 DDoS shield</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            SYN floods, UDP amplification, and NTP reflection attacks are dropped at the edge boundary.
          </p>
        </Card>

        <Card className="bg-white border-slate-200 shadow-none rounded-xl p-5 space-y-1">
          <p className="text-xs font-semibold text-slate-900">Anycast global network</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Capacity absorbs massive attack volumes across 330+ edge locations without degrading origin performance.
          </p>
        </Card>

        <Card className="bg-white border-slate-200 shadow-none rounded-xl p-5 space-y-1">
          <p className="text-xs font-semibold text-slate-900">Managed WAF heuristics</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Edge rules mitigate SQL injection, cross-site scripting (XSS), and common exploit payloads.
          </p>
        </Card>
      </div>
    </div>
  )
}
