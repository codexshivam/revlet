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
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="min-h-screen h-[100dvh] w-full flex items-center justify-center bg-white px-6 select-none"
    >
      <img
        src="/logo-4k.png"
        alt="Revlet"
        className="h-20 sm:h-24 w-auto max-w-[82vw] object-contain select-none"
      />
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
  const { orgs, setActiveOrgId, routeOrgKey, isRouteOrgResolving, isRouteOrgUnavailable, error: orgsError, loading: orgsLoading, refreshOrgs } = useActiveOrg()
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

  const [mfaCheckError, setMfaCheckError] = React.useState<string | null>(null)

  const verifyMfa = React.useCallback(
    (activeUser: NonNullable<typeof user>, isCancelled: () => boolean) => {
      setMfaCheckError(null)
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
          // Fail closed with a retryable error screen on verification service failure
          // (avoids login <-> dashboard redirect loops while never bypassing MFA).
          if (!data || !data.ok) {
            verifiedMfaUids.delete(activeUser.uid)
            setMfaAllowed(false)
            setMfaCheckError("Unable to verify your 2-Step Verification session. Please retry.")
            return
          }
          if (data.hasEnrolledMfa && !data.mfaSessionVerified) {
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
          if (!isCancelled()) {
            verifiedMfaUids.delete(activeUser.uid)
            setMfaAllowed(false)
            setMfaCheckError("Network error while verifying 2-Step Verification. Please retry.")
          }
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

  if (mfaCheckError && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full rounded-xl border border-slate-200 bg-white p-6 space-y-4 text-center">
          <h2 className="text-sm font-semibold text-slate-900">Security Check Unavailable</h2>
          <p className="text-xs text-slate-600">{mfaCheckError}</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => verifyMfa(user, () => false)}
              className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
            >
              Retry Verification
            </button>
            <button
              type="button"
              onClick={() => router.replace(buildLoginRedirect(true))}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50"
            >
              Sign In Again
            </button>
          </div>
        </div>
      </div>
    )
  }

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
                {orgsError && (routeOrgKey || pathname === "/account/home" || pathname.startsWith("/services/")) ? (
                  <div role="alert" className="mx-auto my-12 max-w-lg space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-center">
                    <h1 className="text-base font-semibold text-slate-900">Organizations unavailable</h1>
                    <p className="text-sm text-slate-600">{orgsError}</p>
                    <button
                      type="button"
                      disabled={orgsLoading}
                      className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => void refreshOrgs()}
                    >
                      {orgsLoading ? "Trying again…" : "Try again"}
                    </button>
                  </div>
                ) : isRouteOrgResolving ? (
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
                          href="/account/home"
                          onClick={() => setActiveOrgId(orgs[0].id)}
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
                href: "/account/home",
                active: pathname === "/account/home" || /^\/orgs\/[^/]+\/overview/.test(pathname || ""),
              },
              {
                label: "DNS",
                icon: Globe,
                href: "/services/dns",
                active: (pathname || "").includes("/dns"),
              },
              {
                label: "Email",
                icon: Mail,
                href: "/services/email",
                active: (pathname || "").includes("/email"),
              },
              {
                label: "Team",
                icon: Users,
                href: "/management/team",
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
