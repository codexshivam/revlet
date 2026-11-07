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

  // Tab State: speed | ssl | security
  const [activeTab, setActiveTab] = useState("speed")

  const getIdToken = useCallback(async () => {
    if (!auth?.currentUser) throw new Error("Authentication required")
    return await auth.currentUser.getIdToken()
  }, [auth])

  // STATE 1: Loading organization context
  if (isLoadingOrgs) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-11 w-full rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </DashboardShell>
    )
  }

  // STATE 2: No active organization found
  if (!activeOrg) {
    return (
      <DashboardShell>
        <div className="max-w-xl mx-auto py-16 animate-in slide-in-from-bottom-4 duration-500">
          <Card className="border-dashed border-2 border-slate-200 bg-white/50 text-center p-8">
            <CardContent className="space-y-4 pt-4">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <Server className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-headline font-bold text-slate-900">No Organization Selected</h3>
                <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                  To manage domain infrastructure, you must first register your organization on the Account Home screen.
                </p>
              </div>
              <Link href="/account/home">
                <Button className="font-bold gap-2 h-11 px-6 bg-slate-900 hover:bg-black text-white transition-all shadow-md">
                  Go to Account Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

  // STATE 3: DNS edge configuration not active for organization
  if (!zoneId) {
    return (
      <DashboardShell>
        <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
          <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
            <CardContent className="p-16 flex flex-col items-center text-center gap-6">
              <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                <Globe className="w-10 h-10 text-slate-300 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-headline font-bold text-slate-900">DNS Management Required</h3>
                <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                  Domain infrastructure requires an active domain configuration. Please activate DNS management for your organization first.
                </p>
              </div>
              <Link href="/services/dns">
                <Button className="font-bold gap-2 h-11 px-6 bg-slate-900 hover:bg-black text-white transition-all shadow-md">
                  Go to DNS Management
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

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
