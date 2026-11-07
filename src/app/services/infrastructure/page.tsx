"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Server,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Cpu,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Lock,
  Globe,
  Info,
  Check,
  Sparkles,
  ArrowUpRight,
  Shield,
  CornerDownRight,
} from "lucide-react"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useAuth } from "@/firebase"
import { toast } from "@/hooks/use-toast"
import {
  purgeZoneCache,
  getZoneDevelopmentMode,
  setZoneDevelopmentMode,
  getZoneSpeedSettings,
  updateZoneSpeedSetting,
  getZoneSSLSettings,
  setZoneSSLSetting,
  getZoneDNSSEC,
  setZoneDNSSEC,
  getZoneSecurityLevel,
  setZoneSecurityLevel,
  getAccountWorkers,
} from "@/app/actions/cloudflare-infrastructure"

const CF_ACCOUNT_ID = "7f4b97a2565849ad980c9401fb2fc427"

export default function InfrastructurePage() {
  const { activeOrg } = useActiveOrg()
  const auth = useAuth()

  const zoneId = activeOrg?.cloudflareZoneId
  const domain = activeOrg?.domain

  // Tab State: speed | ssl | security | hosting
  const [activeTab, setActiveTab] = useState("speed")
  const [loading, setLoading] = useState(false)
  const [permissionWarning, setPermissionWarning] = useState<string | null>(null)

  // Speed & Cache State
  const [isPurging, setIsPurging] = useState(false)
  const [devMode, setDevMode] = useState(false)
  const [isUpdatingDevMode, setIsUpdatingDevMode] = useState(false)
  const [brotli, setBrotli] = useState(true)
  const [earlyHints, setEarlyHints] = useState(false)

  // SSL State
  const [sslMode, setSslMode] = useState<string>("full")
  const [alwaysHttps, setAlwaysHttps] = useState(true)
  const [autoRewrites, setAutoRewrites] = useState(true)
  const [minTls, setMinTls] = useState("1.2")
  const [dnssecStatus, setDnssecStatus] = useState<string>("disabled")
  const [isUpdatingSSL, setIsUpdatingSSL] = useState(false)

  // DDoS / Security Level State
  const [securityLevel, setSecurityLevel] = useState("medium")
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false)

  // Workers / Hosting State
  const [workers, setWorkers] = useState<any[]>([])

  const getIdToken = useCallback(async () => {
    if (!auth?.currentUser) throw new Error("Authentication required")
    return await auth.currentUser.getIdToken()
  }, [auth])

  // Load Domain Edge Settings
  const loadInfrastructureData = useCallback(async () => {
    if (!activeOrg?.id) return
    setLoading(true)

    try {
      const token = await getIdToken()

      // 1. Load Workers for domain hosting overview
      const workersRes = await getAccountWorkers(token, activeOrg.id)
      if (workersRes.success) {
        setWorkers(workersRes.data || [])
      }

      // 2. Load Zone Edge Settings
      if (zoneId) {
        const [devRes, speedRes, sslRes, dnssecRes, secRes] = await Promise.allSettled([
          getZoneDevelopmentMode(token, activeOrg.id, zoneId),
          getZoneSpeedSettings(token, activeOrg.id, zoneId),
          getZoneSSLSettings(token, activeOrg.id, zoneId),
          getZoneDNSSEC(token, activeOrg.id, zoneId),
          getZoneSecurityLevel(token, activeOrg.id, zoneId),
        ])

        if (devRes.status === "fulfilled" && devRes.value.success && devRes.value.data?.value !== undefined) {
          setDevMode(devRes.value.data.value === "on")
        }
        if (speedRes.status === "fulfilled" && speedRes.value.success && speedRes.value.data) {
          setBrotli(speedRes.value.data.brotli === "on")
          setEarlyHints(speedRes.value.data.earlyHints === "on")
        }
        if (sslRes.status === "fulfilled" && sslRes.value.success && sslRes.value.data) {
          setSslMode(sslRes.value.data.ssl || "full")
          setAlwaysHttps(sslRes.value.data.alwaysUseHttps === "on")
          setAutoRewrites(sslRes.value.data.autoHttpsRewrites === "on")
          setMinTls(sslRes.value.data.minTlsVersion || "1.2")
        }
        if (dnssecRes.status === "fulfilled" && dnssecRes.value.success && dnssecRes.value.data) {
          setDnssecStatus(dnssecRes.value.data.status || "disabled")
        }
        if (secRes.status === "fulfilled" && secRes.value.success && secRes.value.data) {
          setSecurityLevel(secRes.value.data.value || "medium")
        }

        // Check permission warning
        if (
          sslRes.status === "fulfilled" &&
          !sslRes.value.success &&
          (sslRes.value.error?.includes("permission") ||
            sslRes.value.error?.includes("Unauthorized") ||
            sslRes.value.error?.includes("Authentication failed"))
        ) {
          setPermissionWarning(
            "Your Cloudflare API token currently has DNS access only. To toggle Cache Purge and SSL modes directly from Revlet, add 'Zone Settings: Edit' and 'Cache Purge: Purge' to your token in Cloudflare."
          )
        } else {
          setPermissionWarning(null)
        }
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setLoading(false)
    }
  }, [zoneId, activeOrg?.id, getIdToken])

  useEffect(() => {
    if (activeOrg?.id) {
      loadInfrastructureData()
    }
  }, [activeOrg?.id, loadInfrastructureData])

  // Handlers for Speed & Cache
  const handlePurgeCache = async () => {
    if (!zoneId || !activeOrg?.id) return
    setIsPurging(true)
    try {
      const token = await getIdToken()
      const res = await purgeZoneCache(token, activeOrg.id, zoneId, true)
      if (res.success) {
        toast({
          title: "Edge Cache Purged",
          description: "All assets cached at global edge nodes have been cleared.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Purge Failed",
          description: res.error || "Could not purge cache.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Purge Failed",
        description: err.message,
      })
    } finally {
      setIsPurging(false)
    }
  }

  const handleToggleDevMode = async (enabled: boolean) => {
    if (!zoneId || !activeOrg?.id) return
    setIsUpdatingDevMode(true)
    try {
      const token = await getIdToken()
      const res = await setZoneDevelopmentMode(token, activeOrg.id, zoneId, enabled ? "on" : "off")
      if (res.success) {
        setDevMode(enabled)
        toast({
          title: enabled ? "Development Mode Active" : "Development Mode Off",
          description: enabled
            ? "Edge caching is temporarily bypassed for the next 3 hours."
            : "Normal edge caching restored.",
        })
      } else {
        toast({ variant: "destructive", title: "Update Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message })
    } finally {
      setIsUpdatingDevMode(false)
    }
  }

  const handleToggleBrotli = async (enabled: boolean) => {
    if (!zoneId || !activeOrg?.id) return
    try {
      const token = await getIdToken()
      const res = await updateZoneSpeedSetting(token, activeOrg.id, zoneId, "brotli", enabled ? "on" : "off")
      if (res.success) {
        setBrotli(enabled)
        toast({ title: "Brotli Compression Updated", description: enabled ? "Enabled" : "Disabled" })
      }
    } catch {
      toast({ variant: "destructive", title: "Update Failed", description: "Could not toggle Brotli." })
    }
  }

  const handleToggleEarlyHints = async (enabled: boolean) => {
    if (!zoneId || !activeOrg?.id) return
    try {
      const token = await getIdToken()
      const res = await updateZoneSpeedSetting(token, activeOrg.id, zoneId, "early_hints", enabled ? "on" : "off")
      if (res.success) {
        setEarlyHints(enabled)
        toast({ title: "Early Hints (HTTP 103) Updated", description: enabled ? "Enabled" : "Disabled" })
      }
    } catch {
      toast({ variant: "destructive", title: "Update Failed", description: "Could not toggle Early Hints." })
    }
  }

  // Handlers for SSL & Encryption
  const handleUpdateSSLMode = async (mode: string) => {
    if (!zoneId || !activeOrg?.id) return
    setIsUpdatingSSL(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, activeOrg.id, zoneId, "ssl", mode)
      if (res.success) {
        setSslMode(mode)
        toast({ title: "SSL/TLS Mode Updated", description: `Encryption set to ${mode.toUpperCase()}.` })
      } else {
        toast({ variant: "destructive", title: "Update Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message })
    } finally {
      setIsUpdatingSSL(false)
    }
  }

  const handleToggleAlwaysHttps = async (enabled: boolean) => {
    if (!zoneId || !activeOrg?.id) return
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, activeOrg.id, zoneId, "always_use_https", enabled ? "on" : "off")
      if (res.success) {
        setAlwaysHttps(enabled)
        toast({ title: "Always Use HTTPS", description: enabled ? "Enabled" : "Disabled" })
      }
    } catch {
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update HTTPS enforcement." })
    }
  }

  const handleToggleAutoRewrites = async (enabled: boolean) => {
    if (!zoneId || !activeOrg?.id) return
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, activeOrg.id, zoneId, "automatic_https_rewrites", enabled ? "on" : "off")
      if (res.success) {
        setAutoRewrites(enabled)
        toast({ title: "Automatic HTTPS Rewrites", description: enabled ? "Enabled" : "Disabled" })
      }
    } catch {
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update rewrites." })
    }
  }

  const handleUpdateMinTLS = async (version: string) => {
    if (!zoneId || !activeOrg?.id) return
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, activeOrg.id, zoneId, "min_tls_version", version)
      if (res.success) {
        setMinTls(version)
        toast({ title: "Minimum TLS Version", description: `Updated to TLS ${version}` })
      }
    } catch {
      toast({ variant: "destructive", title: "Update Failed", description: "Could not set minimum TLS." })
    }
  }

  const handleToggleDNSSEC = async () => {
    if (!zoneId || !activeOrg?.id) return
    const nextStatus = dnssecStatus === "active" ? "disabled" : "active"
    try {
      const token = await getIdToken()
      const res = await setZoneDNSSEC(token, activeOrg.id, zoneId, nextStatus)
      if (res.success) {
        setDnssecStatus(nextStatus)
        toast({
          title: "DNSSEC Status Changed",
          description: nextStatus === "active" ? "DNSSEC activated on domain." : "DNSSEC disabled.",
        })
      }
    } catch {
      toast({ variant: "destructive", title: "DNSSEC Failed", description: "Could not toggle DNSSEC." })
    }
  }

  // Handlers for DDoS & Protection
  const handleUpdateSecurityLevel = async (level: any) => {
    if (!zoneId || !activeOrg?.id) return
    setIsUpdatingSecurity(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSecurityLevel(token, activeOrg.id, zoneId, level)
      if (res.success) {
        setSecurityLevel(level)
        toast({
          title: level === "under_attack" ? "I'm Under Attack Mode Activated!" : "Security Level Updated",
          description: level === "under_attack"
            ? "Interactive verification challenges deployed to all incoming visitors."
            : `Protection level set to ${level.toUpperCase()}.`,
        })
      } else {
        toast({ variant: "destructive", title: "Update Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message })
    } finally {
      setIsUpdatingSecurity(false)
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300 max-w-5xl mx-auto">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-slate-900 text-white">
                <Server className="w-4 h-4" />
              </span>
              <h1 className="text-2xl sm:text-3xl font-headline font-bold text-slate-900 tracking-tight">
                Infrastructure
              </h1>
              {domain && (
                <Badge variant="outline" className="ml-2 font-mono text-[11px] font-medium bg-slate-50 border-slate-200 text-slate-700">
                  {domain}
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-normal">
              Essential domain controls: Edge cache purge, SSL/TLS encryption, DDoS emergency defense, and serverless hosting.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadInfrastructureData}
              disabled={loading}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 gap-1.5 rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Edge</span>
            </Button>
            <a
              href={`https://dash.cloudflare.com/${CF_ACCOUNT_ID}/home`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 gap-1.5 rounded-lg"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>Cloudflare Console</span>
              </Button>
            </a>
          </div>
        </div>

        {/* Token Permissions Notice (if any) */}
        {permissionWarning && (
          <div className="flex items-start gap-3 p-4 bg-amber-50/90 rounded-xl border border-amber-200/80 text-amber-900 animate-in fade-in shadow-xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-950">Cloudflare Token Permissions Notice</p>
              <p className="text-xs text-amber-900/90 leading-relaxed font-normal">
                {permissionWarning}
              </p>
              <div className="flex flex-wrap gap-2 pt-1.5">
                <Badge variant="outline" className="text-[10px] bg-white border-amber-300 font-mono text-amber-950">
                  Zone &gt; Zone Settings &gt; Edit
                </Badge>
                <Badge variant="outline" className="text-[10px] bg-white border-amber-300 font-mono text-amber-950">
                  Zone &gt; Cache Purge &gt; Purge
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* The 4 Essential Domain Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100/90 p-1 rounded-xl grid grid-cols-2 sm:grid-cols-4 w-full h-auto gap-1 border border-slate-200/60">
            <TabsTrigger value="speed" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Speed &amp; Cache</span>
            </TabsTrigger>
            <TabsTrigger value="ssl" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>SSL &amp; Encryption</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
              <span>DDoS &amp; Protection</span>
            </TabsTrigger>
            <TabsTrigger value="hosting" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              <span>Edge Hosting &amp; Workers</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SPEED & EDGE CACHE */}
          <TabsContent value="speed" className="space-y-6">
            
            {/* Purge Everything Card */}
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>Instant Edge Cache Purge</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      Flush all cached HTML, CSS, JavaScript, and static assets from Cloudflare edge nodes worldwide.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handlePurgeCache}
                    disabled={isPurging}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-9 px-4 rounded-lg shadow-xs shrink-0"
                  >
                    {isPurging ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
                    Purge Everything
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 text-xs text-slate-500 leading-relaxed">
                Use this immediately after deploying code updates so all visitors across the world see your latest release in real-time.
              </CardContent>
            </Card>

            {/* Development Mode Toggle */}
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-row items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>Development Mode (Bypass Cache)</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Temporarily bypass edge caching for 3 hours so changes to your origin server appear instantly.
                  </CardDescription>
                </div>
                <Switch
                  checked={devMode}
                  onCheckedChange={handleToggleDevMode}
                  disabled={isUpdatingDevMode}
                />
              </CardHeader>
              <CardContent className="p-5 sm:p-6 text-xs text-slate-500">
                Status: <span className="font-semibold text-slate-800">{devMode ? "Active (Cache Bypassed)" : "Inactive (Normal Edge Caching)"}</span>
              </CardContent>
            </Card>

            {/* Edge Speed Optimizations */}
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900">Performance, Compression &amp; Redirects</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Cloudflare edge delivery optimizations to minimize latency and speed up page load times.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 divide-y divide-slate-100 space-y-4">
                <div className="flex items-center justify-between pt-1">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">Brotli Compression</p>
                    <p className="text-[11px] text-slate-500">Compress text assets using modern Brotli algorithm for faster delivery.</p>
                  </div>
                  <Switch checked={brotli} onCheckedChange={handleToggleBrotli} />
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">Early Hints (HTTP 103)</p>
                    <p className="text-[11px] text-slate-500">Allows browsers to preload critical CSS and fonts before main response arrives.</p>
                  </div>
                  <Switch checked={earlyHints} onCheckedChange={handleToggleEarlyHints} />
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">Apex to WWW Redirects</p>
                    <p className="text-[11px] text-slate-500">Ensure root domain ({domain}) seamlessly 301-redirects to www.{domain} (or vice-versa).</p>
                  </div>
                  <a
                    href={`https://dash.cloudflare.com/${CF_ACCOUNT_ID}/bulk-redirects`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                      <span>Redirect Rules</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          {/* TAB 2: SSL & ENCRYPTION */}
          <TabsContent value="ssl" className="space-y-6">
            
            {/* SSL/TLS Encryption Mode */}
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  <span>SSL/TLS Encryption Mode</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Controls how traffic is encrypted between browsers, Cloudflare edge, and your origin server.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {[
                    { key: "off", label: "Off", desc: "No encryption (Insecure)" },
                    { key: "flexible", label: "Flexible", desc: "Browser to edge encrypted, edge to origin plain HTTP" },
                    { key: "full", label: "Full", desc: "End-to-end encryption (self-signed cert allowed)" },
                    { key: "strict", label: "Full (Strict)", desc: "End-to-end verified certificate (Recommended)" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleUpdateSSLMode(opt.key)}
                      disabled={isUpdatingSSL}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        sslMode === opt.key
                          ? "border-emerald-600 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-600"
                          : "border-slate-200 hover:border-slate-300 bg-white"
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

                <div className="flex items-start gap-2.5 p-3 bg-blue-50/60 rounded-lg border border-blue-100 text-blue-900 mt-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800 leading-relaxed font-normal">
                    <span className="font-semibold">Developer Tip:</span> Setting SSL to <strong>Full (Strict)</strong> prevents the common Cloudflare &quot;Too many redirects&quot; loop and 521 Origin Down errors.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* HTTPS Enforcement & DNSSEC */}
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900">HTTPS Enforcement &amp; DNSSEC</CardTitle>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 divide-y divide-slate-100 space-y-4">
                <div className="flex items-center justify-between pt-1">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">Always Use HTTPS</p>
                    <p className="text-[11px] text-slate-500">Redirect all insecure HTTP requests to secure HTTPS automatically.</p>
                  </div>
                  <Switch checked={alwaysHttps} onCheckedChange={handleToggleAlwaysHttps} />
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">Automatic HTTPS Rewrites</p>
                    <p className="text-[11px] text-slate-500">Fix mixed-content warnings by rewriting insecure HTTP resources to HTTPS.</p>
                  </div>
                  <Switch checked={autoRewrites} onCheckedChange={handleToggleAutoRewrites} />
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">Minimum TLS Version</p>
                    <p className="text-[11px] text-slate-500">Enforce TLS 1.2 or modern TLS 1.3 cryptographic protocols.</p>
                  </div>
                  <Select value={minTls} onValueChange={handleUpdateMinTLS}>
                    <SelectTrigger className="w-32 h-8 text-xs border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1.2">TLS 1.2</SelectItem>
                      <SelectItem value="1.3">TLS 1.3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">DNSSEC Protection</p>
                    <p className="text-[11px] text-slate-500">Cryptographically signs DNS lookups to prevent spoofing and cache poisoning.</p>
                  </div>
                  <Button
                    variant={dnssecStatus === "active" ? "outline" : "default"}
                    size="sm"
                    onClick={handleToggleDNSSEC}
                    className="text-xs h-8"
                  >
                    {dnssecStatus === "active" ? "DNSSEC Active" : "Enable DNSSEC"}
                  </Button>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          {/* TAB 3: DDOS & THREAT DEFENSE */}
          <TabsContent value="security" className="space-y-6">
            
            {/* Emergency Under Attack Mode */}
            <Card className={`border shadow-sm rounded-xl overflow-hidden transition-colors ${
              securityLevel === "under_attack" ? "bg-red-50/50 border-red-300" : "bg-white border-slate-200/80"
            }`}>
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-red-600" />
                    <span>&quot;I&apos;m Under Attack!&quot; Emergency Shield</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Instantly deploys interactive JavaScript challenges to all visitors to stop DDoS floods, scrapers, and bot attacks.
                  </CardDescription>
                </div>
                <Button
                  variant={securityLevel === "under_attack" ? "destructive" : "outline"}
                  onClick={() => handleUpdateSecurityLevel(securityLevel === "under_attack" ? "medium" : "under_attack")}
                  disabled={isUpdatingSecurity}
                  className="font-bold text-xs h-9 px-4 rounded-lg shrink-0 gap-2"
                >
                  {isUpdatingSecurity && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {securityLevel === "under_attack" ? "Deactivate Emergency Shield" : "Activate Under Attack Mode"}
                </Button>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 text-xs text-slate-600 leading-relaxed">
                {securityLevel === "under_attack" ? (
                  <div className="flex items-center gap-2 text-red-700 font-semibold">
                    <AlertCircle className="w-4 h-4" />
                    <span>Shield Active: All inbound traffic is being verified by Cloudflare before reaching your server.</span>
                  </div>
                ) : (
                  <span>Use this emergency toggle when experiencing sudden traffic surges, bot credential attacks, or launch-day DDoS attacks.</span>
                )}
              </CardContent>
            </Card>

            {/* Standard Security Level */}
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  <span>Security Level Sensitivity</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Adjust how aggressively Cloudflare challenges suspicious IP addresses.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {[
                    { key: "essentially_off", label: "Essentially Off", desc: "Only challenges the most obvious bad threats." },
                    { key: "low", label: "Low", desc: "Challenges IP addresses with recent threatening behavior." },
                    { key: "medium", label: "Medium", desc: "Standard protection recommended for most websites." },
                    { key: "high", label: "High", desc: "Aggressive challenge for suspicious visitor sessions." },
                  ].map((lvl) => (
                    <button
                      key={lvl.key}
                      onClick={() => handleUpdateSecurityLevel(lvl.key)}
                      disabled={isUpdatingSecurity}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        securityLevel === lvl.key
                          ? "border-amber-600 bg-amber-50/50 shadow-xs ring-1 ring-amber-600"
                          : "border-slate-200 hover:border-slate-300 bg-white"
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

            {/* Turnstile Bot Protection */}
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <span>Cloudflare Turnstile (CAPTCHA Alternative)</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Invisible, privacy-friendly bot challenge protecting login and signup forms without annoying user puzzles.
                  </CardDescription>
                </div>
                <a
                  href={`https://dash.cloudflare.com/${CF_ACCOUNT_ID}/turnstile`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-xs h-9 gap-1.5 rounded-lg border-slate-200 hover:bg-slate-50">
                    <span>Manage Turnstile Keys</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                </a>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 text-xs text-slate-500 leading-relaxed">
                Turnstile replaces invasive reCAPTCHA widgets with a non-interactive challenge, stopping spam form submissions while keeping your user conversion rate high.
              </CardContent>
            </Card>

          </TabsContent>

          {/* TAB 4: EDGE HOSTING & WORKERS */}
          <TabsContent value="hosting" className="space-y-6">
            
            {/* Workers & Pages Overview */}
            <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-600" />
                    <span>Serverless Edge Hosting &amp; Workers</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Deploy serverless edge functions, microservices, and JAMstack web apps across Cloudflare edge nodes globally.
                  </CardDescription>
                </div>
                <a
                  href={`https://dash.cloudflare.com/${CF_ACCOUNT_ID}/workers-and-pages`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-4 rounded-lg shrink-0 gap-1.5">
                    <span>Workers &amp; Pages Console</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                </a>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs font-semibold bg-slate-50 border-slate-200 text-slate-700">
                    {workers.length} Active Worker Scripts
                  </Badge>
                  <p className="text-xs text-slate-500">
                    Serverless code runs with 0 cold starts and sub-millisecond execution worldwide.
                  </p>
                </div>

                <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs space-y-2">
                  <p className="text-slate-400 text-[11px] font-sans"># Deploy from your terminal via Wrangler CLI</p>
                  <p className="text-emerald-400">npx wrangler deploy</p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Links Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-5 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-900">Ship Something New</p>
                  <p className="text-[11px] text-slate-500">Start from a template: Next.js, Remix, Astro, or API router.</p>
                </div>
                <a
                  href={`https://dash.cloudflare.com/${CF_ACCOUNT_ID}/workers-and-pages/create`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 rounded-lg border-slate-200 shrink-0">
                    <span>Create Worker</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                </a>
              </Card>

              <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-5 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-900">Execution Observability</p>
                  <p className="text-[11px] text-slate-500">Real-time CPU telemetry, invocation counts, and error tracing.</p>
                </div>
                <a
                  href={`https://dash.cloudflare.com/${CF_ACCOUNT_ID}/observability`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5 rounded-lg border-slate-200 shrink-0">
                    <span>Metrics Hub</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                  </Button>
                </a>
              </Card>
            </div>

          </TabsContent>

        </Tabs>

      </div>
    </DashboardShell>
  )
}
