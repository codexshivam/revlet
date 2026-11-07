"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Server,
  Zap,
  Lock,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Globe,
  ArrowRight,
  ShieldAlert,
} from "lucide-react"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useAuth } from "@/firebase"

// Modular Domain Infrastructure Tabs
import { SpeedCacheTab } from "@/components/infrastructure/speed-cache-tab"
import { SslEncryptionTab } from "@/components/infrastructure/ssl-encryption-tab"
import { DdosProtectionTab } from "@/components/infrastructure/ddos-protection-tab"
import { EdgeHostingTab } from "@/components/infrastructure/edge-hosting-tab"

export default function InfrastructurePage() {
  const { activeOrg } = useActiveOrg()
  const auth = useAuth()

  const zoneId = activeOrg?.cloudflareZoneId
  const domain = activeOrg?.domain

  // Tab State: speed | ssl | security | hosting
  const [activeTab, setActiveTab] = useState("speed")
  const [refreshKey, setRefreshKey] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const getIdToken = useCallback(async () => {
    if (!auth?.currentUser) throw new Error("Authentication required")
    return await auth.currentUser.getIdToken()
  }, [auth])

  const handleRefresh = () => {
    setIsRefreshing(true)
    setRefreshKey((prev) => prev + 1)
    setTimeout(() => setIsRefreshing(false), 600)
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
                <Badge
                  variant="outline"
                  className="ml-2 font-mono text-[11px] font-medium bg-slate-50 border-slate-200 text-slate-700"
                >
                  {domain}
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-normal">
              Manage your domain&apos;s edge infrastructure: Instant cache purge, SSL/TLS encryption, DDoS emergency defense, and serverless hosting directly from Revlet.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Edge Operational</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-black text-xs h-9 gap-1.5 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Refresh Edge</span>
            </Button>

            <Link href="/services/domains">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-black text-xs h-9 gap-1.5 rounded-lg transition-colors"
              >
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                <span>DNS Manager</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* The 4 Essential Domain Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100/90 p-1 rounded-xl grid grid-cols-2 sm:grid-cols-4 w-full h-auto gap-1 border border-slate-200/60">
            <TabsTrigger
              value="speed"
              className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Speed &amp; Cache</span>
            </TabsTrigger>
            <TabsTrigger
              value="ssl"
              className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>SSL &amp; Encryption</span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
              <span>DDoS &amp; Protection</span>
            </TabsTrigger>
            <TabsTrigger
              value="hosting"
              className="gap-2 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              <span>Edge Hosting &amp; Workers</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SPEED & EDGE CACHE */}
          <TabsContent value="speed" className="space-y-6">
            <SpeedCacheTab
              key={`speed-${refreshKey}`}
              zoneId={zoneId}
              domain={domain}
              orgId={activeOrg?.id}
              getIdToken={getIdToken}
            />
          </TabsContent>

          {/* TAB 2: SSL & ENCRYPTION */}
          <TabsContent value="ssl" className="space-y-6">
            <SslEncryptionTab
              key={`ssl-${refreshKey}`}
              zoneId={zoneId}
              domain={domain}
              orgId={activeOrg?.id}
              getIdToken={getIdToken}
            />
          </TabsContent>

          {/* TAB 3: DDOS & DEFENSE */}
          <TabsContent value="security" className="space-y-6">
            <DdosProtectionTab
              key={`ddos-${refreshKey}`}
              zoneId={zoneId}
              domain={domain}
              orgId={activeOrg?.id}
              getIdToken={getIdToken}
            />
          </TabsContent>

          {/* TAB 4: EDGE HOSTING & WORKERS */}
          <TabsContent value="hosting" className="space-y-6">
            <EdgeHostingTab
              key={`hosting-${refreshKey}`}
              zoneId={zoneId}
              domain={domain}
              orgId={activeOrg?.id}
              getIdToken={getIdToken}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  )
}
