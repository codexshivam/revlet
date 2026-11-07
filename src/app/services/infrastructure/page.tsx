"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Server,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Mail,
  Layers,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Lock,
  Plus,
  Trash2,
  Globe,
  Sparkles,
  Info,
  Check,
  Radio,
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
  getEmailRoutingRules,
  createEmailRoutingRule,
  deleteEmailRoutingRule,
  applyPlatformPreset,
  PlatformPreset,
} from "@/app/actions/cloudflare-infrastructure"
import { autoConfigureEmailDNS, getEmailRoutingStatus } from "@/app/actions/cloudflare-dns"

export default function InfrastructurePage() {
  const { activeOrg } = useActiveOrg()
  const auth = useAuth()

  const zoneId = activeOrg?.cloudflareZoneId
  const domain = activeOrg?.domain

  // Tab State
  const [activeTab, setActiveTab] = useState("presets")
  const [loading, setLoading] = useState(false)

  // Cache & Speed State
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

  // Email Routing State
  const [emailRoutingStatus, setEmailRoutingStatus] = useState("unknown")
  const [emailRules, setEmailRules] = useState<any[]>([])
  const [isLoadingRules, setIsLoadingRules] = useState(false)
  const [newAlias, setNewAlias] = useState("")
  const [newDestination, setNewDestination] = useState("")
  const [isCreatingRule, setIsCreatingRule] = useState(false)
  const [isConfiguringEmailDNS, setIsConfiguringEmailDNS] = useState(false)

  // Preset Dialog State
  const [selectedPreset, setSelectedPreset] = useState<PlatformPreset | null>(null)
  const [presetSubdomain, setPresetSubdomain] = useState("")
  const [presetTarget, setPresetTarget] = useState("")
  const [isApplyingPreset, setIsApplyingPreset] = useState(false)
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false)

  const getIdToken = useCallback(async () => {
    if (!auth?.currentUser) throw new Error("Authentication required")
    return await auth.currentUser.getIdToken()
  }, [auth])

  // Load Zone Edge Settings
  const loadZoneSettings = useCallback(async () => {
    if (!zoneId || !activeOrg?.id) return
    setLoading(true)

    try {
      const token = await getIdToken()

      // Load Dev Mode
      const devRes = await getZoneDevelopmentMode(token, activeOrg.id, zoneId)
      if (devRes.success && devRes.data?.value !== undefined) {
        setDevMode(devRes.data.value === "on")
      }

      // Load Speed
      const speedRes = await getZoneSpeedSettings(token, activeOrg.id, zoneId)
      if (speedRes.success && speedRes.data) {
        setBrotli(speedRes.data.brotli === "on")
        setEarlyHints(speedRes.data.earlyHints === "on")
      }

      // Load SSL
      const sslRes = await getZoneSSLSettings(token, activeOrg.id, zoneId)
      if (sslRes.success && sslRes.data) {
        setSslMode(sslRes.data.ssl || "full")
        setAlwaysHttps(sslRes.data.alwaysUseHttps === "on")
        setAutoRewrites(sslRes.data.autoHttpsRewrites === "on")
        setMinTls(sslRes.data.minTlsVersion || "1.2")
      }

      // Load DNSSEC
      const dnssecRes = await getZoneDNSSEC(token, activeOrg.id, zoneId)
      if (dnssecRes.success && dnssecRes.data) {
        setDnssecStatus(dnssecRes.data.status || "disabled")
      }

      // Load Security Level
      const secRes = await getZoneSecurityLevel(token, activeOrg.id, zoneId)
      if (secRes.success && secRes.data) {
        setSecurityLevel(secRes.data.value || "medium")
      }

      // Load Email Routing
      const emailStatusRes = await getEmailRoutingStatus(token, activeOrg.id, zoneId)
      if (emailStatusRes.success && emailStatusRes.data) {
        setEmailRoutingStatus(emailStatusRes.data.status || "unconfigured")
      }

      // Load Email Rules
      const rulesRes = await getEmailRoutingRules(token, activeOrg.id, zoneId)
      if (rulesRes.success && rulesRes.data) {
        setEmailRules(rulesRes.data)
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setLoading(false)
    }
  }, [zoneId, activeOrg?.id, getIdToken])

  useEffect(() => {
    if (zoneId && activeOrg?.id) {
      loadZoneSettings()
    }
  }, [zoneId, activeOrg?.id, loadZoneSettings])

  // Handlers for Tab 1: Presets
  const handleOpenPreset = (preset: PlatformPreset) => {
    setSelectedPreset(preset)
    if (preset === "supabase") {
      setPresetSubdomain("api")
      setPresetTarget("custom.supabase.co")
    } else if (preset === "render") {
      setPresetTarget(`${domain || "app"}.onrender.com`)
    } else if (preset === "railway") {
      setPresetTarget(`${domain || "app"}.up.railway.app`)
    } else if (preset === "github") {
      setPresetTarget(`${domain || "site"}.github.io`)
    } else {
      setPresetSubdomain("")
      setPresetTarget("")
    }
    setIsPresetModalOpen(true)
  }

  const handleApplyPreset = async () => {
    if (!selectedPreset || !zoneId || !activeOrg?.id || !domain) return
    setIsApplyingPreset(true)

    try {
      const token = await getIdToken()
      const res = await applyPlatformPreset(
        token,
        activeOrg.id,
        zoneId,
        domain,
        selectedPreset,
        { customSubdomain: presetSubdomain, customTarget: presetTarget }
      )

      if (res.success) {
        toast({
          title: "Preset Applied",
          description: `Successfully configured DNS records for ${selectedPreset.toUpperCase()}.`,
        })
        setIsPresetModalOpen(false)
      } else {
        toast({
          variant: "destructive",
          title: "Configuration Failed",
          description: res.error || "Could not apply preset.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: err.message || "An unexpected error occurred.",
      })
    } finally {
      setIsApplyingPreset(false)
    }
  }

  // Handlers for Tab 2: Speed & Cache
  const handlePurgeCache = async () => {
    if (!zoneId || !activeOrg?.id) return
    setIsPurging(true)
    try {
      const token = await getIdToken()
      const res = await purgeZoneCache(token, activeOrg.id, zoneId, true)
      if (res.success) {
        toast({
          title: "Edge Cache Purged",
          description: "All assets cached at global edge locations have been invalidated.",
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
            : "Normal edge caching has been restored.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: res.error,
        })
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

  // Handlers for Tab 3: SSL & Security
  const handleUpdateSSLMode = async (mode: string) => {
    if (!zoneId || !activeOrg?.id) return
    setIsUpdatingSSL(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSSLSetting(token, activeOrg.id, zoneId, "ssl", mode)
      if (res.success) {
        setSslMode(mode)
        toast({ title: "SSL/TLS Mode Updated", description: `Encryption mode set to ${mode.toUpperCase()}.` })
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
        toast({ title: "Always Use HTTPS", description: enabled ? "HTTP requests automatically redirect to HTTPS." : "Disabled" })
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

  // Handlers for Tab 4: DDoS & Protection
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

  // Handlers for Tab 5: Free Email Routing
  const handleCreateEmailRule = async () => {
    if (!newAlias.trim() || !newDestination.trim() || !zoneId || !activeOrg?.id || !domain) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Please enter both an alias and destination email." })
      return
    }

    setIsCreatingRule(true)
    try {
      const token = await getIdToken()
      const formattedAlias = newAlias.includes("@") ? newAlias.trim() : `${newAlias.trim()}@${domain}`
      const res = await createEmailRoutingRule(token, activeOrg.id, zoneId, formattedAlias, newDestination.trim())

      if (res.success) {
        toast({
          title: "Forwarding Alias Created",
          description: `Emails sent to ${formattedAlias} will forward to ${newDestination.trim()}.`,
        })
        setNewAlias("")
        setNewDestination("")
        const updatedRules = await getEmailRoutingRules(token, activeOrg.id, zoneId)
        if (updatedRules.success && updatedRules.data) setEmailRules(updatedRules.data)
      } else {
        toast({ variant: "destructive", title: "Creation Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Creation Failed", description: err.message })
    } finally {
      setIsCreatingRule(false)
    }
  }

  const handleDeleteEmailRule = async (ruleId: string) => {
    if (!zoneId || !activeOrg?.id) return
    try {
      const token = await getIdToken()
      const res = await deleteEmailRoutingRule(token, activeOrg.id, zoneId, ruleId)
      if (res.success) {
        toast({ title: "Rule Removed", description: "Email forwarding alias removed." })
        setEmailRules((prev) => prev.filter((r) => r.id !== ruleId))
      } else {
        toast({ variant: "destructive", title: "Deletion Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Deletion Failed", description: err.message })
    }
  }

  const handleConfigureEmailDNS = async () => {
    if (!zoneId || !activeOrg?.id || !domain) return
    setIsConfiguringEmailDNS(true)
    try {
      const token = await getIdToken()
      const res = await autoConfigureEmailDNS(token, activeOrg.id, zoneId, domain)
      if (res.success) {
        toast({
          title: "Email Routing DNS Configured",
          description: "Cloudflare MX and SPF records added to your domain.",
        })
        setEmailRoutingStatus("configured")
      } else {
        toast({ variant: "destructive", title: "DNS Setup Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "DNS Setup Failed", description: err.message })
    } finally {
      setIsConfiguringEmailDNS(false)
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300 max-w-6xl mx-auto">
        
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
              Unified edge control: 1-click platform deployment, edge cache, SSL encryption, DDoS mitigation, and email routing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadZoneSettings}
              disabled={loading}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 gap-1.5 rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Edge</span>
            </Button>
            <Link href="/services/dns">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 gap-1.5 rounded-lg"
              >
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                <span>DNS Records</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Empty State when no Domain is Configured */}
        {!domain || !zoneId ? (
          <Card className="bg-white border-slate-200/80 shadow-sm rounded-xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-lg font-bold text-slate-900">No Domain Connected</h2>
              <p className="text-xs text-slate-500">
                To manage edge caching, platform presets, and SSL encryption, connect an active domain to your organization in DNS Management.
              </p>
            </div>
            <Link href="/services/dns">
              <Button className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 px-4 rounded-lg gap-2">
                <Plus className="w-3.5 h-3.5" />
                <span>Connect Domain</span>
              </Button>
            </Link>
          </Card>
        ) : (
          /* Main 5-Tabbed Infrastructure Panel */
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-slate-100/80 p-1 rounded-xl grid grid-cols-2 sm:grid-cols-5 w-full h-auto gap-1 border border-slate-200/60">
              <TabsTrigger value="presets" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Connect & Presets</span>
              </TabsTrigger>
              <TabsTrigger value="speed" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Speed & Cache</span>
              </TabsTrigger>
              <TabsTrigger value="ssl" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>SSL & Security</span>
              </TabsTrigger>
              <TabsTrigger value="ddos" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                <Flame className="w-3.5 h-3.5 text-red-500" />
                <span>DDoS & Protection</span>
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                <Mail className="w-3.5 h-3.5 text-indigo-600" />
                <span>Free Email Routing</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: CONNECT & PRESETS */}
            <TabsContent value="presets" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Vercel Preset */}
                <Card className="bg-white border-slate-200/80 shadow-xs hover:shadow-md transition-shadow rounded-xl flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-bold text-xs">
                        ▲
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 text-slate-600">
                        Frontend
                      </Badge>
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-900 mt-2">Vercel</CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Auto-configures A record (76.76.21.21) and www CNAME (cname.vercel-dns.com).
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="p-5 pt-0">
                    <Button 
                      onClick={() => handleOpenPreset("vercel")} 
                      className="w-full text-xs font-semibold h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Connect Vercel
                    </Button>
                  </CardFooter>
                </Card>

                {/* Supabase Preset */}
                <Card className="bg-white border-slate-200/80 shadow-xs hover:shadow-md transition-shadow rounded-xl flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                        ⚡
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 text-slate-600">
                        Backend & DB
                      </Badge>
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-900 mt-2">Supabase</CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Configures custom domain CNAME for Postgres, Auth, and Edge Functions.
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="p-5 pt-0">
                    <Button 
                      onClick={() => handleOpenPreset("supabase")} 
                      className="w-full text-xs font-semibold h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Connect Supabase
                    </Button>
                  </CardFooter>
                </Card>

                {/* Resend Preset */}
                <Card className="bg-white border-slate-200/80 shadow-xs hover:shadow-md transition-shadow rounded-xl flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-bold text-xs">
                        ✉
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 text-slate-600">
                        Transactional Email
                      </Badge>
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-900 mt-2">Resend</CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Configures DKIM, SPF TXT, and MX routing records for verified email delivery.
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="p-5 pt-0">
                    <Button 
                      onClick={() => handleOpenPreset("resend")} 
                      className="w-full text-xs font-semibold h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Connect Resend
                    </Button>
                  </CardFooter>
                </Card>

                {/* Render Preset */}
                <Card className="bg-white border-slate-200/80 shadow-xs hover:shadow-md transition-shadow rounded-xl flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                        R
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 text-slate-600">
                        Web Services
                      </Badge>
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-900 mt-2">Render</CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Configures root A record (216.24.57.1) and custom onrender CNAME.
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="p-5 pt-0">
                    <Button 
                      onClick={() => handleOpenPreset("render")} 
                      className="w-full text-xs font-semibold h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Connect Render
                    </Button>
                  </CardFooter>
                </Card>

                {/* Railway Preset */}
                <Card className="bg-white border-slate-200/80 shadow-xs hover:shadow-md transition-shadow rounded-xl flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-purple-700 text-white flex items-center justify-center font-bold text-xs">
                        🛤
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 text-slate-600">
                        Cloud Hosting
                      </Badge>
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-900 mt-2">Railway</CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Configures custom domain CNAME pointing to your Railway deployment.
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="p-5 pt-0">
                    <Button 
                      onClick={() => handleOpenPreset("railway")} 
                      className="w-full text-xs font-semibold h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Connect Railway
                    </Button>
                  </CardFooter>
                </Card>

                {/* GitHub Pages */}
                <Card className="bg-white border-slate-200/80 shadow-xs hover:shadow-md transition-shadow rounded-xl flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
                        🐙
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold border-slate-200 text-slate-600">
                        Static Docs
                      </Badge>
                    </div>
                    <CardTitle className="text-sm font-bold text-slate-900 mt-2">GitHub Pages</CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Injects the 4 official GitHub Pages A records and custom domain CNAME.
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="p-5 pt-0">
                    <Button 
                      onClick={() => handleOpenPreset("github")} 
                      className="w-full text-xs font-semibold h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white"
                    >
                      Connect GitHub Pages
                    </Button>
                  </CardFooter>
                </Card>

              </div>
            </TabsContent>

            {/* TAB 2: SPEED & CACHE */}
            <TabsContent value="speed" className="space-y-6">
              
              {/* Purge Everything Card */}
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
                <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span>Instant Edge Cache Purge</span>
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500 mt-0.5">
                        Flush all cached HTML, CSS, JavaScript, and static files from Cloudflare edge nodes globally.
                      </CardDescription>
                    </div>
                    <Button
                      onClick={handlePurgeCache}
                      disabled={isPurging}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-9 px-4 rounded-lg shadow-xs"
                    >
                      {isPurging ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
                      Purge Everything
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 text-xs text-slate-500 leading-relaxed">
                  Use this immediately after deploying frontend code updates so all visitors across the world see your latest release in real-time.
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
                  <CardTitle className="text-base font-bold text-slate-900">Performance & Asset Compression</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Cloudflare edge optimizations to speed up page load times for startups.
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
                </CardContent>
              </Card>

            </TabsContent>

            {/* TAB 3: SSL & SECURITY */}
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

              {/* HTTPS Enforcement & Rewrites */}
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
                <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                  <CardTitle className="text-base font-bold text-slate-900">HTTPS Enforcement & DNSSEC</CardTitle>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 divide-y divide-slate-100 space-y-4">
                  <div className="flex items-center justify-between pt-1">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-800">Always Use HTTPS</p>
                      <p className="text-[11px] text-slate-500">Redirect all HTTP requests to secure HTTPS automatically.</p>
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
                      <p className="text-[11px] text-slate-500">Reject deprecated SSL/TLS protocols to ensure compliance.</p>
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

            {/* TAB 4: DDOS & PROTECTION */}
            <TabsContent value="ddos" className="space-y-6">
              
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
                      Instantly deploys interactive JavaScript challenges to all visitors to stop DDoS floods, scrapers, and malicious bot traffic.
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

            </TabsContent>

            {/* TAB 5: FREE EMAIL ROUTING */}
            <TabsContent value="email" className="space-y-6">
              
              {/* Status & 1-Click DNS Card */}
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
                <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-indigo-600" />
                      <span>Zero-Cost Startup Email Forwarding</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Create unlimited custom domain aliases (e.g. contact@{domain}) that forward directly to your personal Gmail/Outlook for $0/month.
                    </CardDescription>
                  </div>
                  {emailRoutingStatus !== "configured" && (
                    <Button
                      onClick={handleConfigureEmailDNS}
                      disabled={isConfiguringEmailDNS}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-9 px-4 rounded-lg shrink-0 gap-2"
                    >
                      {isConfiguringEmailDNS ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      1-Click Configure Email DNS
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <Badge variant={emailRoutingStatus === "configured" ? "default" : "outline"} className="text-xs">
                      Status: {emailRoutingStatus === "configured" ? "Ready & Configured" : "DNS Activation Required"}
                    </Badge>
                    <p className="text-xs text-slate-500">
                      No Google Workspace or monthly email hosting subscription required.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Add New Forwarding Alias Form */}
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
                <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                  <CardTitle className="text-base font-bold text-slate-900">Create Forwarding Alias</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Route incoming emails to your real inbox without exposing your personal email address.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">Custom Domain Alias</Label>
                      <div className="flex items-center">
                        <Input
                          placeholder="e.g. hello, contact, support"
                          value={newAlias}
                          onChange={(e) => setNewAlias(e.target.value)}
                          className="h-10 text-sm border-slate-200 rounded-r-none"
                        />
                        <span className="h-10 px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg flex items-center text-xs text-slate-500 font-medium">
                          @{domain}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">Forward to Personal Email</Label>
                      <Input
                        type="email"
                        placeholder="yourname@gmail.com"
                        value={newDestination}
                        onChange={(e) => setNewDestination(e.target.value)}
                        className="h-10 text-sm border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleCreateEmailRule}
                      disabled={isCreatingRule}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 px-4 rounded-lg shadow-sm"
                    >
                      {isCreatingRule && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
                      Create Alias
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Active Forwarding Rules Table */}
              <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
                <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
                  <CardTitle className="text-base font-bold text-slate-900">Active Routing Rules</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {emailRules.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No custom email aliases configured yet. Add your first alias above.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {emailRules.map((rule) => (
                        <div key={rule.id} className="p-4 sm:p-5 flex items-center justify-between gap-4">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-900 font-mono">{rule.matcher}</p>
                            <p className="text-[11px] text-slate-500">
                              Forwards to: <span className="font-semibold text-slate-700">{rule.destination}</span>
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEmailRule(rule.id)}
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

            </TabsContent>

          </Tabs>
        )}

      </div>

      {/* Preset Application Modal */}
      <Dialog open={isPresetModalOpen} onOpenChange={setIsPresetModalOpen}>
        <DialogContent className="bg-white border-slate-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Connect {selectedPreset ? selectedPreset.toUpperCase() : "Platform"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed">
              Revlet will automatically configure the required DNS records for your domain ({domain}) without requiring manual record copying.
            </DialogDescription>
          </DialogHeader>

          {selectedPreset === "supabase" && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Subdomain</Label>
                <Input
                  value={presetSubdomain}
                  onChange={(e) => setPresetSubdomain(e.target.value)}
                  placeholder="api"
                  className="h-9 text-xs border-slate-200"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Supabase Custom Domain CNAME Target</Label>
                <Input
                  value={presetTarget}
                  onChange={(e) => setPresetTarget(e.target.value)}
                  placeholder="custom.supabase.co"
                  className="h-9 text-xs border-slate-200"
                />
              </div>
            </div>
          )}

          {(selectedPreset === "render" || selectedPreset === "railway" || selectedPreset === "github") && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Target Hostname</Label>
                <Input
                  value={presetTarget}
                  onChange={(e) => setPresetTarget(e.target.value)}
                  placeholder="e.g. app.onrender.com"
                  className="h-9 text-xs border-slate-200"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsPresetModalOpen(false)}
              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyPreset}
              disabled={isApplyingPreset}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 px-4 gap-2"
            >
              {isApplyingPreset && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Apply Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardShell>
  )
}
