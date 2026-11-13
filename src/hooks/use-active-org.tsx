"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, or, onSnapshot } from "firebase/firestore"

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
  status?: string
  dnsRequested?: boolean
  cloudflareZoneId?: string
  cloudflareZoneName?: string
  cloudflareTokenMasked?: string
  cloudflareTokenVerifiedAt?: string
  cloudflareTokenExpiresOn?: string | null
  cloudflareTokenScopedZone?: string
  emailServiceActive?: boolean
  emailForwardingActive?: boolean
  emailRoutingActive?: boolean
  mailServiceActive?: boolean
  mailMonthlyLimit?: number
  mailDailyLimit?: number
  mailMonthlySent?: number
  mailDailySent?: number
  mailCatchAllUserId?: string | null
  mailCatchAllEmail?: string | null
  mailDkimTokens?: string[]
  isEducation?: boolean
  // Google Workspace fields
  workspaceStatus?: 'none' | 'applied' | 'pending' | 'active'
  workspaceAdminEmail?: string
  workspaceCustomerId?: string
  workspaceDomain?: string
  workspaceAppliedAt?: any
  workspaceActivatedAt?: any
  createdAt?: any
  updatedAt?: any
}

interface OrgContextType {
  orgs: Organization[]
  activeOrg: Organization | undefined
  activeOrgId: string
  setActiveOrgId: (id: string) => void
  loading: boolean
}

const OrgContext = createContext<OrgContextType | null>(null)

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser()
  const db = useFirestore()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedOrgId") || ""
    }
    return ""
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setOrgs([])
      setActiveOrgId("")
      setLoading(false)
      return
    }

    const q = query(
      collection(db, "organizations"),
      or(
        where("ownerId", "==", user.uid),
        where("memberEmails", "array-contains", user.email?.toLowerCase().trim() || "")
      )
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched = snap.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((o: any) => o.status !== "Pending Deletion") as Organization[]

        setOrgs(fetched)

        // Resolve active organization from localStorage or default to first
        const storedId = typeof window !== "undefined" ? localStorage.getItem("selectedOrgId") : null
        const found = fetched.find((o) => o.id === storedId)

        if (found) {
          setActiveOrgId(found.id)
        } else if (fetched.length > 0) {
          setActiveOrgId(fetched[0].id)
          if (typeof window !== "undefined") {
            localStorage.setItem("selectedOrgId", fetched[0].id)
          }
        } else {
          setActiveOrgId("")
        }
        setLoading(false)
      },
      (error) => {
        console.error("Error listening to organizations:", error)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [user, db])

  useEffect(() => {
    const handleOrgChanged = () => {
      const storedId = typeof window !== "undefined" ? localStorage.getItem("selectedOrgId") : null
      if (storedId && storedId !== activeOrgId) {
        setActiveOrgId(storedId)
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("active-org-changed", handleOrgChanged)
      window.addEventListener("storage", handleOrgChanged)
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("active-org-changed", handleOrgChanged)
        window.removeEventListener("storage", handleOrgChanged)
      }
    }
  }, [activeOrgId])

  const changeActiveOrg = useCallback((id: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedOrgId", id)
      window.dispatchEvent(new Event("active-org-changed"))
    }
    setActiveOrgId(id)
  }, [])

  const activeOrg = useMemo(() => {
    const found = orgs.find((o) => o.id === activeOrgId)
    if (found) return found
    if (orgs.length > 0) return orgs[0]
    return undefined
  }, [orgs, activeOrgId])

  const effectiveOrgId = activeOrg?.id || activeOrgId

  const value = useMemo(
    () => ({
      orgs,
      activeOrg,
      activeOrgId: effectiveOrgId,
      setActiveOrgId: changeActiveOrg,
      loading,
    }),
    [orgs, activeOrg, effectiveOrgId, changeActiveOrg, loading]
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
      loading: true,
    }
  }
  return context
}
