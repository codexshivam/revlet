"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, or, getDocs, onSnapshot } from "firebase/firestore"
import { checkAndClaimInvitations } from "@/app/actions/team"
import { legacyWorkspaceDestination } from "@/lib/org-routes"

export interface Organization {
  id: string
  name: string
  domain: string
  code: string
  address?: string
  phone?: string
  currentEmail?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  description?: string
  ownerId: string
  ownerName?: string
  memberEmails?: string[]
  memberPermissions?: Record<string, string[]>
  status?: string
  dnsRequested?: boolean
  cloudflareZoneId?: string
  cloudflareZoneName?: string
  cloudflareTokenMasked?: string
  cloudflareTokenVerifiedAt?: string
  cloudflareTokenExpiresOn?: string | null
  cloudflareTokenScopedZone?: string
  emailServiceActive?: boolean
  mailServiceActive?: boolean
  mailMonthlyLimit?: number
  mailDailyLimit?: number
  mailMonthlySent?: number
  mailDailySent?: number
  mailCatchAllUserId?: string | null
  mailCatchAllEmail?: string | null
  mailDkimTokens?: string[]
  mailDkimMode?: 'byodkim' | 'easydkim'
  mailDkimSelector?: string
  mailDkimPublicKey?: string
  createdAt?: any
  updatedAt?: any
}

interface OrgContextType {
  orgs: Organization[]
  activeOrg: Organization | undefined
  activeOrgId: string
  setActiveOrgId: (id: string) => void
  refreshOrgs: () => Promise<void>
  loading: boolean
  error: string | null
  routeOrgKey: string | null
  isRouteOrgResolving: boolean
  isRouteOrgUnavailable: boolean
}

const OrgContext = createContext<OrgContextType | null>(null)

function getTabStorageKey(uid: string | null | undefined): string {
  return uid ? `revlet_active_org:${uid}` : "selectedOrgId"
}

