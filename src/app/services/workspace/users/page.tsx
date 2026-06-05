"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useAcademicClasses } from "@/hooks/use-academic-classes"
import {
  Plus,
  Trash2,
  Loader2,
  Globe,
  Search,
  Edit3,
  Key,
  Ban,
  Play,
  Settings,
  X,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Users,
  UserPlus,
  AlertTriangle,
  Check,
  Download,
  Upload,
  GraduationCap,
  MoreVertical
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  listOrgUnits,
  createOrgUnit,
  deleteOrgUnit,
  getUserCountsByOU,
} from "@/app/actions/google-workspace"
import type { WorkspaceUser, WorkspaceOU } from "@/app/actions/google-workspace"

// ─── Types ───────────────────────────────────────────────────────────────────

type CustomOUDoc = {
  id: string
  ownerId: string
  orgId: string
  name: string
  ouPath: string
  createdAt: any
}

type OUTab = {
  label: string
  ouPath: string | null // null = "All Users" (no OU filter)
  isDefault: boolean
  userCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_OU_TABS: { label: string; ouPath: string }[] = [
  { label: "Students", ouPath: "/Students" },
  { label: "Teachers", ouPath: "/Teachers" },
  { label: "Main People", ouPath: "/Main People" },
  { label: "Staffs", ouPath: "/Staffs" },
]

const MAX_CUSTOM_OUS = 5

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatType(path: string | undefined | null): string {
  if (!path || path === "/" || path.toLowerCase() === "root") return "None"
  if (path.startsWith("/Students/")) {
    const parts = path.substring("/Students/".length).split("/")
    return parts.filter(Boolean).join(" - ")
  }
  return path.startsWith("/") ? path.substring(1) : path
}

function generateRandomPassword(length = 12): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const lower = "abcdefghijklmnopqrstuvwxyz"
  const digits = "0123456789"
  const special = "!@#$%&*"
  const all = upper + lower + digits + special
  let password = ""
  password += upper[Math.floor(Math.random() * upper.length)]
  password += lower[Math.floor(Math.random() * lower.length)]
  password += digits[Math.floor(Math.random() * digits.length)]
  password += special[Math.floor(Math.random() * special.length)]
  for (let i = 4; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("")
}

function getInitials(firstName: string, lastName: string): string {
  return `${(firstName || "?")[0]}${(lastName || "?")[0]}`.toUpperCase()
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function WorkspaceUsersPage() {
  const { toast } = useToast()
  const { user } = useUser()
  const db = useFirestore()
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()
  const router = useRouter()

  // ─── Core State ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<WorkspaceUser[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const { classes } = useAcademicClasses()

  // ─── Filter State ────────────────────────────────────────────────────────
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all")
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("all")

  // ─── OU Tab State ────────────────────────────────────────────────────────
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null) // null = All Users
  const [customOUs, setCustomOUs] = useState<CustomOUDoc[]>([])
  const [tabUserCounts, setTabUserCounts] = useState<Record<string, number>>({})

  // ─── Dialog States ───────────────────────────────────────────────────────
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false)
  const [isSuspendOpen, setIsSuspendOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isManageOUsOpen, setIsManageOUsOpen] = useState(false)

  // ─── Batch Selection State ───────────────────────────────────────────────
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [isMigrating, setIsMigrating] = useState(false)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectionAction, setSelectionAction] = useState<"migrate" | "suspend" | "delete" | null>(null)
  const [isBatchSuspendOpen, setIsBatchSuspendOpen] = useState(false)
  const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false)
  const [batchDeleteConfirmText, setBatchDeleteConfirmText] = useState("")

  // ─── Form States ─────────────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<WorkspaceUser | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Create User form
  const [createFirstName, setCreateFirstName] = useState("")
  const [createLastName, setCreateLastName] = useState("")
  const [createEmailPrefix, setCreateEmailPrefix] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createOUPath, setCreateOUPath] = useState("/")
  const [createClassId, setCreateClassId] = useState("none")
  const [createSectionId, setCreateSectionId] = useState("none")

  // Edit User form
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editEmailPrefix, setEditEmailPrefix] = useState("")
  const [editOUPath, setEditOUPath] = useState("/")
  const [editClassId, setEditClassId] = useState("none")
  const [editSectionId, setEditSectionId] = useState("none")

  // Reset Password form
  const [newPassword, setNewPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [confirmResetConsent, setConfirmResetConsent] = useState(false)

  // Delete User form
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("")

  // Manage OUs form
  const [newOUName, setNewOUName] = useState("")
  const [isCreatingOU, setIsCreatingOU] = useState(false)
  const [deletingOUId, setDeletingOUId] = useState<string | null>(null)

  // CSV Import States
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importOUPath, setImportOUPath] = useState("/Students")
  const [importClassId, setImportClassId] = useState("none")
  const [importSectionId, setImportSectionId] = useState("none")
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importResults, setImportResults] = useState<{ success: number; total: number; errors: string[] } | null>(null)

  // ─── Derived Values ──────────────────────────────────────────────────────
  const adminEmail = selectedOrg?.workspaceAdminEmail || ""
  const domain = selectedOrg?.domain || "example.com"
  const isWorkspaceActive = selectedOrg?.workspaceStatus === "active"

  // Build complete OU tabs from defaults + custom
  const ouTabs: OUTab[] = useMemo(() => {
    const allTab: OUTab = { label: "All Users", ouPath: null, isDefault: true, userCount: tabUserCounts["__all__"] || 0 }
    const defaultTabs: OUTab[] = DEFAULT_OU_TABS.map((t) => ({
      label: t.label,
      ouPath: t.ouPath,
      isDefault: true,
      userCount: tabUserCounts[t.ouPath] || 0,
    }))
    const customTabs: OUTab[] = customOUs.map((ou) => ({
      label: ou.name,
      ouPath: ou.ouPath,
      isDefault: false,
      userCount: tabUserCounts[ou.ouPath] || 0,
    }))
    return [allTab, ...defaultTabs, ...customTabs]
  }, [customOUs, tabUserCounts])

  // All available OU paths (for dropdowns)
  const availableOUPaths: { label: string; path: string }[] = useMemo(() => {
    const paths: { label: string; path: string }[] = [{ label: "None", path: "/" }]
    DEFAULT_OU_TABS.forEach((t) => paths.push({ label: t.label, path: t.ouPath }))
    customOUs.forEach((ou) => paths.push({ label: ou.name, path: ou.ouPath }))
    return paths
  }, [customOUs])

  // Client-side local filtering across name, email, etc.
  const filteredUsers = useMemo(() => {
    let result = users
    
    if (activeTabPath === "/Students") {
      if (selectedClassFilter !== "all") {
        const cls = classes.find(c => c.id === selectedClassFilter)
        if (cls) {
          result = result.filter(u => u.orgUnitPath && u.orgUnitPath.includes(cls.name))
          if (selectedSectionFilter !== "all") {
            const sec = cls.sections.find(s => s.id === selectedSectionFilter)
            if (sec) {
              result = result.filter(u => u.orgUnitPath && u.orgUnitPath.includes(sec.name))
            }
          }
        }
      }
    }

    if (!searchTerm.trim()) return result
    const lower = searchTerm.toLowerCase()
    return result.filter(
      (u) =>
        u.fullName.toLowerCase().includes(lower) ||
        u.email.toLowerCase().includes(lower) ||
        u.firstName.toLowerCase().includes(lower) ||
        u.lastName.toLowerCase().includes(lower)
    )
  }, [users, searchTerm, activeTabPath, selectedClassFilter, selectedSectionFilter, classes])

  const totalPages = useMemo(() => {
    return Math.ceil(filteredUsers.length / 50) || 1
  }, [filteredUsers])

  const displayedUsers = useMemo(() => {
    const start = (currentPage - 1) * 50
    return filteredUsers.slice(start, start + 50)
  }, [filteredUsers, currentPage])

  // Clear selection on page/filter change
  useEffect(() => {
    setSelectedUserIds(new Set())
    setIsSelectionMode(false)
  }, [currentPage, activeTabPath, searchTerm, selectedClassFilter, selectedSectionFilter])

  useEffect(() => {
    setSelectedClassFilter("all")
    setSelectedSectionFilter("all")
  }, [activeTabPath])

  // ─── Firestore: Listen to Custom OUs ─────────────────────────────────────

  useEffect(() => {
    if (!user || !selectedOrgId) {
      setCustomOUs([])
      return
    }

    const q = query(
      collection(db, "workspaceCustomOUs"),
      where("orgId", "==", selectedOrgId)
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as CustomOUDoc[]
        setCustomOUs(docs)
      },
      (error) => {
        console.error("Error listening to custom OUs:", error)
      }
    )

    return () => unsubscribe()
  }, [user, selectedOrgId, db])

  // ─── Fetch Users ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(
    async (ouPath: string | null) => {
      if (!user || !adminEmail) return

      setIsLoadingUsers(true)
      setUsers([])
      setCurrentPage(1)

      try {
        const options: { orgUnitPath?: string; maxResults?: number; showActiveOnly?: boolean } = {
          maxResults: 500, // Load up to 500 users at once
          showActiveOnly: false,
        }
        if (ouPath) options.orgUnitPath = ouPath

        const res = await listUsers(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", options)
        if (!res.success) {
          throw new Error(res.error)
        }

        const data = res.data!
        const activeUsers = data.users.filter(u => !u.orgUnitPath.startsWith("/Alumni"))
        setUsers(activeUsers)
      } catch (error: any) {
        console.error("Failed to fetch users:", error)
        toast({
          variant: "destructive",
          title: "Failed to Load Users",
          description: error.message || "Could not fetch user directory.",
        })
      } finally {
        setIsLoadingUsers(false)
      }
    },
    [adminEmail, toast]
  )

  // ─── Tab User Counts ─────────────────────────────────────────────────────

  const refreshTabCounts = useCallback(async () => {
    if (!user || !adminEmail) return

    try {
      const allPaths = [
        "__all__",
        ...DEFAULT_OU_TABS.map((t) => t.ouPath),
        ...customOUs.map((ou) => ou.ouPath),
      ]

      const res = await getUserCountsByOU(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", allPaths)
      if (res.success && (res as any).data) {
        const counts: Record<string, number> = {}
        for (const [path, data] of Object.entries((res as any).data)) {
          counts[path] = (data as any).total
        }
        setTabUserCounts(counts)
      }
    } catch (error) {
      console.error("Failed to refresh user tab counts:", error)
    }
  }, [adminEmail, customOUs])

  // ─── Auto-Provision Missing OUs ─────────────────────────────────────────

  const ensureDefaultOUs = useCallback(async () => {
    if (!user || !adminEmail) return
    try {
      const res = await listOrgUnits(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "")
      if (res.success && (res as any).data) {
        const existingPaths = new Set(((res as any).data as any[]).map((ou: any) => ou.orgUnitPath))
        const defaults = ["Students", "Teachers", "Main People", "Staffs"]
        
        let createdAny = false
        for (const name of defaults) {
          const expectedPath = `/${name}`
          if (!existingPaths.has(expectedPath)) {
            console.log(`[Google Workspace] Auto-creating missing default type: ${name}`)
            const createRes = await createOrgUnit(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", name, "/")
            if (createRes.success) {
              createdAny = true
            }
          }
        }
        
        if (createdAny) {
          refreshTabCounts()
        }
      }
    } catch (err) {
      console.error("Failed to auto-create default types:", err)
    }
  }, [adminEmail, refreshTabCounts])

  // Initial and reactive loading
  useEffect(() => {
    if (isWorkspaceActive && adminEmail) {
      ensureDefaultOUs()
    }
  }, [isWorkspaceActive, adminEmail, ensureDefaultOUs])

  useEffect(() => {
    if (isWorkspaceActive && adminEmail) {
      refreshTabCounts()
    }
  }, [isWorkspaceActive, adminEmail, refreshTabCounts, customOUs])

  useEffect(() => {
    if (isWorkspaceActive && adminEmail) {
      fetchUsers(activeTabPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabPath, isWorkspaceActive, adminEmail])

  // Reset page index on tab filter or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTabPath, searchTerm])

  const goToPage = (pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber)
    }
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleTabChange = (ouPath: string | null) => {
    setActiveTabPath(ouPath)
    setSearchTerm("")
  }

  const toggleUserSelection = (id: string) => {
    const next = new Set(selectedUserIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedUserIds(next)
  }

  const toggleAllSelection = () => {
    if (selectedUserIds.size === displayedUsers.length && displayedUsers.length > 0) {
      setSelectedUserIds(new Set())
    } else {
      setSelectedUserIds(new Set(displayedUsers.map(u => u.id)))
    }
  }

  const handleMigrateToAlumni = async () => {
    if (!adminEmail || !user || !selectedOrgId) return
    if (selectedUserIds.size === 0) return

    setIsMigrating(true)
    try {
      // Auto-create /Alumni OU if it doesn't exist. Ignore error if it already exists.
      try {
        await createOrgUnit(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", "Alumni")
      } catch (e) {
        // likely already exists
      }

      const selectedUsers = users.filter(u => selectedUserIds.has(u.id))
      for (const targetUser of selectedUsers) {
        // 1. Move to /Alumni
        await updateUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", targetUser.id, { orgUnitPath: "/Alumni" })
        // 2. Save metadata in Firestore
        await addDoc(collection(db, "workspaceAlumniMetadata"), {
          orgId: selectedOrgId,
          userId: targetUser.id,
          userEmail: targetUser.email,
          fullName: targetUser.fullName,
          originalOU: targetUser.orgUnitPath,
          migratedAt: serverTimestamp(),
          migratedBy: user.uid
        })
      }
      toast({
        title: "Migration Complete",
        description: `Successfully migrated ${selectedUserIds.size} users to Alumni.`
      })
      setSelectedUserIds(new Set())
      setIsSelectionMode(false)
      refreshCurrentTab()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Migration Error",
        description: error.message || "Failed to migrate some users."
      })
    } finally {
      setIsMigrating(false)
    }
  }

  const handleBatchSuspend = async (suspend: boolean) => {
    if (!adminEmail || !user || !selectedOrgId) return
    if (selectedUserIds.size === 0) return

    setIsSubmitting(true)
    let successCount = 0
    let failCount = 0
    try {
      const selectedUsers = users.filter(u => selectedUserIds.has(u.id))
      for (const targetUser of selectedUsers) {
        try {
          const res = await updateUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", targetUser.id, { suspended: suspend })
          if (res.success) {
            successCount++
            setUsers((prev) =>
              prev.map((u) => (u.id === targetUser.id ? { ...u, suspended: suspend } : u))
            )
          } else {
            failCount++
          }
        } catch {
          failCount++
        }
      }
      toast({
        title: suspend ? "Batch Suspension Complete" : "Batch Reactivation Complete",
        description: `Successfully ${suspend ? "suspended" : "reactivated"} ${successCount} users.${failCount > 0 ? ` Failed for ${failCount} users.` : ""}`
      })
      setSelectedUserIds(new Set())
      setIsSelectionMode(false)
      setIsBatchSuspendOpen(false)
      refreshCurrentTab()
      router.refresh()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Batch Action Error",
        description: error.message || "Failed to process batch update."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBatchDelete = async () => {
    if (!adminEmail || !user || !selectedOrgId) return
    if (selectedUserIds.size === 0) return
    if (batchDeleteConfirmText !== "DELETE") {
      toast({ variant: "destructive", title: "Confirmation Required", description: "Please type DELETE to confirm batch deletion." })
      return
    }

    setIsSubmitting(true)
    let successCount = 0
    let failCount = 0
    try {
      const selectedUsers = users.filter(u => selectedUserIds.has(u.id))
      for (const targetUser of selectedUsers) {
        try {
          const res = await deleteUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", targetUser.id)
          if (res.success) {
            successCount++
            setUsers((prev) => prev.filter((u) => u.id !== targetUser.id))
          } else {
            failCount++
          }
        } catch {
          failCount++
        }
      }
      toast({
        title: "Batch Deletion Complete",
        description: `Successfully deleted ${successCount} users.${failCount > 0 ? ` Failed for ${failCount} users.` : ""}`
      })
      setSelectedUserIds(new Set())
      setIsSelectionMode(false)
      setIsBatchDeleteOpen(false)
      setBatchDeleteConfirmText("")
      refreshCurrentTab()
      router.refresh()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Batch Action Error",
        description: error.message || "Failed to process batch deletion."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const refreshCurrentTab = () => {
    setIsLoadingUsers(true)
    
    // 1. Immediate full API reload for instant response
    fetchUsers(activeTabPath)
    refreshTabCounts()
    
    // 2. Delayed background API sweep (3 seconds) to guarantee replication lag resolution for both list and counts
    setTimeout(() => {
      fetchUsers(activeTabPath)
      refreshTabCounts()
    }, 3000)
  }

  // ─── Create User ─────────────────────────────────────────────────────────

  const handleCreateUser = async () => {
    if (!user || !adminEmail) return

    const firstName = createFirstName.trim()
    const lastName = createLastName.trim()
    const emailPrefix = createEmailPrefix.trim()
    const password = createPassword

    if (!firstName || !lastName || !emailPrefix || !password) {
      toast({ variant: "destructive", title: "Validation Error", description: "All fields are required." })
      return
    }

    if (password.length < 8) {
      toast({ variant: "destructive", title: "Validation Error", description: "Password must be at least 8 characters." })
      return
    }

    setIsSubmitting(true)
    try {
      const email = `${emailPrefix}@${domain}`
      
      let finalOUPath = createOUPath
      if (createOUPath === "/Students" && createClassId !== "none") {
        const cls = classes.find(c => c.id === createClassId)
        if (cls) {
          finalOUPath = `/Students/${cls.name}`
          if (createSectionId !== "none") {
            const sec = cls.sections.find(s => s.id === createSectionId)
            if (sec) finalOUPath += `/${sec.name}`
          }
        }
      }

      const res = await createUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", {
        firstName,
        lastName,
        email,
        password,
        orgUnitPath: finalOUPath,
      })

      if (!res.success) throw new Error(res.error)

      toast({
        title: "User Created",
        description: `${firstName} ${lastName} (${email}) has been added successfully.`,
      })

      const newUser: WorkspaceUser = {
        id: res.data!.id || Math.random().toString(),
        email: email,
        firstName: firstName,
        lastName: lastName,
        fullName: `${firstName} ${lastName}`,
        orgUnitPath: finalOUPath,
        suspended: false,
        archived: false,
        isAdmin: false,
        creationTime: new Date().toISOString(),
        lastLoginTime: "",
      }
      setUsers((prev) => [newUser, ...prev])

      setIsCreateOpen(false)
      resetCreateForm()
      refreshCurrentTab()
      router.refresh()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Create User",
        description: error.message || "Could not create user account.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetCreateForm = () => {
    setCreateFirstName("")
    setCreateLastName("")
    setCreateEmailPrefix("")
    setCreatePassword("")
    setCreateOUPath("/")
  }

  // ─── CSV Import & Export Users ────────────────────────────────────────────

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = []
    let row: string[] = []
    let inQuotes = false
    let val = ""
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        row.push(val.trim())
        val = ""
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[i+1] === '\n') i++ // Skip \n after \r
        row.push(val.trim())
        if (row.length > 0 && row.some(v => v !== "")) {
          lines.push(row)
        }
        row = []
        val = ""
      } else {
        val += char
      }
    }
    if (val !== "" || row.length > 0) {
      row.push(val.trim())
      if (row.some(v => v !== "")) {
        lines.push(row)
      }
    }
    return lines
  }

  const downloadCSVEmpTemplate = () => {
    const headers = ["SN", "First name", "Last name", "Desired email", "Password"]
    const sampleRow = ["1", "John", "Doe", "", ""]
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, sampleRow]
        .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n")

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `google-workspace-users-template.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({
      title: "Template Downloaded",
      description: "Excel-compatible CSV template downloaded successfully.",
    })
  }

  const handleExportUsers = () => {
    if (filteredUsers.length === 0) {
      toast({
        title: "No Data to Export",
        description: "There are no user directory accounts matching your filters to export.",
        variant: "destructive",
      })
      return
    }

    const headers = ["SN", "First name", "Last name", "Desired email", "Type"]
    const rows = filteredUsers.map((u, i) => {
      const names = u.fullName.split(" ")
      const firstName = names[0] || ""
      const lastName = names.slice(1).join(" ") || ""
      return [
        (i + 1).toString(),
        firstName,
        lastName,
        u.email,
        formatType(u.orgUnitPath),
      ]
    })

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers, ...rows]
        .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(","))
        .join("\n")

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    const domainName = selectedOrg?.domain || "workspace"
    const dateStr = new Date().toISOString().split("T")[0]
    link.setAttribute("download", `${domainName}-users-${dateStr}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Data Exported",
      description: `Successfully exported ${filteredUsers.length} accounts to CSV.`,
    })
  }

  const handleImportUsers = async (fileText: string) => {
    if (!user || !adminEmail || !selectedOrgId) return
    setIsImporting(true)
    setImportProgress(0)
    setImportResults(null)
    
    const rows = parseCSV(fileText)
    if (rows.length < 2) {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "The CSV file must contain a header row and at least one data row.",
      })
      setIsImporting(false)
      return
    }

    // Identify column indexes based on header row
    const headers = rows[0].map(h => h.trim().toLowerCase())
    const snIdx = headers.findIndex(h => h.includes("sn") || h === "sn")
    const firstNameIdx = headers.findIndex(h => h.includes("first name") || h === "firstname")
    const lastNameIdx = headers.findIndex(h => h.includes("last name") || h === "lastname")
    const desiredEmailIdx = headers.findIndex(h => h.includes("desired email") || h === "desiredemail" || h.includes("email"))
    const passwordIdx = headers.findIndex(h => h.includes("password"))
    const typeIdx = headers.findIndex(h => h.includes("type"))

    if (firstNameIdx === -1 || lastNameIdx === -1) {
      toast({
        variant: "destructive",
        title: "Missing Columns",
        description: "Ensure your CSV has 'First name' and 'Last name' column headers.",
      })
      setIsImporting(false)
      return
    }

    const dataRows = rows.slice(1)
    setImportTotal(dataRows.length)
    
    let successCount = 0
    const errs: string[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const sn = snIdx !== -1 ? row[snIdx] : (i + 1).toString()
      const firstName = row[firstNameIdx]?.trim() || ""
      const lastName = row[lastNameIdx]?.trim() || ""
      
      if (!firstName) {
        errs.push(`Row ${i + 2}: First name is required.`)
        setImportProgress(i + 1)
        continue
      }

      let email = (desiredEmailIdx !== -1 ? row[desiredEmailIdx]?.trim() : "") || ""
      if (!email) {
        const cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, "")
        const rand = Math.floor(100 + Math.random() * 900) // some numbers
        email = `${cleanFirst}${rand}${sn}@${domain}`
      }

      let password = (passwordIdx !== -1 ? row[passwordIdx]?.trim() : "") || ""
      if (!password) {
        password = "Hello@9864"
      }

      let userOUPath = importOUPath
      
      // Compute base OU if class/section is selected
      if (importOUPath === "/Students" && importClassId !== "none") {
        const cls = classes.find(c => c.id === importClassId)
        if (cls) {
          userOUPath = `/Students/${cls.name}`
          if (importSectionId !== "none") {
            const sec = cls.sections.find(s => s.id === importSectionId)
            if (sec) userOUPath += `/${sec.name}`
          }
        }
      }

      const typeVal = typeIdx !== -1 ? row[typeIdx]?.trim() : ""
      if (typeVal) {
        const cleanType = typeVal.toLowerCase()
        if (cleanType === "none" || cleanType === "root" || cleanType === "/") {
          userOUPath = "/"
        } else {
          const matchedOU = availableOUPaths.find(
            (o) => o.label.toLowerCase() === cleanType || o.path.toLowerCase() === `/${cleanType}`
          )
          if (matchedOU) {
            userOUPath = matchedOU.path
          } else {
            userOUPath = typeVal.startsWith("/") ? typeVal : `/${typeVal}`
          }
        }
      }

      try {
        // Search if email exists in workspace users
        const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase())

        if (existingUser) {
          // Update details: First name, Last name, and Type if specified
          const updates: any = {
            firstName: firstName,
            lastName: lastName,
          }
          if (userOUPath !== existingUser.orgUnitPath) {
            updates.orgUnitPath = userOUPath
          }
          const res = await updateUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", existingUser.id, updates)
          if (res.success) {
            // If password was explicitly provided, reset it
            if (row[passwordIdx]?.trim()) {
              const resetRes = await resetUserPassword(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", existingUser.id, password)
              if (!resetRes.success) {
                errs.push(`Row ${i + 2}: (${email}) Details updated, but password reset failed: ${resetRes.error}`)
              }
            }
            successCount++
          } else {
            errs.push(`Row ${i + 2}: (${email}) Update failed: ${res.error}`)
          }
        } else {
          // Create new user in the selected organizational unit path
          const res = await createUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", {
            email: email,
            password: password,
            firstName: firstName,
            lastName: lastName,
            orgUnitPath: userOUPath,
          })
          if (res.success) {
            successCount++
          } else {
            errs.push(`Row ${i + 2}: (${email}) Creation failed: ${res.error}`)
          }
        }
      } catch (err: any) {
        errs.push(`Row ${i + 2}: Error: ${err.message || err}`)
      }
      
      setImportProgress(i + 1)
    }

    setImportResults({
      success: successCount,
      total: dataRows.length,
      errors: errs,
    })
    setIsImporting(false)
    
    // Refresh user list and counts using Dual-Sync API reload
    refreshCurrentTab()
  }

  // ─── Edit User ────────────────────────────────────────────────────────────

  const openEditDialog = (u: WorkspaceUser) => {
    setSelectedUser(u)
    setEditFirstName(u.firstName)
    setEditLastName(u.lastName)
    const prefix = u.email.split("@")[0] || ""
    setEditEmailPrefix(prefix)
    
    if (u.orgUnitPath.startsWith("/Students/")) {
      setEditOUPath("/Students")
      const parts = u.orgUnitPath.substring("/Students/".length).split("/")
      const className = parts[0] || "none"
      const sectionName = parts[1] || "none"
      setEditClassId(className)
      setEditSectionId(sectionName)
    } else {
      setEditOUPath(u.orgUnitPath)
      setEditClassId("none")
      setEditSectionId("none")
    }
    
    setIsEditOpen(true)
  }

  const handleEditUser = async () => {
    if (!adminEmail || !selectedUser || !user) return

    const firstName = editFirstName.trim()
    const lastName = editLastName.trim()
    const emailPrefix = editEmailPrefix.trim()

    if (!firstName || !lastName || !emailPrefix) {
      toast({ variant: "destructive", title: "Validation Error", description: "All fields are required." })
      return
    }

    setIsSubmitting(true)
    try {
      const newEmail = `${emailPrefix}@${domain}`
      const updates: { firstName?: string; lastName?: string; email?: string; orgUnitPath?: string } = {}

      if (firstName !== selectedUser.firstName) updates.firstName = firstName
      if (lastName !== selectedUser.lastName) updates.lastName = lastName
      if (newEmail !== selectedUser.email) updates.email = newEmail

      let finalOUPath = editOUPath
      if (editOUPath === "/Students" && editClassId !== "none") {
        const cls = classes.find(c => c.id === editClassId)
        if (cls) {
          finalOUPath = `/Students/${cls.name}`
          if (editSectionId !== "none") {
            const sec = cls.sections.find(s => s.id === editSectionId)
            if (sec) finalOUPath += `/${sec.name}`
          }
        }
      }
      if (finalOUPath !== selectedUser.orgUnitPath) updates.orgUnitPath = finalOUPath

      if (Object.keys(updates).length === 0) {
        toast({ title: "No Changes", description: "No fields were modified." })
        setIsEditOpen(false)
        return
      }

      const res = await updateUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", selectedUser.id, updates)
      if (!res.success) throw new Error(res.error)

      toast({
        title: "User Updated",
        description: `${firstName} ${lastName} has been updated successfully.`,
      })

      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? {
                ...u,
                firstName: firstName,
                lastName: lastName,
                fullName: `${firstName} ${lastName}`,
                email: newEmail,
                orgUnitPath: finalOUPath,
              }
            : u
        )
      )

      setIsEditOpen(false)
      setSelectedUser(null)
      refreshCurrentTab()
      router.refresh()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Update User",
        description: error.message || "Could not update user account.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Reset Password ──────────────────────────────────────────────────────

  const openResetPasswordDialog = (u: WorkspaceUser) => {
    setSelectedUser(u)
    setNewPassword("")
    setShowPassword(false)
    setCopiedPassword(false)
    setConfirmResetConsent(false)
    setIsResetPasswordOpen(true)
  }

  const handleResetPassword = async () => {
    if (!adminEmail || !selectedUser || !user) return
    if (!confirmResetConsent) {
      toast({ variant: "destructive", title: "Consent Required", description: "You must confirm and check the consent box to proceed." })
      return
    }

    if (!newPassword || newPassword.length < 8) {
      toast({ variant: "destructive", title: "Validation Error", description: "Password must be at least 8 characters." })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await resetUserPassword(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", selectedUser.id, newPassword)
      if (!res.success) throw new Error(res.error)

      toast({
        title: "Password Reset",
        description: `Password for ${selectedUser.email} has been reset. They will be required to change it on next login.`,
      })

      setIsResetPasswordOpen(false)
      setSelectedUser(null)
      refreshCurrentTab()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Reset Password",
        description: error.message || "Could not reset password.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyPassword = async () => {
    if (!newPassword) return
    try {
      await navigator.clipboard.writeText(newPassword)
      setCopiedPassword(true)
      setTimeout(() => setCopiedPassword(false), 2000)
    } catch {
      toast({ variant: "destructive", title: "Copy Failed", description: "Could not copy to clipboard." })
    }
  }

  // ─── Suspend / Unsuspend ──────────────────────────────────────────────────

  const openSuspendDialog = (u: WorkspaceUser) => {
    setSelectedUser(u)
    setIsSuspendOpen(true)
  }

  const handleToggleSuspend = async () => {
    if (!adminEmail || !selectedUser || !user || !selectedOrgId) return

    setIsSubmitting(true)
    try {
      const newSuspended = !selectedUser.suspended
      const res = await updateUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", selectedUser.id, { suspended: newSuspended })
      if (!res.success) throw new Error(res.error)

      toast({
        title: newSuspended ? "User Suspended" : "User Reactivated",
        description: newSuspended
          ? `${selectedUser.fullName} has been suspended.`
          : `${selectedUser.fullName} has been reactivated.`,
      })

      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id ? { ...u, suspended: newSuspended } : u
        )
      )

      setIsSuspendOpen(false)
      setSelectedUser(null)
      refreshCurrentTab()
      router.refresh()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Action Failed",
        description: error.message || "Could not update user suspension status.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Delete User ──────────────────────────────────────────────────────────

  const openDeleteDialog = (u: WorkspaceUser) => {
    setSelectedUser(u)
    setDeleteConfirmEmail("")
    setIsDeleteOpen(true)
  }

  const handleDeleteUser = async () => {
    if (!adminEmail || !selectedUser || !user || !selectedOrgId) return

    if (deleteConfirmEmail !== selectedUser.email) {
      toast({ variant: "destructive", title: "Confirmation Required", description: "Please type the exact email address to confirm deletion." })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await deleteUser(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", selectedUser.id)
      if (!res.success) throw new Error(res.error)

      toast({
        title: "User Deleted",
        description: `${selectedUser.fullName} (${selectedUser.email}) has been permanently deleted.`,
      })

      setUsers((prev) => prev.filter((u) => u.id !== selectedUser.id))

      setIsDeleteOpen(false)
      setSelectedUser(null)
      refreshCurrentTab()
      router.refresh()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Delete User",
        description: error.message || "Could not delete user account.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Custom OU Management ────────────────────────────────────────────────

  const handleCreateCustomOU = async () => {
    if (!adminEmail || !user || !selectedOrgId) return

    const name = newOUName.trim()
    if (!name) {
      toast({ variant: "destructive", title: "Validation Error", description: "OU name is required." })
      return
    }

    if (customOUs.length >= MAX_CUSTOM_OUS) {
      toast({ variant: "destructive", title: "Limit Reached", description: `You can create a maximum of ${MAX_CUSTOM_OUS} custom types.` })
      return
    }

    setIsCreatingOU(true)
    try {
      // Create OU in Google Workspace
      const res = await createOrgUnit(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", name)
      if (!res.success) throw new Error(res.error)

      // Save to Firestore
      await addDoc(collection(db, "workspaceCustomOUs"), {
        ownerId: user.uid,
        orgId: selectedOrgId,
        name: name,
        ouPath: res.data!.orgUnitPath,
        createdAt: serverTimestamp(),
      })

      toast({
        title: "Custom Type Created",
        description: `"${name}" has been created as a new organizational unit.`,
      })

      setNewOUName("")
      refreshCurrentTab()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Create Type",
        description: error.message || "Could not create organizational unit.",
      })
    } finally {
      setIsCreatingOU(false)
    }
  }

  const handleDeleteCustomOU = async (ouDoc: CustomOUDoc) => {
    if (!user || !adminEmail) return

    setDeletingOUId(ouDoc.id)
    try {
      // Delete from Google Workspace
      const res = await deleteOrgUnit(await user.getIdToken(), selectedOrgId || selectedOrg?.id || "", ouDoc.ouPath)
      if (!res.success) throw new Error(res.error)

      // Delete from Firestore
      await deleteDoc(doc(db, "workspaceCustomOUs", ouDoc.id))

      toast({
        title: "Custom Type Removed",
        description: `"${ouDoc.name}" has been removed.`,
      })

      // If current tab was the deleted OU, switch to All Users
      if (activeTabPath === ouDoc.ouPath) {
        setActiveTabPath(null)
      }

      refreshCurrentTab()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to Remove Type",
        description: error.message || "Could not remove organizational unit.",
      })
    } finally {
      setDeletingOUId(null)
    }
  }

  // ─── STATE 1: Loading ─────────────────────────────────────────────────────

  if (isLoadingOrgs) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Infrastructure...</p>
        </div>
      </DashboardShell>
    )
  }

  // ─── STATE 2: No Orgs ─────────────────────────────────────────────────────

  if (orgs.length === 0) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Google Workspace</span>
            <h1 className="text-3xl font-headline font-bold text-slate-900">User Directory</h1>
          </div>
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
              <CardContent className="p-16 flex flex-col items-center text-center gap-6">
                <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                  <Globe className="w-10 h-10 text-slate-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-headline font-bold text-slate-900">No Registered Organizations</h3>
                  <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                    To manage the user directory, you must first register your organization on the Account Home screen.
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
        </div>
      </DashboardShell>
    )
  }

  // ─── STATE 2.5: Non-Educational Organization ──────────────────────────────

  if (selectedOrg && !selectedOrg.isEducation) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Google Workspace</span>
            <h1 className="text-3xl font-headline font-bold text-slate-900">User Directory</h1>
          </div>
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
              <CardContent className="p-16 flex flex-col items-center text-center gap-6">
                <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                  <AlertTriangle className="w-10 h-10 text-slate-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-headline font-bold text-slate-900">Educational Organization Required</h3>
                  <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                    Google Workspace integration is exclusively available for educational organizations. Your current organization is not registered as an Educational entity.
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
        </div>
      </DashboardShell>
    )
  }

  // ─── STATE 3: Workspace Not Active ─────────────────────────────────────────

  if (!isWorkspaceActive) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Google Workspace</span>
            <h1 className="text-3xl font-headline font-bold text-slate-900">User Directory</h1>
          </div>
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
              <CardContent className="p-16 flex flex-col items-center text-center gap-6">
                <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                  <Users className="w-10 h-10 text-slate-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-headline font-bold text-slate-900">Google Workspace Required</h3>
                  <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                    The User Directory requires an active Google Workspace connection. Please activate Google Workspace for your organization first.
                  </p>
                </div>
                <Link href="/services/workspace">
                  <Button className="font-bold gap-2 h-11 px-6 bg-slate-900 hover:bg-black text-white transition-all shadow-md">
                    Go to Workspace Setup
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardShell>
    )
  }

  // ─── STATE 4: Active Workspace — User Directory ─────────────────────────

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Google Workspace</span>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-3xl font-headline font-bold text-slate-900">User Directory</h1>
            <div className="flex flex-wrap items-center gap-2">
              {isSelectionMode ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsSelectionMode(false)
                      setSelectedUserIds(new Set())
                      setSelectionAction(null)
                    }}
                    className="border-slate-200 text-slate-500 font-bold h-10 px-4 text-xs shadow-none mr-2"
                  >
                    Cancel Selection
                  </Button>
                  {selectionAction === "migrate" && (
                    <Button
                      onClick={handleMigrateToAlumni}
                      disabled={isMigrating || selectedUserIds.size === 0}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                    >
                      {isMigrating ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
                      Migrate {selectedUserIds.size} to Alumni
                    </Button>
                  )}
                  {selectionAction === "suspend" && (
                    <Button
                      onClick={() => setIsBatchSuspendOpen(true)}
                      disabled={isSubmitting || selectedUserIds.size === 0}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                      Suspend {selectedUserIds.size} Users
                    </Button>
                  )}
                  {selectionAction === "delete" && (
                    <Button
                      onClick={() => {
                        setBatchDeleteConfirmText("")
                        setIsBatchDeleteOpen(true)
                      }}
                      disabled={isSubmitting || selectedUserIds.size === 0}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold h-10 px-4 text-xs flex items-center gap-2 shadow-sm mr-2"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Delete {selectedUserIds.size} Users
                    </Button>
                  )}
                </>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="border-slate-200 h-10 w-10 p-0 text-slate-500 shadow-none mr-2">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 font-bold">
                    <DropdownMenuItem 
                      onClick={() => {
                        setSelectionAction("migrate")
                        setIsSelectionMode(true)
                      }}
                      className="cursor-pointer flex items-center gap-2 text-xs focus:bg-purple-50 focus:text-purple-750 text-purple-600"
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>Migrate to Alumni...</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => {
                        setSelectionAction("suspend")
                        setIsSelectionMode(true)
                      }}
                      className="cursor-pointer flex items-center gap-2 text-xs focus:bg-amber-50 focus:text-amber-750 text-amber-600"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Suspend Users...</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => {
                        setSelectionAction("delete")
                        setIsSelectionMode(true)
                      }}
                      className="cursor-pointer flex items-center gap-2 text-xs focus:bg-red-50 focus:text-red-750 text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Users...</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="outline"
                onClick={handleExportUsers}
                className="border-slate-200 text-slate-700 font-bold h-10 px-4 text-xs hover:text-black hover:bg-slate-50 transition-all flex items-center gap-2 shadow-none"
              >
                <Download className="w-4 h-4 text-slate-400" />
                Export
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setImportResults(null)
                  setIsImportOpen(true)
                }}
                className="border-slate-200 text-slate-700 font-bold h-10 px-4 text-xs hover:text-black hover:bg-slate-50 transition-all flex items-center gap-2 shadow-none"
              >
                <Upload className="w-4 h-4 text-slate-400" />
                Import
              </Button>
              <Button
                onClick={() => {
                  resetCreateForm()
                  setIsCreateOpen(true)
                }}
                className="bg-slate-900 hover:bg-black text-white font-bold h-10 px-6 shadow-lg shadow-slate-200 text-xs flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add User
              </Button>
            </div>
          </div>
        </div>

        {/* OU Navigation Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max pb-1">
              {ouTabs.map((tab) => {
                const isActive = activeTabPath === tab.ouPath
                return (
                  <button
                    key={tab.ouPath ?? "__all__"}
                    onClick={() => handleTabChange(tab.ouPath)}
                    className={cn(
                      "relative px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all whitespace-nowrap flex items-center gap-2",
                      isActive
                        ? "text-primary bg-white border border-b-0 border-slate-200 shadow-sm"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {tab.label}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-bold px-1.5 py-0 h-4 border shadow-none",
                        isActive
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-slate-100 text-slate-400 border-slate-200"
                      )}
                    >
                      {tab.userCount}
                    </Badge>
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs font-bold border-slate-200 text-slate-500 hover:bg-blue-600 hover:text-white hover:border-blue-600 shrink-0 transition-all"
            onClick={() => setIsManageOUsOpen(true)}
          >
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Manage Types
          </Button>
        </div>

        {/* User Table Card */}
        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {isLoadingUsers ? (
              <div className="flex flex-col items-center justify-center py-32 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                <p className="text-[10px] font-bold text-slate-400 uppercase">Loading users...</p>
              </div>
            ) : users.length === 0 && !searchTerm ? (
              <div className="p-24 text-center space-y-3">
                <Users className="w-8 h-8 text-slate-200 mx-auto" />
                <p className="text-sm font-bold text-slate-400">No users found in this category.</p>
                <p className="text-xs text-slate-400 font-medium">Try selecting a different tab or create a new user.</p>
              </div>
            ) : (
              <>
                {/* Search Bar */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/20 flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by name or email..."
                      className="pl-9 h-9 text-xs border-slate-200 focus-visible:ring-slate-300 font-semibold"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {activeTabPath === "/Students" && classes.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                      <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
                        <SelectTrigger className="h-9 w-[140px] text-xs border-slate-200 bg-white font-medium">
                          <SelectValue placeholder="All Classes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">All Classes</SelectItem>
                          {classes.map(cls => (
                            <SelectItem key={cls.id} value={cls.id} className="text-xs">{cls.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedClassFilter !== "all" && (
                        <Select value={selectedSectionFilter} onValueChange={setSelectedSectionFilter}>
                          <SelectTrigger className="h-9 w-[140px] text-xs border-slate-200 bg-white font-medium">
                            <SelectValue placeholder="All Sections" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">All Sections</SelectItem>
                            {classes.find(c => c.id === selectedClassFilter)?.sections.map(sec => (
                              <SelectItem key={sec.id} value={sec.id} className="text-xs">{sec.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}

                  {searchTerm && (
                    <Button
                      variant="ghost"
                      onClick={() => setSearchTerm("")}
                      className="text-[11px] font-bold text-slate-900 hover:text-black h-9 px-3 hover:bg-slate-100"
                    >
                      Clear Search
                    </Button>
                  )}
                  <div className="ml-auto text-[10px] text-slate-400 font-bold uppercase tracking-wider hidden sm:block">
                    Showing {filteredUsers.length > 0 ? (currentPage - 1) * 50 + 1 : 0}–{(currentPage - 1) * 50 + displayedUsers.length} of {filteredUsers.length} users
                  </div>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="p-20 text-center space-y-2">
                    <Search className="w-8 h-8 text-slate-200 mx-auto" />
                    <p className="text-xs font-bold text-slate-600">No matching users found</p>
                    <p className="text-[11px] text-slate-400 font-medium">Try a different search term or clear the filter.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop View: Dense User Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-slate-50/50">
                          <TableRow className="border-b border-slate-100">
                            {isSelectionMode && (
                              <TableHead className="w-[50px] pl-6">
                                <Checkbox 
                                  checked={displayedUsers.length > 0 && selectedUserIds.size === displayedUsers.length}
                                  onCheckedChange={toggleAllSelection}
                                  className="border-slate-300"
                                />
                              </TableHead>
                            )}
                            <TableHead className={cn("text-[10px] font-bold uppercase py-4", !isSelectionMode && "pl-6")}>Name</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase py-4">Email</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase py-4">Type</TableHead>
                            <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-6">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayedUsers.map((u) => (
                            <TableRow key={u.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                              {/* Checkbox */}
                              {isSelectionMode && (
                                <TableCell className="pl-6">
                                  <Checkbox 
                                    checked={selectedUserIds.has(u.id)}
                                    onCheckedChange={() => toggleUserSelection(u.id)}
                                    className="border-slate-300"
                                  />
                                </TableCell>
                              )}

                              {/* Name with avatar and inline suspended status chip */}
                              <TableCell className={cn("py-4", isSelectionMode ? "pl-2" : "pl-6")}>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <span className="text-[10px] font-bold">{getInitials(u.firstName, u.lastName)}</span>
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-xs font-bold text-slate-800">{u.fullName}</p>
                                      {u.suspended && (
                                        <Badge variant="outline" className="text-[8px] font-bold px-1.5 py-0 h-3.5 bg-red-50 text-red-600 border-red-200 shadow-none shrink-0">
                                          Suspended
                                        </Badge>
                                      )}
                                    </div>
                                    {u.isAdmin && (
                                      <Badge variant="outline" className="text-[8px] font-bold px-1.5 py-0 h-3.5 bg-amber-50 text-amber-600 border-amber-200 shadow-none mt-0.5">
                                        Admin
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </TableCell>

                              {/* Email */}
                              <TableCell>
                                <span className="font-mono text-[11px] text-slate-500">{u.email}</span>
                              </TableCell>

                              {/* Type */}
                              <TableCell>
                                <span className="text-[11px] text-slate-500 font-medium">{formatType(u.orgUnitPath)}</span>
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="text-right pr-6">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all rounded-md"
                                    onClick={() => openEditDialog(u)}
                                    title="Edit user"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all rounded-md"
                                    onClick={() => openResetPasswordDialog(u)}
                                    title="Reset password"
                                  >
                                    <Key className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                      "h-8 w-8 transition-all rounded-md",
                                      u.suspended
                                        ? "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
                                        : "text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                                    )}
                                    onClick={() => openSuspendDialog(u)}
                                    title={u.suspended ? "Reactivate user" : "Suspend user"}
                                  >
                                    {u.suspended ? <Play className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:bg-destructive hover:text-white transition-all rounded-md"
                                    onClick={() => openDeleteDialog(u)}
                                    title="Delete user"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile View: High-End Touchable Cards */}
                    <div className="block md:hidden space-y-4 p-4 bg-slate-50/20">
                      {displayedUsers.map((u) => {
                        const isSuspended = u.suspended
                        return (
                          <div
                            key={u.id}
                            className={cn(
                              "relative p-5 rounded-xl border bg-white shadow-sm flex flex-col gap-4 border-slate-100 hover:shadow-md transition-all border-l-4",
                              isSuspended ? "border-l-red-500" : "border-l-emerald-500"
                            )}
                          >
                            {/* Card Header: Avatar & Info */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                  <span className="text-xs font-bold">{getInitials(u.firstName, u.lastName)}</span>
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-sm font-bold text-slate-800 truncate leading-none">{u.fullName}</h4>
                                    {u.suspended && (
                                      <Badge variant="outline" className="text-[8px] font-extrabold px-1.5 py-0 bg-red-50 text-red-600 border-red-200 uppercase tracking-wider scale-90 shrink-0 leading-none">
                                        Suspended
                                      </Badge>
                                    )}
                                    {u.isAdmin && (
                                      <Badge variant="outline" className="text-[8px] font-extrabold px-1.5 py-0 bg-amber-50 text-amber-600 border-amber-200 uppercase tracking-wider scale-90 shrink-0 leading-none">
                                        Admin
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs font-mono text-slate-500 truncate mt-1">{u.email}</p>
                                </div>
                              </div>
                              
                              {/* Checkbox for batch select */}
                              {isSelectionMode && (
                                <Checkbox 
                                  checked={selectedUserIds.has(u.id)}
                                  onCheckedChange={() => toggleUserSelection(u.id)}
                                  className="border-slate-300 w-5 h-5"
                                />
                              )}
                            </div>

                            {/* Card Body: Type / OU assignment */}
                            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100/60">
                              <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Type</span>
                              <span className="font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-2 py-0.5">
                                {formatType(u.orgUnitPath)}
                              </span>
                            </div>

                            {/* Card Footer: Touch Quick Actions */}
                            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100/60">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 font-bold text-[10px] gap-1 px-3 border-slate-200 text-slate-600 bg-white hover:bg-slate-50 shrink-0"
                                onClick={() => openEditDialog(u)}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 font-bold text-[10px] gap-1 px-3 border-slate-200 text-slate-600 bg-white hover:bg-slate-50 shrink-0"
                                onClick={() => openResetPasswordDialog(u)}
                              >
                                <Key className="w-3.5 h-3.5" />
                                Reset
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "h-8 font-bold text-[10px] gap-1 px-3 border-slate-200 shrink-0",
                                  isSuspended
                                    ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-100 bg-white"
                                    : "text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-100 bg-white"
                                )}
                                onClick={() => openSuspendDialog(u)}
                              >
                                {isSuspended ? (
                                  <>
                                    <Play className="w-3.5 h-3.5" />
                                    Activate
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-3.5 h-3.5" />
                                    Suspend
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 font-bold text-[10px] gap-1 px-3 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 bg-white shrink-0"
                                onClick={() => openDeleteDialog(u)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Pagination Bar */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/20">
                        <div className="text-xs text-slate-400 font-medium">
                          Showing Page <span className="font-bold text-slate-700">{currentPage}</span> of{" "}
                          <span className="font-bold text-slate-700">{totalPages}</span> ({filteredUsers.length} total users)
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === 1 || isLoadingUsers}
                            onClick={() => goToPage(currentPage - 1)}
                            className="h-8 text-xs font-bold border-slate-200"
                          >
                            Previous
                          </Button>
                          
                          {/* Page Numbers */}
                          {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                            .map((p, idx, arr) => {
                              const isGap = idx > 0 && p - arr[idx - 1] > 1;
                              return (
                                <div key={p} className="flex items-center gap-1">
                                  {isGap && <span className="text-xs text-slate-400 font-bold px-1">...</span>}
                                  <Button
                                    variant={currentPage === p ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => goToPage(p)}
                                    disabled={isLoadingUsers}
                                    className={cn(
                                      "h-8 w-8 text-xs font-bold",
                                      currentPage === p ? "shadow-none" : "border-slate-200"
                                    )}
                                  >
                                    {p}
                                  </Button>
                                </div>
                              );
                            })}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === totalPages || isLoadingUsers}
                            onClick={() => goToPage(currentPage + 1)}
                            className="h-8 text-xs font-bold border-slate-200"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOGS
          ═══════════════════════════════════════════════════════════════════════ */}

      {/* ─── Create User Dialog ──────────────────────────────────────────────── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-headline font-bold text-slate-900">Create New User</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add a new user account to your Google Workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">First Name</Label>
                <Input
                  placeholder="John"
                  value={createFirstName}
                  onChange={(e) => setCreateFirstName(e.target.value)}
                  className="h-9 text-xs font-semibold border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Name</Label>
                <Input
                  placeholder="Doe"
                  value={createLastName}
                  onChange={(e) => setCreateLastName(e.target.value)}
                  className="h-9 text-xs font-semibold border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Address</Label>
              <div className="flex items-center gap-0">
                <Input
                  placeholder="john.doe"
                  value={createEmailPrefix}
                  onChange={(e) => setCreateEmailPrefix(e.target.value)}
                  className="h-9 text-xs font-semibold border-slate-200 rounded-r-none border-r-0"
                />
                <div className="h-9 px-3 flex items-center bg-slate-100 border border-slate-200 rounded-r-md text-xs font-bold text-slate-500 shrink-0">
                  @{domain}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Temporary Password</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Minimum 8 characters"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="h-9 text-xs font-mono font-semibold border-slate-200"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-[10px] font-bold border-slate-200 text-slate-500 shrink-0"
                  onClick={() => setCreatePassword(generateRandomPassword())}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Generate
                </Button>
              </div>
              {createPassword && createPassword.length < 8 && (
                <p className="text-[10px] text-red-500 font-medium">Password must be at least 8 characters.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</Label>
              <Select value={createOUPath} onValueChange={setCreateOUPath}>
                <SelectTrigger className="h-9 text-xs font-semibold border-slate-200">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {availableOUPaths.map((p) => (
                    <SelectItem key={p.path} value={p.path} className="text-xs font-semibold">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {createOUPath === "/Students" && classes.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Class</Label>
                  <Select value={createClassId} onValueChange={setCreateClassId}>
                    <SelectTrigger className="h-9 text-xs font-semibold border-slate-200">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs font-semibold">None</SelectItem>
                      {classes.map(cls => (
                        <SelectItem key={cls.id} value={cls.id} className="text-xs font-semibold">{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {createClassId !== "none" && (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Section</Label>
                    <Select value={createSectionId} onValueChange={setCreateSectionId}>
                      <SelectTrigger className="h-9 text-xs font-semibold border-slate-200">
                        <SelectValue placeholder="Select Section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs font-semibold">None</SelectItem>
                        {classes.find(c => c.id === createClassId)?.sections.map(sec => (
                          <SelectItem key={sec.id} value={sec.id} className="text-xs font-semibold">{sec.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="text-xs font-bold h-9 border-slate-200">
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={isSubmitting}
              className="bg-slate-900 hover:bg-black text-white text-xs font-bold h-9"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5 mr-2" />
                  Create User
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit User Dialog ────────────────────────────────────────────────── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-headline font-bold text-slate-900">Edit User</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update user information for {selectedUser?.fullName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">First Name</Label>
                <Input
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="h-9 text-xs font-semibold border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Name</Label>
                <Input
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className="h-9 text-xs font-semibold border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email Address</Label>
              <div className="flex items-center gap-0">
                <Input
                  value={editEmailPrefix}
                  onChange={(e) => setEditEmailPrefix(e.target.value)}
                  className="h-9 text-xs font-semibold border-slate-200 rounded-r-none border-r-0"
                />
                <div className="h-9 px-3 flex items-center bg-slate-100 border border-slate-200 rounded-r-md text-xs font-bold text-slate-500 shrink-0">
                  @{domain}
                </div>
              </div>
              {editEmailPrefix && `${editEmailPrefix}@${domain}` !== selectedUser?.email && (
                <div className="flex items-center gap-1.5 mt-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-600 font-medium">
                    Changing the email address will affect the user&apos;s sign-in credentials.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</Label>
              <Select value={editOUPath} onValueChange={setEditOUPath}>
                <SelectTrigger className="h-9 text-xs font-semibold border-slate-200">
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {availableOUPaths.map((p) => (
                    <SelectItem key={p.path} value={p.path} className="text-xs font-semibold">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editOUPath === "/Students" && classes.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Class</Label>
                  <Select value={editClassId} onValueChange={setEditClassId}>
                    <SelectTrigger className="h-9 text-xs font-semibold border-slate-200">
                      <SelectValue placeholder="Select Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs font-semibold">None</SelectItem>
                      {classes.map(cls => (
                        <SelectItem key={cls.id} value={cls.id} className="text-xs font-semibold">{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editClassId !== "none" && (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Section</Label>
                    <Select value={editSectionId} onValueChange={setEditSectionId}>
                      <SelectTrigger className="h-9 text-xs font-semibold border-slate-200">
                        <SelectValue placeholder="Select Section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs font-semibold">None</SelectItem>
                        {classes.find(c => c.id === editClassId)?.sections.map(sec => (
                          <SelectItem key={sec.id} value={sec.id} className="text-xs font-semibold">{sec.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="text-xs font-bold h-9 border-slate-200">
              Cancel
            </Button>
            <Button
              onClick={handleEditUser}
              disabled={isSubmitting}
              className="bg-slate-900 hover:bg-black text-white text-xs font-bold h-9"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reset Password Dialog ───────────────────────────────────────────── */}
      <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-headline font-bold text-slate-900">Reset Password</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Set a new password for {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">User Account</p>
              <p className="text-xs font-bold text-slate-700 mt-0.5">{selectedUser?.fullName} ({selectedUser?.email})</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Password</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 text-xs font-mono font-semibold border-slate-200 pr-16"
                  />
                  <div className="absolute right-1 top-0.5 flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8",
                        copiedPassword ? "text-emerald-500" : "text-slate-400 hover:text-slate-600"
                      )}
                      onClick={handleCopyPassword}
                      disabled={!newPassword}
                    >
                      {copiedPassword ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-[10px] font-bold border-slate-200 text-slate-500 shrink-0"
                  onClick={() => {
                    const p = generateRandomPassword()
                    setNewPassword(p)
                    setShowPassword(true)
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Generate
                </Button>
              </div>
              {newPassword && newPassword.length < 8 && (
                <p className="text-[10px] text-red-500 font-medium">Password must be at least 8 characters.</p>
              )}
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                User will be forced to change their password on next login.
              </p>
            </div>

            {/* Explicit consent checkbox */}
            <div className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <input
                type="checkbox"
                id="reset-consent"
                checked={confirmResetConsent}
                onChange={(e) => setConfirmResetConsent(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary shrink-0 cursor-pointer"
              />
              <label htmlFor="reset-consent" className="text-[10px] text-slate-500 font-bold select-none cursor-pointer leading-tight">
                I confirm that I want to reset the password for this user and understand that they will be locked out of their active sessions until they log back in.
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)} className="text-xs font-bold h-9 border-slate-200">
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={isSubmitting || !newPassword || newPassword.length < 8 || !confirmResetConsent}
              className="bg-slate-900 hover:bg-black text-white text-xs font-bold h-9 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5 mr-2" />
                  Reset Password
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Suspend / Unsuspend Confirmation ────────────────────────────────── */}
      <AlertDialog open={isSuspendOpen} onOpenChange={setIsSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold">
              {selectedUser?.suspended ? "Reactivate User" : "Suspend User"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
              {selectedUser?.suspended ? (
                <>
                  Are you sure you want to reactivate <span className="font-bold text-slate-700">{selectedUser?.fullName}</span> ({selectedUser?.email})?
                  They will regain access to all Google Workspace services.
                </>
              ) : (
                <>
                  Are you sure you want to suspend <span className="font-bold text-slate-700">{selectedUser?.fullName}</span> ({selectedUser?.email})?
                  They will lose access to all Google Workspace services immediately.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs font-bold h-9 border-slate-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleSuspend}
              disabled={isSubmitting}
              className={cn(
                "text-xs font-bold h-9",
                selectedUser?.suspended
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : selectedUser?.suspended ? (
                <>
                  <Play className="w-3.5 h-3.5 mr-2" />
                  Reactivate
                </>
              ) : (
                <>
                  <Ban className="w-3.5 h-3.5 mr-2" />
                  Suspend
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete User Confirmation (Danger) ───────────────────────────────── */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete User Account
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete the account for{" "}
              <span className="font-bold text-slate-700">{selectedUser?.fullName}</span>? The user will be removed from the active directory. They can be recovered from the Deactivated Users register within <span className="font-bold text-slate-700">20 days</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Account to Delete</p>
              <p className="text-xs font-bold text-red-700 mt-0.5">{selectedUser?.email}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Type the email address to confirm
              </Label>
              <Input
                placeholder={selectedUser?.email}
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                className="h-9 text-xs font-mono font-semibold border-red-200 focus-visible:ring-red-300"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs font-bold h-9 border-slate-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isSubmitting || deleteConfirmEmail !== selectedUser?.email}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold h-9"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Permanently Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Batch Suspend Confirmation ─────────────────────────────────────── */}
      <AlertDialog open={isBatchSuspendOpen} onOpenChange={setIsBatchSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-amber-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Batch Suspend Users
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to suspend access for the <span className="font-bold text-slate-700">{selectedUserIds.size}</span> selected user accounts? 
              They will be temporarily blocked from signing in to Google Workspace services.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs font-bold h-9 border-slate-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleBatchSuspend(true)}
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold h-9"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Suspending...
                </>
              ) : (
                <>
                  <Ban className="w-3.5 h-3.5 mr-2" />
                  Suspend {selectedUserIds.size} Users
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Batch Delete Confirmation ───────────────────────────────────────── */}
      <AlertDialog open={isBatchDeleteOpen} onOpenChange={setIsBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Batch Delete Users
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to permanently delete the <span className="font-bold text-slate-700">{selectedUserIds.size}</span> selected user accounts? 
              They will be removed from the active directory. They can be recovered within <span className="font-bold text-slate-700">20 days</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5 py-2">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Type <span className="font-bold text-red-600">DELETE</span> to confirm
            </Label>
            <Input
              placeholder="DELETE"
              value={batchDeleteConfirmText}
              onChange={(e) => setBatchDeleteConfirmText(e.target.value)}
              className="h-9 text-xs font-mono font-semibold border-red-200 focus-visible:ring-red-300"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs font-bold h-9 border-slate-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchDelete}
              disabled={isSubmitting || batchDeleteConfirmText !== "DELETE"}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold h-9"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Permanently Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Manage Custom OUs Dialog ────────────────────────────────────────── */}
      <Dialog open={isManageOUsOpen} onOpenChange={setIsManageOUsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-headline font-bold text-slate-900">Manage Custom Types</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Create or remove custom organizational unit categories.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Counter */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Custom Types Used</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] font-bold px-2 py-0.5 border shadow-none",
                  customOUs.length >= MAX_CUSTOM_OUS
                    ? "bg-amber-50 text-amber-600 border-amber-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                )}
              >
                {customOUs.length}/{MAX_CUSTOM_OUS}
              </Badge>
            </div>

            {/* Existing Custom OUs */}
            {customOUs.length > 0 ? (
              <div className="space-y-2">
                {customOUs.map((ou) => (
                  <div
                    key={ou.id}
                    className="flex items-center justify-between px-3 py-2.5 bg-white border border-slate-200 rounded-lg group hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-700">{ou.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{ou.ouPath}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      disabled={deletingOUId === ou.id}
                      onClick={() => handleDeleteCustomOU(ou)}
                    >
                      {deletingOUId === ou.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg">
                <p className="text-xs text-slate-400 font-medium">No custom types created yet.</p>
              </div>
            )}

            {/* Add New OU */}
            {customOUs.length < MAX_CUSTOM_OUS && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add New Type</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. Alumni, Volunteers..."
                    value={newOUName}
                    onChange={(e) => setNewOUName(e.target.value)}
                    className="h-9 text-xs font-semibold border-slate-200"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateCustomOU()
                    }}
                  />
                  <Button
                    onClick={handleCreateCustomOU}
                    disabled={isCreatingOU || !newOUName.trim()}
                    className="bg-slate-900 hover:bg-black text-white text-xs font-bold h-9 px-4 shrink-0"
                  >
                    {isCreatingOU ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Create
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {customOUs.length >= MAX_CUSTOM_OUS && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                  Maximum custom types reached. Remove an existing type to create a new one.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageOUsOpen(false)} className="text-xs font-bold h-9 border-slate-200">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── CSV Import Dialog ────────────────────────────────────────────────── */}
      <Dialog open={isImportOpen} onOpenChange={(open) => {
        if (!isImporting) {
          setIsImportOpen(open)
        }
      }}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-headline font-bold text-slate-900">
              Bulk Import Users
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed font-medium">
              Upload a CSV file containing user details to register them in bulk. Existing accounts with matching email addresses will have their details updated.
            </DialogDescription>
          </DialogHeader>

          {isImporting ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-6">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <div className="space-y-2">
                <p className="text-sm font-bold text-slate-800">
                  Importing users: {importProgress} of {importTotal}
                </p>
                <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden mx-auto border border-slate-200 shadow-inner">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300 rounded-full" 
                    style={{ width: `${(importProgress / importTotal) * 100}%` }}
                  />
                </div>
              </div>
              <div className="max-w-md mx-auto p-4 bg-amber-50/50 border border-amber-100 rounded-lg text-amber-800 flex items-start gap-2.5 animate-pulse text-left shadow-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[11px] font-bold">Important Action Required</p>
                  <p className="text-[10px] leading-relaxed font-medium">
                    Please do not close this tab or shut down your system. The migration process is synchronizing with Google Workspace APIs.
                  </p>
                </div>
              </div>
            </div>
          ) : importResults ? (
            <div className="space-y-5 py-4">
              <div className="p-5 rounded-lg border border-slate-100 bg-slate-50/50 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500">
                  <Check className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 mt-1">Import Completed</h4>
                <p className="text-xs text-slate-500 font-medium">
                  Successfully processed <span className="font-bold text-slate-700">{importResults.success}</span> of <span className="font-bold text-slate-700">{importResults.total}</span> records.
                </p>
              </div>

              {importResults.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Error Migration Logs ({importResults.errors.length})</p>
                  <div className="max-h-[150px] overflow-y-auto border border-red-100 bg-red-50/10 rounded-lg p-3 space-y-1 text-[10px] text-red-600 font-semibold font-mono custom-scrollbar">
                    {importResults.errors.map((err, idx) => (
                      <p key={idx}>{err}</p>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button 
                  onClick={() => {
                    setImportResults(null)
                    setIsImportOpen(false)
                  }}
                  className="bg-slate-900 hover:bg-black text-white text-xs font-bold h-9 px-4 w-full shadow-sm"
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-5 py-4">
              {/* Dropdown for import target OU */}
              <div className="space-y-2">
                <Label htmlFor="import-ou" className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  Target Organizational Type
                </Label>
                <Select
                  value={importOUPath}
                  onValueChange={setImportOUPath}
                >
                  <SelectTrigger id="import-ou" className="h-10 text-xs font-semibold border-slate-200">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-xl rounded-lg">
                    {availableOUPaths.filter(o => o.path !== "/").map((ou) => (
                      <SelectItem key={ou.path} value={ou.path} className="text-xs font-semibold hover:bg-slate-50">
                        {ou.label === "None" ? "Root Unit" : ou.label} ({ou.path})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400 font-medium">
                  All newly created accounts from the CSV will be assigned to this user type group.
                </p>
              </div>

              {importOUPath === "/Students" && classes.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="space-y-2 flex-1">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">Target Class</Label>
                    <Select value={importClassId} onValueChange={setImportClassId}>
                      <SelectTrigger className="h-10 text-xs font-semibold border-slate-200">
                        <SelectValue placeholder="Select Class" />
                      </SelectTrigger>
                      <SelectContent className="bg-white shadow-xl rounded-lg">
                        <SelectItem value="none" className="text-xs font-semibold hover:bg-slate-50">None</SelectItem>
                        {classes.map(cls => (
                          <SelectItem key={cls.id} value={cls.id} className="text-xs font-semibold hover:bg-slate-50">{cls.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {importClassId !== "none" && (
                    <div className="space-y-2 flex-1">
                      <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">Target Section</Label>
                      <Select value={importSectionId} onValueChange={setImportSectionId}>
                        <SelectTrigger className="h-10 text-xs font-semibold border-slate-200">
                          <SelectValue placeholder="Select Section" />
                        </SelectTrigger>
                        <SelectContent className="bg-white shadow-xl rounded-lg">
                          <SelectItem value="none" className="text-xs font-semibold hover:bg-slate-50">None</SelectItem>
                          {classes.find(c => c.id === importClassId)?.sections.map(sec => (
                            <SelectItem key={sec.id} value={sec.id} className="text-xs font-semibold hover:bg-slate-50">{sec.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Template Download Option */}
              <div className="flex flex-col p-4 bg-slate-50 border border-slate-100 rounded-lg gap-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800">CSV Excel Template</p>
                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                      Download the prepared CSV template with required headers (SN, First name, Last name, Desired email, Password).
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={downloadCSVEmpTemplate}
                    className="h-8 border-slate-200 hover:border-slate-300 font-bold text-[10px] shrink-0 gap-1.5 shadow-none hover:text-black hover:bg-slate-100"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </Button>
                </div>
                <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-md text-[10px] text-blue-700 leading-relaxed font-semibold">
                  Note: User passwords cannot be exported due to Google Workspace security policies. If the Password field is left empty during import, a temporary password of <span className="font-bold font-mono px-1 py-0.5 bg-white border border-blue-200 rounded">Hello@9864</span> will be assigned automatically.
                </div>
              </div>

              {/* File input drag and drop area */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">Upload CSV File</Label>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 flex flex-col items-center justify-center text-center gap-2.5 hover:border-blue-300 transition-colors bg-slate-50/20 relative group">
                  <Upload className="w-8 h-8 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-700">Select a CSV File</p>
                    <p className="text-[10px] text-slate-400 font-medium">Excel-compatible CSV files up to 2MB allowed.</p>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onload = (event) => {
                          const text = event.target?.result as string
                          handleImportUsers(text)
                        }
                        reader.readAsText(file)
                      }
                    }}
                  />
                </div>
              </div>

              <DialogFooter className="border-t border-slate-100 pt-4 gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsImportOpen(false)}
                  className="text-xs font-bold h-10 border-slate-200 shadow-none px-5"
                >
                  Cancel
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
