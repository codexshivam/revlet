"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useUser, useFirestore } from "@/firebase"
import { reconcileUserOrgMemberships } from "@/app/actions/organization"
import { collection, query, where, or, getDocs, onSnapshot, type Firestore, type QuerySnapshot } from "firebase/firestore"
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

// Each branch must satisfy the organization read rule on its own.
function organizationsForUser(db: Firestore, uid: string) {
  return query(
    collection(db, "organizations"),
    or(where("ownerId", "==", uid), where("memberIds", "array-contains", uid))
  )
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: userLoading } = useUser()
  const db = useFirestore()
  const pathname = usePathname()
  const router = useRouter()
  const [loadedOrgs, setOrgs] = useState<Organization[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string>(() => readTabActiveOrgId(null))
  const [isLoading, setLoading] = useState(true)
  const [orgsError, setOrgsError] = useState<string | null>(null)
  const currentUid = userLoading ? undefined : user?.uid
  const uidRef = useRef(currentUid)
  uidRef.current = currentUid
  const [resolvedUid, setResolvedUid] = useState<string>()

  const applyOrganizations = useCallback((uid: string, snap: QuerySnapshot) => {
    if (uidRef.current !== uid) return
    const fetched = snap.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as Organization)
      .filter((org) => org.status !== "Pending Deletion")
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))

    setOrgs(fetched)
    setOrgsError(null)
    const storedId = readTabActiveOrgId(uid)
    const nextId = fetched.find((org) => org.id === storedId)?.id ?? fetched[0]?.id ?? ""
    setActiveOrgId(nextId)
    if (nextId) sessionStorage.setItem(getTabStorageKey(uid), nextId)
    setResolvedUid(uid)
    setLoading(false)
  }, [])

  const handleOrgLoadError = useCallback((uid: string, error: unknown) => {
    if (uidRef.current !== uid) return
    console.error("Could not load organizations:", error)
    setOrgs([])
    setActiveOrgId("")
    setResolvedUid(uid)
    setOrgsError("We couldn’t load your organizations. Please try again.")
    setLoading(false)
  }, [])

  const fetchOrgs = useCallback(async () => {
    if (!currentUid) return
    try {
      setLoading(true)
      const snap = await getDocs(organizationsForUser(db, currentUid))
      applyOrganizations(currentUid, snap)
    } catch (error) {
      handleOrgLoadError(currentUid, error)
    }
  }, [applyOrganizations, currentUid, db, handleOrgLoadError])

  useEffect(() => {
    if (userLoading) return
    if (!currentUid) {
      setOrgs([])
      setActiveOrgId("")
      setResolvedUid(undefined)
      setOrgsError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    // Ensure any active organizations/{orgId}/members/{uid} grants are mirrored in memberIds
    if (user) {
      user
        .getIdToken()
        .then((tok) => reconcileUserOrgMemberships(tok))
        .catch(() => {})
    }
    const unsubscribe = onSnapshot(
      organizationsForUser(db, currentUid),
      (snap) => applyOrganizations(currentUid, snap),
      (error) => handleOrgLoadError(currentUid, error)
    )
    window.addEventListener("revlet-orgs-refresh", fetchOrgs)
    return () => {
      unsubscribe()
      window.removeEventListener("revlet-orgs-refresh", fetchOrgs)
    }
  }, [applyOrganizations, currentUid, db, fetchOrgs, handleOrgLoadError, userLoading])

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

  const hasCurrentResults = Boolean(currentUid && resolvedUid === currentUid)
  const orgs = useMemo(() => hasCurrentResults ? loadedOrgs : [], [hasCurrentResults, loadedOrgs])
  const loading = userLoading || Boolean(currentUid && (!hasCurrentResults || isLoading))

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

  const effectiveOrgId = activeOrg?.id ?? ""

  const value = useMemo(
    () => ({
      orgs,
      activeOrg,
      activeOrgId: effectiveOrgId,
      setActiveOrgId: changeActiveOrg,
      refreshOrgs: fetchOrgs,
      loading,
      error: hasCurrentResults ? orgsError : null,
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
      hasCurrentResults,
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