function readTabActiveOrgId(uid: string | null | undefined): string {
  if (typeof window === "undefined") return ""
  if (uid) {
    const perTab = sessionStorage.getItem(getTabStorageKey(uid))
    if (perTab) return perTab
  }
  return localStorage.getItem("selectedOrgId") || ""
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: userLoading } = useUser()
  const db = useFirestore()
  const pathname = usePathname()
  const router = useRouter()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string>(() => readTabActiveOrgId(null))
  const [loading, setLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)
  const claimedUidRef = useRef<string | null>(null)

  const fetchOrgs = useCallback(async () => {
    if (userLoading) {
      setLoading(true)
      return
    }

    if (!user) {
      setOrgs([])
      setActiveOrgId("")
      setOrgsError(null)
      setLoading(false)
      claimedUidRef.current = null
      return
    }

    setLoading(true)
    setOrgsError(null)
    try {
      const normalizedEmail = user.email?.toLowerCase().trim() || ""
      const q = query(
        collection(db, "organizations"),
        or(
          where("ownerId", "==", user.uid),
          where("memberIds", "array-contains", user.uid),
          ...(normalizedEmail ? [where("memberEmails", "array-contains", normalizedEmail)] : [])
        )
      )
      const snap = await getDocs(q)
      const fetched = (snap.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((o: any) => o.status !== "Pending Deletion") as Organization[]).sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0
          const timeB = b.createdAt?.toMillis?.() || 0
          return timeB - timeA
        })

      setOrgs(fetched)

      const storedId = readTabActiveOrgId(user.uid)
      const found = fetched.find((o) => o.id === storedId)

      if (found) {
        setActiveOrgId(found.id)
      } else if (fetched.length > 0) {
        setActiveOrgId(fetched[0].id)
        if (typeof window !== "undefined") {
          sessionStorage.setItem(getTabStorageKey(user.uid), fetched[0].id)
        }
      } else {
        setActiveOrgId("")
      }
    } catch (error: any) {
      console.error("Error fetching organizations:", error)
      setOrgs([])
      setOrgsError(error?.message || "Failed to load organizations.")
    } finally {
      setLoading(false)
    }
  }, [user, userLoading, db])

  useEffect(() => {
    if (userLoading) {
      setLoading(true)
      return
    }
    if (!user) {
      setOrgs([])
      setActiveOrgId("")
      setLoading(false)
      claimedUidRef.current = null
      return
    }

    let active = true
    const currentUid = user.uid
    // Invitations are explicitly accepted via /invite/[token] — never silently claimed in the background.
    const inviteTimer: ReturnType<typeof setTimeout> | null = null

    const normalizedEmail = user.email?.toLowerCase().trim() || ""
    const q = query(
      collection(db, "organizations"),
      or(
        where("ownerId", "==", user.uid),
        where("memberIds", "array-contains", user.uid),
        ...(normalizedEmail ? [where("memberEmails", "array-contains", normalizedEmail)] : [])
      )
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!active) return
        setOrgsError(null)
        const fetched = (snap.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((o: any) => o.status !== "Pending Deletion") as Organization[]).sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0
            const timeB = b.createdAt?.toMillis?.() || 0
            return timeB - timeA
          })

        setOrgs(fetched)

        const storedId = readTabActiveOrgId(user.uid)
        const found = fetched.find((o) => o.id === storedId)
        if (found) {
          setActiveOrgId(found.id)
        } else if (fetched.length > 0) {
          setActiveOrgId(fetched[0].id)
          if (typeof window !== "undefined") {
            sessionStorage.setItem(getTabStorageKey(user.uid), fetched[0].id)
          }
        } else {
          setActiveOrgId("")
        }
        setLoading(false)
      },
      (error) => {
        if (!active) return
        console.error("Error listening to organizations:", error)
        fetchOrgs()
      }
    )

    if (typeof window !== "undefined") {
      window.addEventListener("revlet-orgs-refresh", fetchOrgs)
    }
    return () => {
      active = false
      if (inviteTimer) clearTimeout(inviteTimer)
      unsubscribe()
      if (typeof window !== "undefined") {
        window.removeEventListener("revlet-orgs-refresh", fetchOrgs)
      }
    }
  }, [user, userLoading, db, fetchOrgs])

  // Keep active workspace scoped to this tab only (do not listen to cross-tab storage events)
  useEffect(() => {
    const handleOrgChanged = () => {
      const storedId = readTabActiveOrgId(user?.uid)
      if (storedId && storedId !== activeOrgId) {
        setActiveOrgId(storedId)
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("active-org-changed", handleOrgChanged)
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("active-org-changed", handleOrgChanged)
      }
    }
  }, [activeOrgId, user?.uid])

  // Synchronously derive route-scoped workspace key from /orgs/[orgKey]/*
  const routeOrgKey = useMemo(() => {
    if (!pathname) return null
    const match = pathname.match(/^\/orgs\/([^/]+)(?:\/|$)/)
    if (!match) return null
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }, [pathname])

  const routeMatchedOrg = useMemo(() => {
    if (!routeOrgKey) return undefined
    return orgs.find(
      (o) => o.id === routeOrgKey || (o.code && o.code.toLowerCase() === routeOrgKey.toLowerCase())
    )
  }, [routeOrgKey, orgs])

  const isRouteOrgResolving = Boolean(routeOrgKey && loading && !routeMatchedOrg)
  const isRouteOrgUnavailable = Boolean(routeOrgKey && !loading && !routeMatchedOrg)

  // Keep persisted last-org synced when a route org resolves
  useEffect(() => {
    if (!routeMatchedOrg) return
    if (routeMatchedOrg.id !== activeOrgId) {
      setActiveOrgId(routeMatchedOrg.id)
      return
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem(getTabStorageKey(user?.uid), routeMatchedOrg.id)
      localStorage.setItem("selectedOrgId", routeMatchedOrg.id)
      router.replace(legacyWorkspaceDestination(pathname, window.location.search, window.location.hash))
    }
  }, [routeMatchedOrg, activeOrgId, pathname, router, user?.uid])

  const changeActiveOrg = useCallback(
    (id: string) => {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(getTabStorageKey(user?.uid), id)
        localStorage.setItem("selectedOrgId", id)
        window.dispatchEvent(new Event("active-org-changed"))
      }
      setActiveOrgId(id)
    },
    [user?.uid]
  )

  // When on a route-scoped /orgs/[orgKey]/* URL, NEVER fall back to another org!
  const activeOrg = useMemo(() => {
    if (routeOrgKey) {
      return routeMatchedOrg
    }
    const found = orgs.find((o) => o.id === activeOrgId)
    if (found) return found
    if (orgs.length > 0) return orgs[0]
    return undefined
  }, [routeOrgKey, routeMatchedOrg, orgs, activeOrgId])

  const effectiveOrgId = routeOrgKey ? (routeMatchedOrg?.id || "") : (activeOrg?.id || activeOrgId)

  const value = useMemo(
    () => ({
      orgs,
      activeOrg,
      activeOrgId: effectiveOrgId,
      setActiveOrgId: changeActiveOrg,
      refreshOrgs: fetchOrgs,
      loading,
      error: orgsError,
      routeOrgKey,
      isRouteOrgResolving,
      isRouteOrgUnavailable,
    }),
    [
      orgs,
      activeOrg,
      effectiveOrgId,
      changeActiveOrg,
      fetchOrgs,
      loading,
      orgsError,
      routeOrgKey,
      isRouteOrgResolving,
      isRouteOrgUnavailable,
    ]
  )

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useActiveOrg(): OrgContextType {
  const context = useContext(OrgContext)
  if (!context) {
    // Graceful fallback if called outside provider
    return {
      orgs: [],
      activeOrg: undefined,
      activeOrgId: typeof window !== "undefined" ? localStorage.getItem("selectedOrgId") || "" : "",
      setActiveOrgId: (id: string) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("selectedOrgId", id)
          window.dispatchEvent(new Event("active-org-changed"))
        }
      },
      refreshOrgs: async () => {},
      loading: true,
      error: null,
      routeOrgKey: null,
      isRouteOrgResolving: false,
      isRouteOrgUnavailable: false,
    }
  }
  return context
}
