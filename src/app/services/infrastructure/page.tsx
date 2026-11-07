"use client"

import { useState, useCallback } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useAuth } from "@/firebase"

// Modular Domain Infrastructure Tabs
import { SpeedCacheTab } from "@/components/infrastructure/speed-cache-tab"
import { SslEncryptionTab } from "@/components/infrastructure/ssl-encryption-tab"
import { DdosProtectionTab } from "@/components/infrastructure/ddos-protection-tab"

export default function InfrastructurePage() {
  const { activeOrg } = useActiveOrg()
  const auth = useAuth()

  const zoneId = activeOrg?.cloudflareZoneId
  const domain = activeOrg?.domain

  // Tab State: speed | ssl | security
  const [activeTab, setActiveTab] = useState("speed")

  const getIdToken = useCallback(async () => {
    if (!auth?.currentUser) throw new Error("Authentication required")
    return await auth.currentUser.getIdToken()
  }, [auth])

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-headline font-bold text-slate-900">
            Infrastructure
          </h1>
        </div>

        {/* Essential Domain Infrastructure Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100 p-1 rounded-xl grid grid-cols-1 sm:grid-cols-3 w-full h-auto gap-1 border border-slate-200/60">
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
          </TabsList>

          {/* TAB 1: SPEED & EDGE CACHE */}
          <TabsContent value="speed" className="space-y-6">
            <SpeedCacheTab
              zoneId={zoneId}
              domain={domain}
              orgId={activeOrg?.id}
              getIdToken={getIdToken}
            />
          </TabsContent>

          {/* TAB 2: SSL & ENCRYPTION */}
          <TabsContent value="ssl" className="space-y-6">
            <SslEncryptionTab
              zoneId={zoneId}
              domain={domain}
              orgId={activeOrg?.id}
              getIdToken={getIdToken}
            />
          </TabsContent>

          {/* TAB 3: DDOS & DEFENSE */}
          <TabsContent value="security" className="space-y-6">
            <DdosProtectionTab
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
