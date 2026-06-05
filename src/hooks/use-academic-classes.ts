import { useState, useEffect, useCallback } from "react"
import { useActiveOrg } from "./use-active-org"
import { useUser } from "@/firebase"
import { listOrgUnits, createOrgUnit, deleteOrgUnit } from "@/app/actions/google-workspace"
import type { WorkspaceOU } from "@/app/actions/google-workspace"

export type AcademicSection = {
  id: string
  name: string
  studentCount?: number
}

export type AcademicClass = {
  id: string
  orgId: string
  name: string
  sections: AcademicSection[]
  createdAt: any
  updatedAt: any
}

export function useAcademicClasses() {
  const { activeOrg } = useActiveOrg()
  const { user } = useUser()
  const adminEmail = activeOrg?.workspaceAdminEmail || ""
  
  const [classes, setClasses] = useState<AcademicClass[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClassesAndSections = useCallback(async () => {
    if (!adminEmail || activeOrg?.workspaceStatus !== "active" || !user || !activeOrg?.id) {
      setClasses([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const res = await listOrgUnits(await user.getIdToken(), activeOrg.id)
      if (!res.success) {
        throw new Error(res.error)
      }

      const ous: WorkspaceOU[] = (res as any).data || []
      
      // Parse OUs into AcademicClass and AcademicSection structure
      // Classes are OUs directly under /Students. e.g. parentOrgUnitPath === "/Students"
      // Sections are OUs directly under a Class. e.g. parentOrgUnitPath === "/Students/{ClassName}"
      
      const classOUs = ous.filter(ou => ou.parentOrgUnitPath === "/Students")
      const sectionOUs = ous.filter(ou => ou.parentOrgUnitPath.startsWith("/Students/"))

      const parsedClasses: AcademicClass[] = classOUs.map(clsOu => {
        // Find sections that have parentOrgUnitPath === clsOu.orgUnitPath
        const sections: AcademicSection[] = sectionOUs
          .filter(secOu => secOu.parentOrgUnitPath === clsOu.orgUnitPath)
          .map(secOu => ({
            id: secOu.name,
            name: secOu.name,
            studentCount: 0
          }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

        return {
          id: clsOu.name,
          orgId: activeOrg.id,
          name: clsOu.name,
          sections,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

      setClasses(parsedClasses)
      setError(null)
    } catch (err: any) {
      console.error("Failed to load academic classes from Workspace:", err)
      setError(err.message || "An error occurred while loading classes.")
    } finally {
      setIsLoading(false)
    }
  }, [adminEmail, activeOrg?.id, activeOrg?.workspaceStatus, user])

  useEffect(() => {
    fetchClassesAndSections()
  }, [fetchClassesAndSections])

  const createClass = useCallback(async (className: string) => {
    if (!adminEmail || !user || !activeOrg?.id) throw new Error("No active organization, user, or admin email.")
    
    // Check for duplicates
    if (classes.some(c => c.name.toLowerCase() === className.toLowerCase())) {
      throw new Error(`Class "${className}" already exists.`)
    }

    // Auto-create parent /Students OU first just in case
    try {
      await createOrgUnit(await user.getIdToken(), activeOrg.id, "Students", "/")
    } catch (e) {
      // likely already exists
    }

    const res = await createOrgUnit(await user.getIdToken(), activeOrg.id, className, "/Students")
    if (!res.success) {
      throw new Error(res.error)
    }

    await fetchClassesAndSections()
  }, [adminEmail, classes, fetchClassesAndSections, activeOrg?.id, user])

  const deleteClass = useCallback(async (className: string) => {
    if (!adminEmail || !user || !activeOrg?.id) throw new Error("No active organization, user, or admin email.")

    const res = await deleteOrgUnit(await user.getIdToken(), activeOrg.id, `/Students/${className}`)
    if (!res.success) {
      throw new Error(res.error)
    }

    await fetchClassesAndSections()
  }, [adminEmail, fetchClassesAndSections, activeOrg?.id, user])

  const addSection = useCallback(async (className: string, sectionName: string) => {
    if (!adminEmail || !user || !activeOrg?.id) throw new Error("No active organization, user, or admin email.")

    // Ensure the class exists first
    const cls = classes.find(c => c.id === className)
    if (!cls) throw new Error("Class not found.")

    if (cls.sections.some(s => s.name.toLowerCase() === sectionName.toLowerCase())) {
      throw new Error(`Section "${sectionName}" already exists in ${cls.name}.`)
    }

    const res = await createOrgUnit(await user.getIdToken(), activeOrg.id, sectionName, `/Students/${className}`)
    if (!res.success) {
      throw new Error(res.error)
    }

    await fetchClassesAndSections()
  }, [adminEmail, classes, fetchClassesAndSections, activeOrg?.id, user])

  const removeSection = useCallback(async (className: string, sectionName: string) => {
    if (!adminEmail || !user || !activeOrg?.id) throw new Error("No active organization, user, or admin email.")

    const res = await deleteOrgUnit(await user.getIdToken(), activeOrg.id, `/Students/${className}/${sectionName}`)
    if (!res.success) {
      throw new Error(res.error)
    }

    await fetchClassesAndSections()
  }, [adminEmail, fetchClassesAndSections, activeOrg?.id, user])

  return {
    classes,
    isLoading,
    error,
    createClass,
    deleteClass,
    addSection,
    removeSection,
    refreshClasses: fetchClassesAndSections
  }
}

