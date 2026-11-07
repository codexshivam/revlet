"use client"

import { useState, useCallback } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { RefreshCw } from "lucide-react"
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
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Page Header (Consistent with DNS Management, Email Service, and Website Management) */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="text-3xl font-headline font-bold text-slate-900">
              Infrastructure
            </h1>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end sm:justify-start">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-10 font-bold text-xs border-slate-200 hover:bg-slate-100 hover:text-black gap-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Refresh Edge</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Essential Domain Infrastructure Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100 p-1 rounded-xl grid grid-cols-2 sm:grid-cols-4 w-full h-auto gap-1 border border-slate-200/60">
            <TabsTrigger
              value="speed"
              className="py-2.5 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              Speed &amp; Cache
            </TabsTrigger>
            <TabsTrigger
              value="ssl"
              className="py-2.5 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              SSL &amp; Encryption
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="py-2.5 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              DDoS &amp; Protection
            </TabsTrigger>
            <TabsTrigger
              value="hosting"
              className="py-2.5 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              Edge Hosting &amp; Workers
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
