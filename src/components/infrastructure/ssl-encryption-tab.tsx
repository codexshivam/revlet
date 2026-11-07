"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Check,
  Info,
  Loader2,
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

interface SslEncryptionTabProps {
  zoneId?: string
  domain?: string
  orgId?: string
  getIdToken: () => Promise<string>
}

export function SslEncryptionTab({ zoneId, domain, orgId, getIdToken }: SslEncryptionTabProps) {
  const [loading, setLoading] = useState(false)
  const [sslMode, setSslMode] = useState<string>("full")
  const [isUpdatingSSL, setIsUpdatingSSL] = useState(false)

  const [alwaysHttps, setAlwaysHttps] = useState(true)
  const [isUpdatingHttps, setIsUpdatingHttps] = useState(false)

  const [autoRewrites, setAutoRewrites] = useState(true)
  const [isUpdatingRewrites, setIsUpdatingRewrites] = useState(false)

  const [minTls, setMinTls] = useState<string>("1.2")
  const [isUpdatingTls, setIsUpdatingTls] = useState(false)

  const [dnssecStatus, setDnssecStatus] = useState<string>("disabled")
  const [dnssecData, setDnssecData] = useState<any>(null)
  const [isTogglingDnssec, setIsTogglingDnssec] = useState(false)
  const [copiedDs, setCopiedDs] = useState(false)

  const loadData = useCallback(async () => {
    if (!zoneId || !orgId) return
    setLoading(true)
    try {
      const token = await getIdToken()

      // 1. SSL Settings
      const sslRes = await getZoneSSLSettings(token, orgId, zoneId)
      if (sslRes.success && sslRes.data) {
        setSslMode(sslRes.data.ssl || "full")
        setAlwaysHttps(sslRes.data.alwaysUseHttps === "on")
        setAutoRewrites(sslRes.data.autoHttpsRewrites === "on")
        setMinTls(sslRes.data.minTlsVersion || "1.2")
      }

      // 2. DNSSEC Status
      const dnssecRes = await getZoneDNSSEC(token, orgId, zoneId)
      if (dnssecRes.success && dnssecRes.data) {
        setDnssecStatus(dnssecRes.data.status || "disabled")
        setDnssecData(dnssecRes.data)
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

  const handleUpdateSSLMode = async (mode: string) => {
    if (!zoneId || !orgId) return
    setIsUpdatingSSL(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, orgId, zoneId, "ssl", mode)
      if (res.success) {
        setSslMode(mode)
        toast({
          title: "SSL/TLS Mode Updated",
          description: `Edge encryption protocol set to ${mode.toUpperCase()}.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: res.error || "Could not update SSL mode.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
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
            ? "HTTP traffic will now automatically 301-redirect to HTTPS."
            : "HTTPS enforcement disabled.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: res.error,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
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
          title: "Automatic HTTPS Rewrites",
          description: enabled
            ? "Mixed content links will be rewritten to secure HTTPS automatically."
            : "Automatic rewrites disabled.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: res.error,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message,
      })
    } finally {
      setIsUpdatingRewrites(false)
    }
  }

  const handleUpdateMinTLS = async (version: string) => {
    if (!zoneId || !orgId) return
    setIsUpdatingTls(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, orgId, zoneId, "min_tls_version", version)
      if (res.success) {
        setMinTls(version)
        toast({
          title: "Minimum TLS Version Updated",
          description: `Connections older than TLS ${version} will now be rejected.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: res.error,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message,
      })
    } finally {
      setIsUpdatingTls(false)
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
          title: "DNSSEC Status Changed",
          description:
            nextStatus === "active"
              ? "DNSSEC activated on domain."
              : "DNSSEC cryptographic signing disabled.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "DNSSEC Update Failed",
          description: res.error,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "DNSSEC Update Failed",
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
      toast({ title: "Copied DS Record", description: "Copied to clipboard." })
      setTimeout(() => setCopiedDs(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. SSL/TLS Encryption Mode */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              SSL/TLS Encryption Mode
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Controls end-to-end cryptographic encryption between user browsers, Cloudflare edge, and your backend origin.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-black text-xs h-8 gap-1.5 rounded-lg"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                key: "off",
                label: "Off",
                desc: "No encryption. Traffic is transmitted over insecure plain HTTP.",
              },
              {
                key: "flexible",
                label: "Flexible",
                desc: "Browser to edge is encrypted HTTPS; edge to origin connects over plain HTTP.",
              },
              {
                key: "full",
                label: "Full",
                desc: "End-to-end encryption. Allows self-signed or wildcard origin SSL certificates.",
              },
              {
                key: "strict",
                label: "Full (Strict)",
                desc: "End-to-end verified encryption. Requires a valid CA certificate on origin.",
              },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleUpdateSSLMode(opt.key)}
                disabled={isUpdatingSSL}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  sslMode === opt.key
                    ? "border-emerald-600 bg-emerald-50/60 shadow-xs ring-1 ring-emerald-600"
                    : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900">{opt.label}</span>
                  {sslMode === opt.key && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">{opt.desc}</p>
              </button>
            ))}
          </div>

          <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/70 rounded-xl border border-blue-200/80 text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-blue-900">Recommended configuration for modern web apps</p>
              <p className="text-xs text-blue-800 leading-relaxed font-normal">
                Use <strong>Full (Strict)</strong> whenever your backend is hosted on Vercel, Supabase, Render, Railway, or AWS.
                This eliminates the common &quot;ERR_TOO_MANY_REDIRECTS&quot; loop and 521 origin down errors.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. HTTPS Enforcement & Security Protocols */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">
            HTTPS Enforcement &amp; Protocols
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Force cryptographic transport across all endpoints and block obsolete SSL ciphers.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 divide-y divide-slate-100 space-y-4">
          {/* Always Use HTTPS */}
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5 pr-4">
              <p className="text-xs font-semibold text-slate-800">Always Use HTTPS</p>
              <p className="text-[11px] text-slate-500">
                Redirects all unencrypted <code>http://{domain || "domain.com"}</code> requests to secure <code>https://</code> with a 301 permanent redirect.
              </p>
            </div>
            <Switch
              checked={alwaysHttps}
              onCheckedChange={handleToggleAlwaysHttps}
              disabled={isUpdatingHttps}
            />
          </div>

          {/* Automatic HTTPS Rewrites */}
          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5 pr-4">
              <p className="text-xs font-semibold text-slate-800">Automatic HTTPS Rewrites</p>
              <p className="text-[11px] text-slate-500">
                Eliminates browser &quot;mixed-content&quot; warnings by rewriting embedded image and script URLs from HTTP to HTTPS dynamically on the edge.
              </p>
            </div>
            <Switch
              checked={autoRewrites}
              onCheckedChange={handleToggleAutoRewrites}
              disabled={isUpdatingRewrites}
            />
          </div>

          {/* Minimum TLS Version */}
          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5 pr-4">
              <p className="text-xs font-semibold text-slate-800">Minimum TLS Version</p>
              <p className="text-[11px] text-slate-500">
                Enforce modern TLS 1.2 or modern TLS 1.3 cryptographic protocols, blocking outdated and vulnerable TLS 1.0/1.1 connections.
              </p>
            </div>
            <Select
              value={minTls}
              onValueChange={handleUpdateMinTLS}
              disabled={isUpdatingTls}
            >
              <SelectTrigger className="w-32 h-8 text-xs border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1.2">TLS 1.2</SelectItem>
                <SelectItem value="1.3">TLS 1.3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 3. DNSSEC (Domain Name System Security Extensions) */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              DNSSEC (Domain Security Extensions)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Cryptographically signs DNS lookups to prevent DNS spoofing, hijacking, and cache poisoning.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant={dnssecStatus === "active" ? "outline" : "default"}
              size="sm"
              onClick={handleToggleDNSSEC}
              disabled={isTogglingDnssec}
              className={`text-xs h-8 rounded-lg gap-1.5 ${
                dnssecStatus === "active"
                  ? "border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-black"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {isTogglingDnssec && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{dnssecStatus === "active" ? "Disable DNSSEC" : "Enable DNSSEC"}</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-3 text-xs text-slate-600">
          {dnssecStatus === "active" && dnssecData?.ds ? (
            <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800 text-xs">Registrar Delegation Signer (DS) Record</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyDsRecord}
                  className="h-7 px-2 text-xs text-slate-600 hover:bg-slate-200 hover:text-black gap-1"
                >
                  {copiedDs ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedDs ? "Copied" : "Copy DS"}</span>
                </Button>
              </div>
              <p className="font-mono text-[11px] text-slate-700 break-all bg-white p-2 rounded border border-slate-200">
                {dnssecData.ds}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-slate-500">
                {dnssecData.key_tag && <div>Key Tag: <span className="font-bold text-slate-700">{dnssecData.key_tag}</span></div>}
                {dnssecData.algorithm && <div>Algorithm: <span className="font-bold text-slate-700">{dnssecData.algorithm}</span></div>}
                {dnssecData.digest_type && <div>Digest Type: <span className="font-bold text-slate-700">{dnssecData.digest_type}</span></div>}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              When enabled, Cloudflare generates cryptographic signatures for your DNS records. To finish setup, add the DS record shown above to your domain registrar (e.g., Namecheap, GoDaddy, Google Domains).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
