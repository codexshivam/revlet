"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useAuth } from "@/firebase"
import { Globe, Server } from "lucide-react"

// Modular Domain Infrastructure Tabs
import { SpeedCacheTab } from "@/components/infrastructure/speed-cache-tab"
import { SslEncryptionTab } from "@/components/infrastructure/ssl-encryption-tab"
import { DdosProtectionTab } from "@/components/infrastructure/ddos-protection-tab"

export default function InfrastructurePage() {
  const { activeOrg, loading: isLoadingOrgs } = useActiveOrg()
  const auth = useAuth()

  const zoneId = activeOrg?.cloudflareZoneId
  const domain = activeOrg?.domain

  const [activeTab, setActiveTab] = useState("speed")

  const getIdToken = useCallback(async () => {
    if (!auth?.currentUser) throw new Error("Authentication required")
    return await auth.currentUser.getIdToken()
  }, [auth])

  // STATE 1: Loading organization context
  if (isLoadingOrgs && !activeOrg) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-10 w-full max-w-md rounded-lg" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
            <Skeleton className="h-60 w-full rounded-xl" />
          </div>
        </div>
      </DashboardShell>
    )
  }

  // STATE 2: No active organization found
  if (!activeOrg) {
    return (
      <DashboardShell>
        <Card className="bg-white border-slate-200 border-dashed shadow-none rounded-xl py-12 max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center text-center gap-4">
            <div className="p-3 bg-slate-50 rounded-full border border-slate-100 text-slate-400">
              <Server className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">No Organization Selected</h3>
              <p className="text-xs text-slate-500">
                To manage edge infrastructure, register an organization on the account home screen.
              </p>
            </div>
            <Link href="/account/home">
              <Button className="h-9 px-4 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none">
                Go to Account Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </DashboardShell>
    )
  }

  // STATE 3: DNS edge configuration not active for organization
  if (!zoneId) {
    return (
      <DashboardShell>
        <Card className="bg-white border-slate-200 border-dashed shadow-none rounded-xl py-12 max-w-lg mx-auto">
          <CardContent className="flex flex-col items-center text-center gap-4">
            <div className="p-3 bg-slate-50 rounded-full border border-slate-100 text-slate-400">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">DNS Configuration Required</h3>
              <p className="text-xs text-slate-500">
                Domain edge infrastructure requires an active DNS configuration. Configure DNS management for your domain to continue.
              </p>
            </div>
            <Link href="/services/dns">
              <Button className="h-9 px-4 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none">
                Go to DNS Management
              </Button>
            </Link>
          </CardContent>
        </Card>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-300">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              Infrastructure
            </h1>
            <p className="text-sm text-slate-500">
              Edge routing, caching, TLS encryption, and DDoS defense controls for {domain}.
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100 p-1 rounded-lg grid grid-cols-1 sm:grid-cols-3 max-w-md w-full h-auto gap-1 border border-slate-200">
            <TabsTrigger
              value="speed"
              className="py-1.5 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              Speed &amp; Cache
            </TabsTrigger>
            <TabsTrigger
              value="ssl"
              className="py-1.5 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              SSL &amp; Encryption
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="py-1.5 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs transition-all"
            >
              DDoS &amp; Defense
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
