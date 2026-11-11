"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Check,
  RefreshCw,
  Copy,
  CheckCheck,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import {
  getZoneSSLSettings,
  setZoneSSLSetting,
  getZoneDNSSEC,
  setZoneDNSSEC,
} from "@/app/actions/cloudflare-infrastructure"
import { cn } from "@/lib/utils"

interface SslEncryptionTabProps {
  zoneId?: string
  domain?: string
  orgId?: string
  getIdToken: () => Promise<string>
}

export function SslEncryptionTab({ zoneId, orgId, getIdToken }: SslEncryptionTabProps) {
  const [loading, setLoading] = useState(true)
  const [sslMode, setSslMode] = useState<string>("full")
  const [isUpdatingSSL, setIsUpdatingSSL] = useState(false)

  const [alwaysHttps, setAlwaysHttps] = useState(true)
  const [isUpdatingHttps, setIsUpdatingHttps] = useState(false)

  const [autoRewrites, setAutoRewrites] = useState(true)
  const [isUpdatingRewrites, setIsUpdatingRewrites] = useState(false)

  const [minTls, setMinTls] = useState<string>("1.2")

  const [dnssecStatus, setDnssecStatus] = useState<string>("disabled")
  const [dnssecData, setDnssecData] = useState<any>(null)
  const [isTogglingDnssec, setIsTogglingDnssec] = useState(false)
  const [copiedDs, setCopiedDs] = useState(false)

  const loadData = useCallback(async () => {
    if (!zoneId || !orgId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const token = await getIdToken()

      const sslRes = await getZoneSSLSettings(token, orgId, zoneId)
      if (sslRes.success && sslRes.data) {
        setSslMode(sslRes.data.ssl || "full")
        setAlwaysHttps(sslRes.data.alwaysUseHttps === "on")
        setAutoRewrites(sslRes.data.autoHttpsRewrites === "on")
        setMinTls(sslRes.data.minTlsVersion || "1.2")
      }

      const dnssecRes = await getZoneDNSSEC(token, orgId, zoneId)
      if (dnssecRes.success && dnssecRes.data) {
        setDnssecStatus(dnssecRes.data.status || "disabled")
        setDnssecData(dnssecRes.data)
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

  const handleUpdateSSLMode = async (mode: string) => {
    if (!zoneId || !orgId) return
    setIsUpdatingSSL(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, orgId, zoneId, "ssl", mode)
      if (res.success) {
        setSslMode(mode)
        toast({
          title: "SSL mode updated",
          description: `Edge encryption protocol set to ${mode.toUpperCase()}.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: res.error || "Could not update SSL mode.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message,
      })
    } finally {
      setIsUpdatingSSL(false)
    }
  }

  const handleToggleAlwaysHttps = async (enabled: boolean) => {
    if (!zoneId || !orgId) return
    setIsUpdatingHttps(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(
        token,
        orgId,
        zoneId,
        "always_use_https",
        enabled ? "on" : "off"
      )
      if (res.success) {
        setAlwaysHttps(enabled)
        toast({
          title: "Always Use HTTPS",
          description: enabled
            ? "HTTP traffic will automatically redirect to HTTPS."
            : "HTTPS enforcement disabled.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: res.error,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message,
      })
    } finally {
      setIsUpdatingHttps(false)
    }
  }

  const handleToggleAutoRewrites = async (enabled: boolean) => {
    if (!zoneId || !orgId) return
    setIsUpdatingRewrites(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(
        token,
        orgId,
        zoneId,
        "automatic_https_rewrites",
        enabled ? "on" : "off"
      )
      if (res.success) {
        setAutoRewrites(enabled)
        toast({
          title: "Automatic HTTPS rewrites",
          description: enabled ? "Enabled" : "Disabled",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: res.error,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message,
      })
    } finally {
      setIsUpdatingRewrites(false)
    }
  }

  const handleUpdateMinTLS = async (version: string) => {
    if (!zoneId || !orgId) return
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, orgId, zoneId, "min_tls_version", version)
      if (res.success) {
        setMinTls(version)
        toast({
          title: "Minimum TLS version updated",
          description: `Connections older than TLS ${version} are rejected.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: res.error,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message,
      })
    }
  }

  const handleToggleDNSSEC = async () => {
    if (!zoneId || !orgId) return
    setIsTogglingDnssec(true)
    const nextStatus = dnssecStatus === "active" ? "disabled" : "active"
    try {
      const token = await getIdToken()
      const res = await setZoneDNSSEC(token, orgId, zoneId, nextStatus)
      if (res.success) {
        setDnssecStatus(nextStatus)
        if (res.data) setDnssecData(res.data)
        toast({
          title: "DNSSEC updated",
          description: nextStatus === "active" ? "DNSSEC enabled." : "DNSSEC disabled.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "DNSSEC update failed",
          description: res.error,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "DNSSEC update failed",
        description: err.message,
      })
    } finally {
      setIsTogglingDnssec(false)
    }
  }

  const copyDsRecord = () => {
    if (dnssecData?.ds) {
      navigator.clipboard.writeText(dnssecData.ds)
      setCopiedDs(true)
      toast({ title: "Copied DS record", description: "Copied to clipboard." })
      setTimeout(() => setCopiedDs(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Card className="bg-white border-slate-200 shadow-none rounded-xl p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. SSL/TLS Encryption Mode */}
      <Card className="bg-white border-slate-200 shadow-none rounded-xl">
        <CardHeader className="p-6 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-semibold text-slate-900">
              SSL/TLS encryption mode
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Controls cryptographic encryption between browsers, Cloudflare edge POPs, and your backend origin.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs font-medium border-slate-200 rounded-lg flex items-center gap-1.5"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            <span>Refresh</span>
          </Button>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                key: "off",
                label: "Off",
                desc: "No encryption. Plain HTTP.",
              },
              {
                key: "flexible",
                label: "Flexible",
                desc: "HTTPS to edge; HTTP to origin.",
              },
              {
                key: "full",
                label: "Full",
                desc: "End-to-end encryption. Accepts self-signed origin certs.",
              },
              {
                key: "strict",
                label: "Full (strict)",
                desc: "End-to-end verified encryption. Requires valid CA certificate.",
              },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleUpdateSSLMode(opt.key)}
                disabled={isUpdatingSSL}
                className={cn(
                  "p-3 rounded-lg border text-left transition-colors",
                  sslMode === opt.key
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-900">{opt.label}</span>
                  {sslMode === opt.key && <Check className="w-3.5 h-3.5 text-slate-900" />}
                </div>
                <p className="text-xs text-slate-500 leading-normal">{opt.desc}</p>
              </button>
            ))}
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 leading-relaxed">
            <span className="font-medium text-slate-900">Recommended configuration:</span> Use{" "}
            <span className="font-medium text-slate-900">Full (strict)</span> when deploying on Vercel, Render, Railway, or AWS to prevent redirect loops and invalid certificate errors.
          </div>
        </CardContent>
      </Card>

      {/* 2. HTTPS & TLS Protocol Settings */}
      <Card className="bg-white border-slate-200 shadow-none rounded-xl">
        <CardHeader className="p-6 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">
            HTTPS and TLS parameters
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Transport security policies enforced at the edge.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 divide-y divide-slate-100 space-y-4">
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-900">Always use HTTPS</p>
              <p className="text-xs text-slate-500">Redirect all HTTP requests to HTTPS with 301 responses.</p>
            </div>
            <Switch
              checked={alwaysHttps}
              onCheckedChange={handleToggleAlwaysHttps}
              disabled={isUpdatingHttps}
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-900">Automatic HTTPS rewrites</p>
              <p className="text-xs text-slate-500">Rewrite mixed-content resources from HTTP to HTTPS.</p>
            </div>
            <Switch
              checked={autoRewrites}
              onCheckedChange={handleToggleAutoRewrites}
              disabled={isUpdatingRewrites}
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-900">Minimum TLS version</p>
              <p className="text-xs text-slate-500">Enforce modern cipher suites and protocol versions.</p>
            </div>
            <Select value={minTls} onValueChange={handleUpdateMinTLS}>
              <SelectTrigger className="h-8 w-28 text-xs border-slate-200 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg">
                <SelectItem value="1.0" className="text-xs">TLS 1.0</SelectItem>
                <SelectItem value="1.1" className="text-xs">TLS 1.1</SelectItem>
                <SelectItem value="1.2" className="text-xs">TLS 1.2</SelectItem>
                <SelectItem value="1.3" className="text-xs">TLS 1.3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 3. DNSSEC */}
      <Card className="bg-white border-slate-200 shadow-none rounded-xl">
        <CardHeader className="p-6 border-b border-slate-100 flex flex-row items-center justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-semibold text-slate-900">
              DNSSEC cryptographic signing
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Protects against DNS cache poisoning and spoofing by signing zone records.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleDNSSEC}
            disabled={isTogglingDnssec}
            className="h-8 text-xs font-medium border-slate-200 rounded-lg"
          >
            {dnssecStatus === "active" ? "Disable DNSSEC" : "Enable DNSSEC"}
          </Button>
        </CardHeader>
        <CardContent className="p-6">
          {dnssecStatus === "active" && dnssecData?.ds ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Delegation Signer (DS) record</p>
              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <code className="text-xs font-mono text-slate-800 break-all flex-1">
                  {dnssecData.ds}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-slate-900 shrink-0"
                  onClick={copyDsRecord}
                >
                  {copiedDs ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              DNSSEC is currently disabled for this domain zone.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
