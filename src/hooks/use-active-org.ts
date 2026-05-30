"use client"

import { useState, useEffect } from "react"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, getDocs } from "firebase/firestore"

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
  hasWebsite?: boolean
  siteActiveOn?: boolean
  maxWebEdits?: number
  usedWebEdits?: number
  lastWebQuota?: any
  dnsRequested?: boolean
  cloudflareZoneId?: string
  emailServiceActive?: boolean
  isEducation?: boolean
  createdAt?: any
  updatedAt?: any
}

export function useActiveOrg() {
  const { user } = useUser()
  const db = useFirestore()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    const q = query(collection(db, "organizations"), where("ownerId", "==", user.uid))
    const fetchActiveOrgs = async () => {
      try {
        const snap = await getDocs(q);
        const fetched = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Organization[];
        
        setOrgs(fetched);

        // Resolve active organization from localStorage or default to first
        const storedId = typeof window !== "undefined" ? localStorage.getItem("selectedOrgId") : null;
        const found = fetched.find((o) => o.id === storedId);
        
        if (found) {
          setActiveOrgId(found.id);
        } else if (fetched.length > 0) {
          setActiveOrgId(fetched[0].id);
          if (typeof window !== "undefined") {
            localStorage.setItem("selectedOrgId", fetched[0].id);
          }
        }
        setLoading(false);
      } catch (error) {
        console.error("Error loading organizations:", error);
        setLoading(false);
      }
    };

    fetchActiveOrgs();
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
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("active-org-changed", handleOrgChanged)
      }
    }
  }, [activeOrgId])

  const changeActiveOrg = (id: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedOrgId", id)
    }
    setActiveOrgId(id)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("active-org-changed"))
    }
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId)

  return {
    orgs,
    activeOrg,
    activeOrgId,
    setActiveOrgId: changeActiveOrg,
    loading,
  }
}
