"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { LayoutDashboard, Globe, Mail, Users, WifiOff } from "lucide-react"
import { RecursiveSidebar } from "@/components/layout/recursive-sidebar"
import { TopHeader } from "@/components/layout/top-header"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase"
import { useActiveOrg } from "@/hooks/use-active-org"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

const CommandPalette = dynamic(
  () => import("@/components/layout/command-palette").then((mod) => mod.CommandPalette),
  { ssr: false }
)

const InsidePersistentShellContext = React.createContext(false)

const verifiedMfaUids = new Set<string>()

function isMfaCachedForUser(uid: string): boolean {
  if (verifiedMfaUids.has(uid)) return true
  if (typeof window !== "undefined") {
    try {
      return sessionStorage.getItem("revlet_mfa_verified_uid") === uid
    } catch {
      return false
    }
  }
  return false
}

function cacheMfaForUser(uid: string) {
  verifiedMfaUids.add(uid)
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem("revlet_mfa_verified_uid", uid)
    } catch {
      // ignore
    }
  }
}

function WorkspaceSkeleton() {
  const [showProgress, setShowProgress] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => setShowProgress(true), 150)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Opening workspace"
      className="h-screen h-[100dvh] w-full flex flex-col bg-slate-50 overflow-hidden select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="h-0.5 w-full bg-transparent overflow-hidden shrink-0">
        {showProgress && (
          <div className="h-full w-1/3 bg-zinc-900/70 motion-reduce:hidden animate-[pulse_1.2s_ease-in-out_infinite]" />
        )}
      </div>
      <div className="flex-1 flex min-h-0">
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 gap-3">
          <div className="h-8 w-28 rounded-lg bg-slate-200/70" />
          <div className="space-y-2 mt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 w-full rounded-lg bg-slate-100" />
            ))}
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 shrink-0 border-b border-slate-200 bg-white px-4 flex items-center justify-between">
            <div className="h-7 w-40 rounded-md bg-slate-100" />
            <div className="flex items-center gap-3">
              {showProgress && (
                <span aria-live="polite" className="text-xs text-slate-500 font-medium">
                  Opening workspace…
                </span>
              )}
              <div className="h-8 w-8 rounded-full bg-slate-200" />
            </div>
          </header>
          <div className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-5">
            <div className="h-8 w-56 rounded-lg bg-slate-200/70" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl border border-slate-200 bg-white" />
              ))}
            </div>
            <div className="h-64 rounded-xl border border-slate-200 bg-white" />
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardShellInner({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { user, loading } = useUser()
  const { activeOrg, orgs, routeOrgKey, isRouteOrgResolving, isRouteOrgUnavailable } = useActiveOrg()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [mfaAllowed, setMfaAllowed] = React.useState(() =>
    user ? isMfaCachedForUser(user.uid) : false
  )
  const [isOffline, setIsOffline] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    setIsOffline(!navigator.onLine)
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  const buildLoginRedirect = React.useCallback(
    (mfaRequired = false) => {
      const qs = searchParams?.toString()
      const rawReturn = pathname && pathname.startsWith("/") ? `${pathname}${qs ? `?${qs}` : ""}` : "/account/home"
      const safeReturn =
        rawReturn.startsWith("/") && !rawReturn.startsWith("//") && !rawReturn.startsWith("/login")
          ? rawReturn
          : "/account/home"
      const params = new URLSearchParams()
      if (mfaRequired) params.set("mfa", "1")
      if (safeReturn !== "/account/home") params.set("next", safeReturn)
      const qStr = params.toString()
      return qStr ? `/login?${qStr}` : "/login"
    },
    [pathname, searchParams]
  )

  const verifyMfa = React.useCallback(
    (activeUser: NonNullable<typeof user>, isCancelled: () => boolean) => {
      activeUser
        .getIdToken()
        .then((token) =>
          fetch("/api/auth/mfa", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          })
        )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (isCancelled()) return
          if (data?.ok && data.hasEnrolledMfa && !data.mfaSessionVerified) {
            verifiedMfaUids.delete(activeUser.uid)
            if (typeof window !== "undefined") {
              try {
                sessionStorage.removeItem("revlet_mfa_verified_uid")
              } catch {
                // ignore
              }
            }
            router.replace(buildLoginRedirect(true))
            return
          }
          cacheMfaForUser(activeUser.uid)
          setMfaAllowed(true)
        })
        .catch(() => {
          if (!isCancelled()) setMfaAllowed(true)
        })
    },
    [router, buildLoginRedirect]
  )

  React.useEffect(() => {
    if (!loading && !user) {
      if (typeof document !== "undefined") {
        document.cookie = "revlet_session_hint=; path=/; max-age=0; samesite=lax"
      }
      router.replace(buildLoginRedirect(false))
      return
    }
    if (!loading && user) {
      if (typeof document !== "undefined") {
        document.cookie = "revlet_session_hint=1; path=/; max-age=2592000; samesite=lax"
      }
      if (isMfaCachedForUser(user.uid)) {
        setMfaAllowed(true)
      }
      let cancelled = false
      verifyMfa(user, () => cancelled)

      // Recheck authorization if browser restores a protected page from bfcache
      const handlePageShow = (event: PageTransitionEvent) => {
        if (event.persisted && !cancelled) {
          verifyMfa(user, () => cancelled)
        }
      }
      window.addEventListener("pageshow", handlePageShow)
      return () => {
        cancelled = true
        window.removeEventListener("pageshow", handlePageShow)
      }
    }
  }, [user, loading, router, buildLoginRedirect, verifyMfa])

  if (loading || !user || !mfaAllowed) {
    return <WorkspaceSkeleton />
  }

  return (
    <InsidePersistentShellContext.Provider value={true}>
      <div className="h-screen h-[100dvh] w-full flex bg-slate-50 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3.5 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-white focus:text-xs focus:font-medium focus:shadow-md focus:outline-none"
        >
          Skip to main content
        </a>
        <CommandPalette />
        <RecursiveSidebar />
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 h-full overflow-hidden">
          <TopHeader />
          {isOffline && (
            <div
              role="status"
              aria-live="polite"
              className="bg-zinc-900 text-white px-4 py-2 text-xs flex items-center justify-between gap-3 shrink-0"
            >
              <span className="flex items-center gap-2">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                You appear to be offline. Changes may not save until reconnected.
              </span>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-2.5 py-1 rounded bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
              >
                Retry
              </button>
            </div>
          )}
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 focus:outline-none"
          >
            <div
              className={cn(
                "p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 min-h-[calc(100dvh-3.5rem)] flex flex-col pb-20 md:pb-8",
                className
              )}
            >
              <div className="space-y-6 sm:space-y-8 flex-1 animate-fade-up-in motion-reduce:animate-none">
                {isRouteOrgResolving ? (
                  <div className="space-y-4 py-6">
                    <div className="h-7 w-48 rounded bg-slate-200/80" />
                    <div className="h-36 w-full rounded-xl border border-slate-200 bg-white" />
                  </div>
                ) : isRouteOrgUnavailable ? (
                  <div className="max-w-lg mx-auto my-12 rounded-xl border border-slate-200 bg-white p-6 text-center space-y-4">
                    <div className="space-y-1.5">
                      <h1 className="text-base font-semibold text-slate-900">
                        Workspace unavailable
                      </h1>
                      <p className="text-sm text-slate-600">
                        You do not have access to workspace <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{routeOrgKey}</span>, or it no longer exists.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      {orgs[0] ? (
                        <Link
                          href={`/orgs/${encodeURIComponent(orgs[0].id)}/overview`}
                          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
                        >
                          Open {orgs[0].name || orgs[0].domain}
                        </Link>
                      ) : null}
                      <Link
                        href="/account/home"
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Go to Account Home
                      </Link>
                    </div>
                  </div>
                ) : (
                  children
                )}
              </div>
            </div>
          </main>
          {/* Compact mobile bottom navigation bar (44px+ touch targets) */}
          <nav
            aria-label="Mobile workspace navigation"
            className="md:hidden shrink-0 border-t border-slate-200 bg-white grid grid-cols-4 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
          >
            {[
              {
                label: "Overview",
                icon: LayoutDashboard,
                href: activeOrg?.id ? `/orgs/${encodeURIComponent(activeOrg.id)}/overview` : "/account/home",
                active: pathname === "/account/home" || /^\/orgs\/[^/]+\/overview/.test(pathname || ""),
              },
              {
                label: "DNS",
                icon: Globe,
                href: activeOrg?.id ? `/orgs/${encodeURIComponent(activeOrg.id)}/dns` : "/services/dns",
                active: (pathname || "").includes("/dns"),
              },
              {
                label: "Email",
                icon: Mail,
                href: activeOrg?.id ? `/orgs/${encodeURIComponent(activeOrg.id)}/email/users` : "/services/email",
                active: (pathname || "").includes("/email"),
              },
              {
                label: "Team",
                icon: Users,
                href: activeOrg?.id ? `/orgs/${encodeURIComponent(activeOrg.id)}/team` : "/management/team",
                active: (pathname || "").includes("/team") || (pathname || "").includes("/settings"),
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors",
                  item.active ? "text-slate-950 font-semibold" : "text-slate-500 hover:text-slate-900"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </InsidePersistentShellContext.Provider>
  )
}

export function DashboardShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const insidePersistentShell = React.useContext(InsidePersistentShellContext)
  if (insidePersistentShell) {
    return <>{children}</>
  }
  return (
    <React.Suspense fallback={<WorkspaceSkeleton />}>
      <DashboardShellInner className={className}>{children}</DashboardShellInner>
    </React.Suspense>
  )
}

const PERSISTENT_WORKSPACE_PREFIXES = ["/orgs", "/account", "/services", "/management"]

/**
 * Mounts one persistent DashboardShell across Revlet workspace routes
 * (/account/*, /services/*, /management/*) so sidebar, header, and org state
 * stay mounted while switching between Home, DNS, Email, Team, and Settings.
 */
export function PersistentWorkspaceFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isWorkspaceRoute = Boolean(
    pathname &&
      PERSISTENT_WORKSPACE_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      )
  )

  if (!isWorkspaceRoute) {
    return <>{children}</>
  }

  return <DashboardShell>{children}</DashboardShell>
}
