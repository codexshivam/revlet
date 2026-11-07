"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  RefreshCw,
  Loader2,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  AlertCircle,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import {
  purgeZoneCache,
  getZoneDevelopmentMode,
  setZoneDevelopmentMode,
  getZoneSpeedSettings,
  updateZoneSpeedSetting,
  getZonePageRules,
  createZonePageRule,
  deleteZonePageRule,
  toggleApexWwwRedirect,
} from "@/app/actions/cloudflare-infrastructure"

interface SpeedCacheTabProps {
  zoneId?: string
  domain?: string
  orgId?: string
  getIdToken: () => Promise<string>
}

export function SpeedCacheTab({ zoneId, domain, orgId, getIdToken }: SpeedCacheTabProps) {
  // Cache & Dev Mode State
  const [isPurgingAll, setIsPurgingAll] = useState(false)
  const [singleUrlToPurge, setSingleUrlToPurge] = useState("")
  const [isPurgingSingle, setIsPurgingSingle] = useState(false)
  const [devMode, setDevMode] = useState(false)
  const [isUpdatingDevMode, setIsUpdatingDevMode] = useState(false)

  // Speed Toggles
  const [brotli, setBrotli] = useState(true)
  const [earlyHints, setEarlyHints] = useState(false)

  // Redirect Rules State
  const [pageRules, setPageRules] = useState<any[]>([])
  const [isApexRedirectEnabled, setIsApexRedirectEnabled] = useState(false)
  const [isTogglingApex, setIsTogglingApex] = useState(false)
  const [isLoadingRules, setIsLoadingRules] = useState(false)

  // Custom Redirect Form
  const [newSourcePattern, setNewSourcePattern] = useState("")
  const [newTargetUrl, setNewTargetUrl] = useState("")
  const [newRedirectStatus, setNewRedirectStatus] = useState<number>(301)
  const [isCreatingRule, setIsCreatingRule] = useState(false)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)

  const loadData = useCallback(async () => {
    if (!zoneId || !orgId) {
      setIsLoadingSettings(false)
      return
    }
    setIsLoadingSettings(true)
    try {
      const token = await getIdToken()

      // 1. Dev Mode
      const devRes = await getZoneDevelopmentMode(token, orgId, zoneId)
      if (devRes.success && devRes.data?.value !== undefined) {
        setDevMode(devRes.data.value === "on")
      }

      // 2. Speed Settings
      const speedRes = await getZoneSpeedSettings(token, orgId, zoneId)
      if (speedRes.success && speedRes.data) {
        setBrotli(speedRes.data.brotli === "on")
        setEarlyHints(speedRes.data.earlyHints === "on")
      }

      // 3. Page Rules
      const rulesRes = await getZonePageRules(token, orgId, zoneId)
      if (rulesRes.success && rulesRes.data) {
        setPageRules(rulesRes.data)
        const targetPattern = `${domain}/*`
        const hasApex = rulesRes.data.some((r: any) => r.urlPattern === targetPattern)
        setIsApexRedirectEnabled(hasApex)
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setIsLoadingSettings(false)
    }
  }, [zoneId, orgId, domain, getIdToken])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePurgeEverything = async () => {
    if (!zoneId || !orgId) return
    setIsPurgingAll(true)
    try {
      const token = await getIdToken()
      const res = await purgeZoneCache(token, orgId, zoneId, true)
      if (res.success) {
        toast({
          title: "Edge Cache Purged",
          description: "All assets cached at global edge nodes have been cleared.",
        })
      } else {
        toast({ variant: "destructive", title: "Purge Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Purge Failed", description: err.message })
    } finally {
      setIsPurgingAll(false)
    }
  }

  const handlePurgeSingleUrl = async () => {
    if (!zoneId || !orgId || !singleUrlToPurge.trim()) {
      toast({ variant: "destructive", title: "URL Required", description: "Please enter an exact URL to purge." })
      return
    }

    let formattedUrl = singleUrlToPurge.trim()
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${domain}/${formattedUrl.replace(/^\/+/, "")}`
    }

    try {
      const parsed = new URL(formattedUrl)
      if (domain && !parsed.hostname.toLowerCase().endsWith(domain.toLowerCase())) {
        toast({
          variant: "destructive",
          title: "Invalid Domain",
          description: `The URL hostname must belong to your domain (${domain}).`,
        })
        return
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Malformed URL",
        description: `Please enter a valid URL (e.g. https://${domain || "example.com"}/style.css).`,
      })
      return
    }

    setIsPurgingSingle(true)
    try {
      const token = await getIdToken()
      const res = await purgeZoneCache(token, orgId, zoneId, false, [formattedUrl])
      if (res.success) {
        toast({
          title: "Asset Cache Purged",
          description: `Successfully invalidated ${formattedUrl} at the edge.`,
        })
        setSingleUrlToPurge("")
      } else {
        toast({ variant: "destructive", title: "Purge Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Purge Failed", description: err.message })
    } finally {
      setIsPurgingSingle(false)
    }
  }

  const handleToggleDevMode = async (enabled: boolean) => {
    if (!zoneId || !orgId) return
    setIsUpdatingDevMode(true)
    try {
      const token = await getIdToken()
      const res = await setZoneDevelopmentMode(token, orgId, zoneId, enabled ? "on" : "off")
      if (res.success) {
        setDevMode(enabled)
        toast({
          title: enabled ? "Development Mode Active" : "Development Mode Off",
          description: enabled
            ? "Edge caching is temporarily bypassed for 3 hours."
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
    if (!zoneId || !orgId) return
    try {
      const token = await getIdToken()
      const res = await updateZoneSpeedSetting(token, orgId, zoneId, "brotli", enabled ? "on" : "off")
      if (res.success) {
        setBrotli(enabled)
        toast({ title: "Brotli Compression Updated", description: enabled ? "Enabled" : "Disabled" })
      }
    } catch {
      toast({ variant: "destructive", title: "Update Failed", description: "Could not toggle Brotli." })
    }
  }

  const handleToggleEarlyHints = async (enabled: boolean) => {
    if (!zoneId || !orgId) return
    try {
      const token = await getIdToken()
      const res = await updateZoneSpeedSetting(token, orgId, zoneId, "early_hints", enabled ? "on" : "off")
      if (res.success) {
        setEarlyHints(enabled)
        toast({ title: "Early Hints (HTTP 103) Updated", description: enabled ? "Enabled" : "Disabled" })
      }
    } catch {
      toast({ variant: "destructive", title: "Update Failed", description: "Could not toggle Early Hints." })
    }
  }

  const handleToggleApex = async (enable: boolean) => {
    if (!zoneId || !orgId || !domain) return
    setIsTogglingApex(true)
    try {
      const token = await getIdToken()
      const res = await toggleApexWwwRedirect(token, orgId, zoneId, domain, enable)
      if (res.success) {
        setIsApexRedirectEnabled(enable)
        toast({
          title: enable ? "Apex Redirect Enabled" : "Apex Redirect Disabled",
          description: enable
            ? `${domain} now permanently redirects to www.${domain}.`
            : "Apex to WWW redirect rule has been removed.",
        })
        const rulesRes = await getZonePageRules(token, orgId, zoneId)
        if (rulesRes.success && rulesRes.data) setPageRules(rulesRes.data)
      } else {
        toast({ variant: "destructive", title: "Redirect Toggle Failed", description: (res as any).error || "Could not toggle redirect rule." })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Redirect Toggle Failed", description: err.message })
    } finally {
      setIsTogglingApex(false)
    }
  }

  const handleCreateCustomRule = async () => {
    if (!zoneId || !orgId || !newSourcePattern.trim() || !newTargetUrl.trim()) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Please enter both source pattern and target URL." })
      return
    }

    setIsCreatingRule(true)
    try {
      const token = await getIdToken()
      const res = await createZonePageRule(token, orgId, zoneId, newSourcePattern.trim(), newTargetUrl.trim(), newRedirectStatus)
      if (res.success) {
        toast({
          title: "Redirect Rule Created",
          description: `Successfully configured redirect for ${newSourcePattern.trim()}.`,
        })
        setNewSourcePattern("")
        setNewTargetUrl("")
        const rulesRes = await getZonePageRules(token, orgId, zoneId)
        if (rulesRes.success && rulesRes.data) setPageRules(rulesRes.data)
      } else {
        toast({ variant: "destructive", title: "Creation Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Creation Failed", description: err.message })
    } finally {
      setIsCreatingRule(false)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!zoneId || !orgId) return
    try {
      const token = await getIdToken()
      const res = await deleteZonePageRule(token, orgId, zoneId, ruleId)
      if (res.success) {
        toast({ title: "Rule Deleted", description: "Redirect rule has been removed." })
        setPageRules((prev) => prev.filter((r) => r.id !== ruleId))
        const targetPattern = `${domain}/*`
        if (pageRules.find((r) => r.id === ruleId)?.urlPattern === targetPattern) {
          setIsApexRedirectEnabled(false)
        }
      } else {
        toast({ variant: "destructive", title: "Deletion Failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Deletion Failed", description: err.message })
    }
  }

  if (isLoadingSettings) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-60" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          </Card>
          <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-52" />
              </div>
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          </Card>
        </div>

        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      
      {/* 1. Global & Selective Cache Purge */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-bold text-slate-900">
              Edge Cache Management
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Invalidate static assets cached at Cloudflare edge POPs globally after releasing code updates.
            </CardDescription>
          </div>
          <Button
            onClick={handlePurgeEverything}
            disabled={isPurgingAll}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-9 px-4 rounded-lg shadow-xs shrink-0"
          >
            {isPurgingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
            Purge All Cache
          </Button>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Selective Cache Purge (Specific File / Asset)</Label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Input
                placeholder={`e.g. https://${domain || "example.com"}/style.css or bundle.js`}
                value={singleUrlToPurge}
                onChange={(e) => setSingleUrlToPurge(e.target.value)}
                className="h-9 text-xs border-slate-200 rounded-lg flex-1"
              />
              <Button
                variant="outline"
                onClick={handlePurgeSingleUrl}
                disabled={isPurgingSingle}
                className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-black font-semibold text-xs h-9 px-4 rounded-lg shrink-0 transition-colors"
              >
                {isPurgingSingle ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                Purge Single File
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              Target a specific CSS, image, or script file without clearing the entire site cache.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Development Mode (Bypass Cache) */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-row items-center justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-bold text-slate-900">
              Development Mode (Bypass Cache)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Temporarily bypass edge caching for 3 hours so edits to your origin server reflect immediately.
            </CardDescription>
          </div>
          <Switch
            checked={devMode}
            onCheckedChange={handleToggleDevMode}
            disabled={isUpdatingDevMode}
          />
        </CardHeader>
        <CardContent className="p-5 sm:p-6 text-xs text-slate-500">
          Status: <span className="font-semibold text-slate-900">{devMode ? "Active (Cache Bypassed)" : "Inactive (Normal Edge Caching)"}</span>
        </CardContent>
      </Card>

      {/* 3. Performance & Asset Compression */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">Performance &amp; Asset Compression</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Network edge optimizations to minimize Time to First Byte (TTFB) and bandwidth consumption.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 divide-y divide-slate-100 space-y-4">
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-slate-800">Brotli Compression</p>
              <p className="text-[11px] text-slate-500">Compress text assets (HTML, CSS, JSON, JS) using modern Brotli algorithm.</p>
            </div>
            <Switch checked={brotli} onCheckedChange={handleToggleBrotli} />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-slate-800">Early Hints (HTTP 103)</p>
              <p className="text-[11px] text-slate-500">Instructs browsers to preload critical fonts and stylesheets before the HTML body arrives.</p>
            </div>
            <Switch checked={earlyHints} onCheckedChange={handleToggleEarlyHints} />
          </div>
        </CardContent>
      </Card>

      {/* 4. Domain Redirects & Page Rules */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-slate-900">
            Edge URL Redirects &amp; Page Rules
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Execute 301/302 URL redirects directly at the edge without hitting your application server.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 space-y-6">
          
          {/* Quick Apex to WWW Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200/80">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-900">Redirect Apex to WWW (301 Permanent)</p>
              <p className="text-[11px] text-slate-500">
                Automatically routes <code className="text-slate-800 font-semibold">{`${domain}/*`}</code> to <code className="text-slate-800 font-semibold">{`https://www.${domain}/$1`}</code>.
              </p>
            </div>
            <Switch
              checked={isApexRedirectEnabled}
              onCheckedChange={handleToggleApex}
              disabled={isTogglingApex}
            />
          </div>

          {/* Add Custom Redirect Form */}
          <div className="space-y-3 pt-2">
            <Label className="text-xs font-semibold text-slate-700">Add Custom Edge Redirect</Label>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <Input
                  placeholder={`Source (e.g. ${domain}/docs/*)`}
                  value={newSourcePattern}
                  onChange={(e) => setNewSourcePattern(e.target.value)}
                  className="h-9 text-xs border-slate-200"
                />
              </div>
              <div className="sm:col-span-5">
                <Input
                  placeholder="Target (e.g. https://notion.so/...)"
                  value={newTargetUrl}
                  onChange={(e) => setNewTargetUrl(e.target.value)}
                  className="h-9 text-xs border-slate-200"
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  onClick={handleCreateCustomRule}
                  disabled={isCreatingRule}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-9 rounded-lg"
                >
                  {isCreatingRule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add Rule"}
                </Button>
              </div>
            </div>
          </div>

          {/* Active Rules List */}
          {pageRules.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-semibold text-slate-700">Active Redirect Rules on Domain</Label>
              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                {pageRules.map((rule) => (
                  <div key={rule.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                    <div className="space-y-0.5 truncate flex-1">
                      <p className="font-mono font-semibold text-slate-900 truncate">{rule.urlPattern}</p>
                      <p className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                        <span>Redirects to:</span>
                        <span className="font-mono text-slate-700">{rule.forwardUrl}</span>
                        <span className="font-mono text-[11px] text-slate-400 font-medium">
                          ({rule.statusCode || 301})
                        </span>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-slate-400 hover:text-red-600 hover:bg-slate-100 h-8 w-8 p-0 rounded-lg shrink-0 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </CardContent>
      </Card>

    </div>
  )
}
