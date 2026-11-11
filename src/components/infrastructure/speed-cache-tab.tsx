"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw, Loader2, Trash2 } from "lucide-react"
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
  const [isPurgingAll, setIsPurgingAll] = useState(false)
  const [singleUrlToPurge, setSingleUrlToPurge] = useState("")
  const [isPurgingSingle, setIsPurgingSingle] = useState(false)
  const [devMode, setDevMode] = useState(false)
  const [isUpdatingDevMode, setIsUpdatingDevMode] = useState(false)

  const [brotli, setBrotli] = useState(true)
  const [earlyHints, setEarlyHints] = useState(false)

  const [pageRules, setPageRules] = useState<any[]>([])
  const [isApexRedirectEnabled, setIsApexRedirectEnabled] = useState(false)
  const [isTogglingApex, setIsTogglingApex] = useState(false)

  const [newSourcePattern, setNewSourcePattern] = useState("")
  const [newTargetUrl, setNewTargetUrl] = useState("")
  const [newRedirectStatus] = useState<number>(301)
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

      const devRes = await getZoneDevelopmentMode(token, orgId, zoneId)
      if (devRes.success && devRes.data?.value !== undefined) {
        setDevMode(devRes.data.value === "on")
      }

      const speedRes = await getZoneSpeedSettings(token, orgId, zoneId)
      if (speedRes.success && speedRes.data) {
        setBrotli(speedRes.data.brotli === "on")
        setEarlyHints(speedRes.data.earlyHints === "on")
      }

      const rulesRes = await getZonePageRules(token, orgId, zoneId)
      if (rulesRes.success && rulesRes.data) {
        setPageRules(rulesRes.data)
        const targetPattern = `${domain}/*`
        const hasApex = rulesRes.data.some((r: any) => r.urlPattern === targetPattern)
        setIsApexRedirectEnabled(hasApex)
      }
    } catch {
      // background fetch error
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
          title: "Edge cache purged",
          description: "All cached assets at edge nodes have been cleared.",
        })
      } else {
        toast({ variant: "destructive", title: "Purge failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Purge failed", description: err.message })
    } finally {
      setIsPurgingAll(false)
    }
  }

  const handlePurgeSingleUrl = async () => {
    if (!zoneId || !orgId || !singleUrlToPurge.trim()) {
      toast({ variant: "destructive", title: "URL required", description: "Enter an exact URL to purge." })
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
          title: "Invalid domain",
          description: `The URL hostname must belong to your domain (${domain}).`,
        })
        return
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Malformed URL",
        description: `Enter a valid URL (e.g. https://${domain || "example.com"}/style.css).`,
      })
      return
    }

    setIsPurgingSingle(true)
    try {
      const token = await getIdToken()
      const res = await purgeZoneCache(token, orgId, zoneId, false, [formattedUrl])
      if (res.success) {
        toast({
          title: "Asset cache purged",
          description: `Invalidated ${formattedUrl} at the edge.`,
        })
        setSingleUrlToPurge("")
      } else {
        toast({ variant: "destructive", title: "Purge failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Purge failed", description: err.message })
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
          title: enabled ? "Development mode enabled" : "Development mode disabled",
          description: enabled
            ? "Edge caching is temporarily bypassed for 3 hours."
            : "Normal edge caching restored.",
        })
      } else {
        toast({ variant: "destructive", title: "Update failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message })
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
        toast({ title: "Brotli compression", description: enabled ? "Enabled" : "Disabled" })
      }
    } catch {
      toast({ variant: "destructive", title: "Update failed", description: "Could not toggle Brotli." })
    }
  }

  const handleToggleEarlyHints = async (enabled: boolean) => {
    if (!zoneId || !orgId) return
    try {
      const token = await getIdToken()
      const res = await updateZoneSpeedSetting(token, orgId, zoneId, "early_hints", enabled ? "on" : "off")
      if (res.success) {
        setEarlyHints(enabled)
        toast({ title: "Early Hints (HTTP 103)", description: enabled ? "Enabled" : "Disabled" })
      }
    } catch {
      toast({ variant: "destructive", title: "Update failed", description: "Could not toggle Early Hints." })
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
          title: enable ? "Apex redirect enabled" : "Apex redirect disabled",
          description: enable
            ? `${domain} permanently redirects to www.${domain}.`
            : "Apex redirect rule removed.",
        })
        const rulesRes = await getZonePageRules(token, orgId, zoneId)
        if (rulesRes.success && rulesRes.data) setPageRules(rulesRes.data)
      } else {
        toast({
          variant: "destructive",
          title: "Toggle failed",
          description: (res as any).error || "Could not toggle redirect rule.",
        })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Toggle failed", description: err.message })
    } finally {
      setIsTogglingApex(false)
    }
  }

  const handleCreateCustomRule = async () => {
    if (!zoneId || !orgId || !newSourcePattern.trim() || !newTargetUrl.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Enter both source pattern and target URL." })
      return
    }

    setIsCreatingRule(true)
    try {
      const token = await getIdToken()
      const res = await createZonePageRule(
        token,
        orgId,
        zoneId,
        newSourcePattern.trim(),
        newTargetUrl.trim(),
        newRedirectStatus
      )
      if (res.success) {
        toast({
          title: "Redirect rule created",
          description: `Configured redirect for ${newSourcePattern.trim()}.`,
        })
        setNewSourcePattern("")
        setNewTargetUrl("")
        const rulesRes = await getZonePageRules(token, orgId, zoneId)
        if (rulesRes.success && rulesRes.data) setPageRules(rulesRes.data)
      } else {
        toast({ variant: "destructive", title: "Creation failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Creation failed", description: err.message })
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
        toast({ title: "Rule removed", description: "Redirect rule deleted." })
        setPageRules((prev) => prev.filter((r) => r.id !== ruleId))
        const targetPattern = `${domain}/*`
        if (pageRules.find((r) => r.id === ruleId)?.urlPattern === targetPattern) {
          setIsApexRedirectEnabled(false)
        }
      } else {
        toast({ variant: "destructive", title: "Deletion failed", description: res.error })
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Deletion failed", description: err.message })
    }
  }

  if (isLoadingSettings) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Card className="bg-white border-slate-200 shadow-none rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-white border-slate-200 shadow-none rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-60" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          </Card>
          <Card className="bg-white border-slate-200 shadow-none rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-52" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Global & Selective Cache Purge */}
      <Card className="bg-white border-slate-200 shadow-none rounded-xl">
        <CardHeader className="p-6 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-semibold text-slate-900">
              Edge cache management
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Invalidate static assets cached at global edge nodes after deployments.
            </CardDescription>
          </div>
          <Button
            onClick={handlePurgeEverything}
            disabled={isPurgingAll}
            variant="outline"
            className="h-9 px-4 text-xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg shrink-0 flex items-center gap-1.5"
          >
            {isPurgingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Purge all cache</span>
          </Button>
        </CardHeader>
        <CardContent className="p-6 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Selective cache purge (specific file or path)
            </Label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Input
                placeholder={`e.g. https://${domain || "example.com"}/style.css`}
                value={singleUrlToPurge}
                onChange={(e) => setSingleUrlToPurge(e.target.value)}
                className="h-9 text-xs border-slate-200 rounded-lg flex-1 font-mono"
              />
              <Button
                variant="outline"
                onClick={handlePurgeSingleUrl}
                disabled={isPurgingSingle}
                className="h-9 px-4 text-xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg shrink-0"
              >
                {isPurgingSingle && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Purge file
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Invalidate a specific asset across edge POPs without clearing the full cache.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Development Mode */}
      <Card className="bg-white border-slate-200 shadow-none rounded-xl">
        <CardHeader className="p-6 flex flex-row items-center justify-between gap-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-semibold text-slate-900">
              Development mode
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Temporarily bypass edge caching for 3 hours so edits to origin servers reflect immediately.
            </CardDescription>
          </div>
          <Switch
            checked={devMode}
            onCheckedChange={handleToggleDevMode}
            disabled={isUpdatingDevMode}
          />
        </CardHeader>
      </Card>

      {/* 3. Performance & Asset Compression */}
      <Card className="bg-white border-slate-200 shadow-none rounded-xl">
        <CardHeader className="p-6 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">
            Performance and compression
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Edge optimizations to reduce latency and bandwidth usage.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 divide-y divide-slate-100">
          <div className="flex items-center justify-between pb-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-900">Brotli compression</p>
              <p className="text-xs text-slate-500">
                Compress textual assets (HTML, CSS, JSON, JS) using modern Brotli compression.
              </p>
            </div>
            <Switch checked={brotli} onCheckedChange={handleToggleBrotli} />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-900">Early Hints (HTTP 103)</p>
              <p className="text-xs text-slate-500">
                Instruct browsers to preload critical resources before final HTML responses arrive.
              </p>
            </div>
            <Switch checked={earlyHints} onCheckedChange={handleToggleEarlyHints} />
          </div>
        </CardContent>
      </Card>

      {/* 4. Domain Redirects & Page Rules */}
      <Card className="bg-white border-slate-200 shadow-none rounded-xl">
        <CardHeader className="p-6 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">
            URL redirects and page rules
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Execute 301/302 redirects at the edge without querying application origins.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-900">Redirect apex to www (301 permanent)</p>
              <p className="text-xs text-slate-500">
                Routes <code className="font-mono text-slate-700">{`${domain}/*`}</code> to <code className="font-mono text-slate-700">{`https://www.${domain}/$1`}</code>.
              </p>
            </div>
            <Switch
              checked={isApexRedirectEnabled}
              onCheckedChange={handleToggleApex}
              disabled={isTogglingApex}
            />
          </div>

          <div className="space-y-3 pt-2">
            <Label className="text-xs font-medium text-slate-700">Add custom redirect rule</Label>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-5">
                <Input
                  placeholder={`Source (e.g. ${domain}/docs/*)`}
                  value={newSourcePattern}
                  onChange={(e) => setNewSourcePattern(e.target.value)}
                  className="h-9 text-xs border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-5">
                <Input
                  placeholder="Destination (e.g. https://docs.domain.com/...)"
                  value={newTargetUrl}
                  onChange={(e) => setNewTargetUrl(e.target.value)}
                  className="h-9 text-xs border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  onClick={handleCreateCustomRule}
                  disabled={isCreatingRule}
                  className="w-full h-9 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none"
                >
                  {isCreatingRule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add rule"}
                </Button>
              </div>
            </div>
          </div>

          {pageRules.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-medium text-slate-700">Active redirect rules</Label>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
                {pageRules.map((rule) => (
                  <div key={rule.id} className="p-3 flex items-center justify-between gap-4 text-xs">
                    <div className="space-y-0.5 truncate flex-1 min-w-0">
                      <p className="font-mono text-xs font-medium text-slate-900 truncate">
                        {rule.urlPattern}
                      </p>
                      <p className="text-xs text-slate-500 truncate flex items-center gap-1.5">
                        <span>→</span>
                        <span className="font-mono text-slate-700">{rule.forwardUrl}</span>
                        <span className="text-slate-400 tabular-nums">({rule.statusCode || 301})</span>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="h-7 w-7 text-slate-400 hover:text-red-600 rounded-lg shrink-0"
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
