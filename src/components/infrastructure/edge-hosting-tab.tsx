"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  RefreshCw,
  Plus,
  Trash2,
  Loader2,
  CornerDownRight,
  Copy,
  CheckCheck,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import {
  getAccountWorkers,
  getZoneWorkerRoutes,
  createZoneWorkerRoute,
  deleteZoneWorkerRoute,
} from "@/app/actions/cloudflare-infrastructure"

interface EdgeHostingTabProps {
  zoneId?: string
  domain?: string
  orgId?: string
  getIdToken: () => Promise<string>
}

export function EdgeHostingTab({ zoneId, domain, orgId, getIdToken }: EdgeHostingTabProps) {
  const [loading, setLoading] = useState(false)
  const [workers, setWorkers] = useState<any[]>([])
  const [workerRoutes, setWorkerRoutes] = useState<any[]>([])

  // Form for creating a new route binding
  const [newRoutePattern, setNewRoutePattern] = useState(domain ? `api.${domain}/*` : "")
  const [newRouteScript, setNewRouteScript] = useState("")
  const [isBindingRoute, setIsBindingRoute] = useState(false)
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null)

  // Copy guide state
  const [copiedCli, setCopiedCli] = useState(false)

  const loadData = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const token = await getIdToken()

      // 1. Account Workers
      const workersRes = await getAccountWorkers(token, orgId)
      if (workersRes.success && Array.isArray(workersRes.data)) {
        setWorkers(workersRes.data)
        if (workersRes.data.length > 0 && !newRouteScript) {
          setNewRouteScript(workersRes.data[0].id || workersRes.data[0].tag || "")
        }
      }

      // 2. Zone Worker Routes
      if (zoneId) {
        const routesRes = await getZoneWorkerRoutes(token, orgId, zoneId)
        if (routesRes.success && Array.isArray(routesRes.data)) {
          setWorkerRoutes(routesRes.data)
        }
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setLoading(false)
    }
  }, [zoneId, orgId, getIdToken, newRouteScript])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (domain && !newRoutePattern) {
      setNewRoutePattern(`api.${domain}/*`)
    }
  }, [domain, newRoutePattern])

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!zoneId || !orgId || !newRoutePattern || !newRouteScript) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please specify both the route pattern and worker script name.",
      })
      return
    }

    setIsBindingRoute(true)
    try {
      const token = await getIdToken()
      const res = await createZoneWorkerRoute(
        token,
        orgId,
        zoneId,
        newRoutePattern.trim(),
        newRouteScript.trim()
      )

      if (res.success) {
        toast({
          title: "Worker Route Bound",
          description: `Bound ${newRoutePattern} to worker "${newRouteScript}".`,
        })
        loadData()
      } else {
        toast({
          variant: "destructive",
          title: "Binding Failed",
          description: res.error || "Could not bind route to worker script.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Binding Failed",
        description: err.message,
      })
    } finally {
      setIsBindingRoute(false)
    }
  }

  const handleDeleteRoute = async (routeId: string) => {
    if (!zoneId || !orgId || !routeId) return
    setDeletingRouteId(routeId)
    try {
      const token = await getIdToken()
      const res = await deleteZoneWorkerRoute(token, orgId, zoneId, routeId)
      if (res.success) {
        setWorkerRoutes((prev) => prev.filter((r) => r.id !== routeId))
        toast({
          title: "Route Binding Removed",
          description: "Traffic to this pattern will no longer trigger the worker.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Delete Failed",
          description: res.error || "Could not delete route binding.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: err.message,
      })
    } finally {
      setDeletingRouteId(null)
    }
  }

  const copyCliSnippet = () => {
    const text = `# 1. Scaffold or navigate into your project
npm create cloudflare@latest

# 2. Test locally with zero latency
npx wrangler dev

# 3. Deploy instantly to 330+ global cities
npx wrangler deploy`
    navigator.clipboard.writeText(text)
    setCopiedCli(true)
    toast({ title: "Copied CLI Commands", description: "Ready to run in your terminal." })
    setTimeout(() => setCopiedCli(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Overview Card */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              Serverless Edge Hosting &amp; Workers
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Run serverless JavaScript, TypeScript, and WASM across Cloudflare edge nodes globally with 0 cold starts.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-bold text-slate-900">0ms Cold Starts</p>
              <p className="text-[11px] text-slate-500 mt-1">
                V8 isolates boot in under 5 milliseconds worldwide, 50x faster than legacy container runtimes.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-bold text-slate-900">330+ Edge Cities</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Code deploys automatically to every major global metro within 15 seconds of running deploy.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-bold text-slate-900">Sub-10ms Latency</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Terminates TLS and executes logic within 50ms of 95% of the world&apos;s connected population.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Domain Route Bindings Manager */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              Domain Route Bindings
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Bind subdomains or URL patterns on <strong>{domain || "your domain"}</strong> directly to your serverless Workers scripts.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Form to bind a new route */}
          <form
            onSubmit={handleCreateRoute}
            className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-4"
          >
            <p className="text-xs font-bold text-slate-900">Bind New Route to Edge Worker</p>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6 space-y-1">
                <Label htmlFor="route-pattern" className="text-xs text-slate-700">
                  Route Pattern
                </Label>
                <Input
                  id="route-pattern"
                  placeholder={domain ? `api.${domain}/* or ${domain}/auth/*` : "api.domain.com/*"}
                  value={newRoutePattern}
                  onChange={(e) => setNewRoutePattern(e.target.value)}
                  className="h-9 text-xs font-mono bg-white border-slate-200"
                />
              </div>

              <div className="sm:col-span-4 space-y-1">
                <Label htmlFor="route-script" className="text-xs text-slate-700">
                  Target Worker Script
                </Label>
                {workers.length > 0 ? (
                  <select
                    id="route-script"
                    value={newRouteScript}
                    onChange={(e) => setNewRouteScript(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
                  >
                    {workers.map((w) => {
                      const name = w.id || w.tag || "worker"
                      return (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      )
                    })}
                  </select>
                ) : (
                  <Input
                    id="route-script"
                    placeholder="my-worker-script"
                    value={newRouteScript}
                    onChange={(e) => setNewRouteScript(e.target.value)}
                    className="h-9 text-xs font-mono bg-white border-slate-200"
                  />
                )}
              </div>

              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  disabled={isBindingRoute || !newRoutePattern || !newRouteScript}
                  className="w-full h-9 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg gap-1.5"
                >
                  {isBindingRoute ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Bind Route</span>
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Matches incoming requests (e.g., wildcard <code>{`api.${domain || "yourdomain.com"}/*`}</code>) and routes execution to the specified script.
            </p>
          </form>

          {/* List of active bindings */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-800">Active Domain Bindings</p>
            {workerRoutes.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-500">
                No custom domain route bindings found for {domain || "this zone"}. Add one above to handle API requests or edge rendering.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {workerRoutes.map((route) => (
                  <div
                    key={route.id}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {route.pattern}
                        </span>
                        <CornerDownRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-xs font-semibold text-slate-800">
                          {route.script || "worker"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Route ID: {route.id}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteRoute(route.id)}
                      disabled={deletingRouteId === route.id}
                      className="border-slate-200 text-red-600 hover:bg-red-50 hover:text-red-700 text-xs h-8 gap-1.5 rounded-lg shrink-0"
                    >
                      {deletingRouteId === route.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span>Remove</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. Wrangler Terminal CLI Deployment Guide */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              Deploy from your Terminal (Wrangler CLI)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Deploy code, test locally, and stream live production error logs directly from your command line.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyCliSnippet}
            className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-black text-xs h-8 gap-1.5 rounded-lg shrink-0"
          >
            {copiedCli ? (
              <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedCli ? "Copied" : "Copy CLI Commands"}</span>
          </Button>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="p-4 bg-slate-950 text-slate-100 rounded-xl font-mono text-xs space-y-2 border border-slate-800">
            <p className="text-slate-500 text-[11px] font-sans"># 1. Initialize or choose a template (Hono, Remix, Next, Express)</p>
            <p className="text-emerald-400">npm create cloudflare@latest</p>
            <div className="h-1" />
            <p className="text-slate-500 text-[11px] font-sans"># 2. Start instantaneous local development with hot reload</p>
            <p className="text-amber-300">npx wrangler dev</p>
            <div className="h-1" />
            <p className="text-slate-500 text-[11px] font-sans"># 3. Ship to global production in under 15 seconds</p>
            <p className="text-blue-400">npx wrangler deploy</p>
            <div className="h-1" />
            <p className="text-slate-500 text-[11px] font-sans"># 4. Stream real-time edge execution logs &amp; exceptions</p>
            <p className="text-purple-400">npx wrangler tail</p>
          </div>

          <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 text-xs text-blue-900">
            <span className="font-semibold text-blue-950">Wrangler Configuration (wrangler.json / wrangler.toml):</span>
            <p className="text-blue-900/90 text-[11px] leading-relaxed mt-1">
              Add <code>routes = [{`{ pattern = "api.${domain || "yourdomain.com"}/*", zone_name = "${domain || "yourdomain.com"}" }`}]</code> directly inside your <code>wrangler.json</code> to automate binding synchronization during CI/CD.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
