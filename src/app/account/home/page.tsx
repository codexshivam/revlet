"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  MoreVertical,
  Plus,
  Building2,
  GraduationCap,
  Edit2,
  LogOut,
  Globe,
  Loader2,
  Info,
  Trash2,
  AlertTriangle,
  Settings,
  Mail,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useState, useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import { useAuth, useUser, useFirestore, syncUserOrganizations } from "@/firebase"
import { signOut, updateProfile } from "firebase/auth"
import { useRouter } from "next/navigation"
import { deleteOrganization } from "@/app/actions/organization"
import {
  collection,
  query,
  where,
  or,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore"
import { errorEmitter } from "@/firebase/error-emitter"
import { FirestorePermissionError } from "@/firebase/errors"
import { cn } from "@/lib/utils"
import { useActiveOrg } from "@/hooks/use-active-org"

interface Organization {
  id: string
  name: string
  address: string
  phone: string
  currentEmail: string
  domain: string
  contactName: string
  contactPhone: string
  contactEmail: string
  description: string
  code: string
  ownerId: string
  status?: string
  isEducation?: boolean
  mailServiceActive?: boolean
  mailMonthlyLimit?: number
  mailDailyLimit?: number
  mailMonthlySent?: number
  mailDailySent?: number
  workspaceStatus?: "none" | "applied" | "pending" | "active"
  createdAt: any
}

function TableSkeleton() {
  return (
    <div className="w-full divide-y divide-slate-100 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-32 bg-slate-200 rounded" />
              <div className="h-2.5 w-16 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="h-3.5 w-28 bg-slate-100 rounded hidden md:block" />
          <div className="h-8 w-20 bg-slate-100 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export default function AccountHomePage() {
  const router = useRouter()
  const auth = useAuth()
  const db = useFirestore()
  const { user, loading: authLoading } = useUser()
  const { setActiveOrgId } = useActiveOrg()

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditNameOpen, setIsEditNameOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    currentEmail: "",
    domain: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    description: "",
    isEducation: false,
  })

  const [accountName, setAccountName] = useState("")
  const [localDisplayName, setLocalDisplayName] = useState("")
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false)

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validateForm = () => {
    const tempErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      tempErrors.name = "Organization legal name is required"
    } else if (formData.name.trim().length < 3) {
      tempErrors.name = "Name must be at least 3 characters"
    }

    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/
    if (!formData.domain.trim()) {
      tempErrors.domain = "Managed domain is required"
    } else if (!domainRegex.test(formData.domain.trim())) {
      tempErrors.domain = "Enter a valid domain (e.g. example.com)"
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.contactEmail.trim()) {
      tempErrors.contactEmail = "Representative email is required"
    } else if (!emailRegex.test(formData.contactEmail.trim())) {
      tempErrors.contactEmail = "Enter a valid email address"
    }

    if (formData.currentEmail.trim() && !emailRegex.test(formData.currentEmail.trim())) {
      tempErrors.currentEmail = "Enter a valid email address"
    }

    if (!formData.contactName.trim()) {
      tempErrors.contactName = "Authorized contact name is required"
    }

    if (formData.contactPhone.trim()) {
      const phoneRegex = /^\+?[0-9\s\-()]{7,20}$/
      if (!phoneRegex.test(formData.contactPhone.trim())) {
        tempErrors.contactPhone = "Enter a valid phone number (7–20 digits)"
      }
    }

    setErrors(tempErrors)
    return Object.keys(tempErrors).length === 0
  }

  useEffect(() => {
    if (user) {
      setLocalDisplayName(user.displayName || "Administrative portal")
      setAccountName(user.displayName || "")
    }
  }, [user])

  useEffect(() => {
    // Restore pointer events whenever all dialogs close
    if (!isDialogOpen && !isDeleteDialogOpen && !isSignOutOpen && !isEditNameOpen) {
      if (typeof document !== "undefined") {
        document.body.style.pointerEvents = ""
      }
    }
  }, [isDialogOpen, isDeleteDialogOpen, isSignOutOpen, isEditNameOpen])

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setIsLoadingOrgs(false)
      router.push("/login")
      return
    }

    const orgsRef = collection(db, "organizations")
    const q = query(
      orgsRef,
      or(
        where("ownerId", "==", user.uid),
        where("memberEmails", "array-contains", user.email?.toLowerCase().trim() || "")
      )
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedOrgs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Organization[]

        const sortedOrgs = fetchedOrgs.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0
          const timeB = b.createdAt?.toMillis?.() || 0
          return timeB - timeA
        })

        setOrgs(sortedOrgs)
        setIsLoadingOrgs(false)
        if (user && user.email && snapshot.docChanges().some((c) => c.type === "added")) {
          syncUserOrganizations(db, user.uid, user.email, user.displayName || "")
        }
      },
      () => {
        const permissionError = new FirestorePermissionError({
          path: "organizations",
          operation: "list",
        })
        errorEmitter.emit("permission-error", permissionError)
        setIsLoadingOrgs(false)
      }
    )

    return () => unsubscribe()
  }, [user, authLoading, db, router])

  const handleOpenEdit = (org: Organization) => {
    setEditingOrg(org)
    setErrors({})
    setFormData({
      name: org.name || "",
      address: org.address || "",
      phone: org.phone || "",
      currentEmail: org.currentEmail || "",
      domain: org.domain || "",
      contactName: org.contactName || "",
      contactPhone: org.contactPhone || "",
      contactEmail: org.contactEmail || "",
      description: org.description || "",
      isEducation: !!org.isEducation,
    })
    setIsDialogOpen(true)
  }

  const handleOpenCreate = () => {
    setEditingOrg(null)
    setErrors({})
    setFormData({
      name: "",
      address: "",
      phone: "",
      currentEmail: "",
      domain: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      description: "",
      isEducation: false,
    })
    setIsDialogOpen(true)
  }

  const handleSaveOrg = async () => {
    if (!user) return

    if (!validateForm()) {
      toast({
        variant: "destructive",
        title: "Validation failed",
        description: "Please correct the highlighted fields before saving.",
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingOrg) {
        const orgRef = doc(db, "organizations", editingOrg.id)
        await updateDoc(orgRef, {
          name: formData.name.trim(),
          address: formData.address.trim(),
          phone: formData.phone.trim(),
          currentEmail: formData.currentEmail.trim(),
          contactName: formData.contactName.trim(),
          contactPhone: formData.contactPhone.trim(),
          contactEmail: formData.contactEmail.trim(),
          description: formData.description.trim(),
          isEducation: !!formData.isEducation,
          updatedAt: serverTimestamp(),
        })
        toast({
          title: "Organization updated",
          description: "Changes have been saved successfully.",
        })
      } else {
        const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
        const orgCode = `${formData.name.substring(0, 3).toUpperCase()}-${uniqueSuffix}`

        const orgsRef = collection(db, "organizations")
        await addDoc(orgsRef, {
          name: formData.name.trim(),
          address: formData.address.trim(),
          phone: formData.phone.trim(),
          currentEmail: formData.currentEmail.trim(),
          domain: formData.domain.toLowerCase().trim(),
          contactName: formData.contactName.trim(),
          contactPhone: formData.contactPhone.trim(),
          contactEmail: formData.contactEmail.trim(),
          description: formData.description.trim(),
          isEducation: !!formData.isEducation,
          code: orgCode,
          ownerId: user.uid,
          status: "Active",
          createdAt: serverTimestamp(),
        })
        toast({
          title: "Organization registered",
          description: `${formData.name} has been added to your account.`,
        })
      }
      setIsDialogOpen(false)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Operation failed",
        description: error.message || "An unexpected error occurred.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteOrg = async () => {
    if (!editingOrg || !user) return
    setIsSubmitting(true)

    try {
      const idToken = await user.getIdToken()
      const res = await deleteOrganization(idToken, editingOrg.id)

      if (!res.success) {
        const { deleteDoc: deleteDocSdk, doc: docSdk } = await import("firebase/firestore")
        await deleteDocSdk(docSdk(db, "organizations", editingOrg.id))
      }

      toast({
        title: "Organization deleted",
        description: `"${editingOrg.name}" has been permanently removed.`,
      })

      if (typeof window !== "undefined") {
        const storedId = localStorage.getItem("selectedOrgId")
        if (storedId === editingOrg.id) {
          const remaining = orgs.filter((o) => o.id !== editingOrg.id)
          const nextId = remaining.length > 0 ? remaining[0].id : ""
          if (nextId) {
            localStorage.setItem("selectedOrgId", nextId)
            setActiveOrgId(nextId)
          } else {
            localStorage.removeItem("selectedOrgId")
            setActiveOrgId("")
          }
          window.dispatchEvent(new Event("active-org-changed"))
        }
      }

      setIsDeleteDialogOpen(false)
      setIsDialogOpen(false)
      setDeleteConfirmName("")
      setEditingOrg(null)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Deletion failed",
        description: error.message || "Could not delete organization.",
      })
    } finally {
      setIsSubmitting(false)
      if (typeof document !== "undefined") {
        document.body.style.pointerEvents = ""
      }
    }
  }

  const handleUpdateAccountName = async () => {
    if (!user || !accountName.trim()) return
    setIsUpdatingAccount(true)
    try {
      await updateProfile(user, { displayName: accountName.trim() })
      setLocalDisplayName(accountName.trim())
      setIsEditNameOpen(false)
      toast({
        title: "Account name updated",
        description: "Your display name has been saved.",
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Could not update display name.",
      })
    } finally {
      setIsUpdatingAccount(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await signOut(auth)
      toast({
        title: "Signed out",
        description: "You have been signed out of your account.",
      })
      router.push("/login")
    } catch {
      toast({
        variant: "destructive",
        title: "Sign out failed",
        description: "Please try again.",
      })
      setIsLoggingOut(false)
    }
  }

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" strokeWidth={1.5} />
          <p className="text-xs text-slate-500">Initializing session</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-headline font-semibold text-slate-900 tracking-tight">
              {localDisplayName}
            </h1>
            <p className="text-xs text-slate-500">
              Manage registered organizations, custom domains, and service allowances
            </p>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 bg-white border-slate-200 hover:bg-slate-50 rounded-lg"
                >
                  <MoreVertical className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 bg-white border border-slate-200 shadow-md rounded-xl p-1"
              >
                <DropdownMenuItem
                  onSelect={() => setIsEditNameOpen(true)}
                  className="gap-2 py-2 text-xs cursor-pointer rounded-lg"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                  <span>Update account name</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setIsSignOutOpen(true)}
                  className="gap-2 py-2 text-xs text-destructive focus:text-destructive cursor-pointer rounded-lg"
                >
                  <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              onClick={handleOpenCreate}
              className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs transition-colors shadow-none"
            >
              <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
              Register organization
            </Button>
          </div>
        </div>

        {/* Organizations container */}
        <Card className="bg-white border border-slate-200/80 shadow-none overflow-hidden rounded-xl">
          <CardContent className="p-0">
            {isLoadingOrgs ? (
              <TableSkeleton />
            ) : orgs.length === 0 ? (
              <div className="py-20 text-center space-y-3 px-4 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center mx-auto text-slate-400">
                  <Building2 className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-headline font-semibold text-slate-900">
                    No organizations registered
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Register your organization to manage domain routing, email accounts, and workspaces.
                  </p>
                </div>
                <div className="pt-1">
                  <Button
                    size="sm"
                    onClick={handleOpenCreate}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
                  >
                    <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                    Register organization
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200/80">
                        <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                          Organization
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-slate-500">
                          Managed domain
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-slate-500">
                          Email quota
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgs.map((org) => (
                        <TableRow
                          key={org.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                        >
                          <TableCell className="pl-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                                {org.isEducation ? (
                                  <GraduationCap className="w-4 h-4" strokeWidth={1.5} />
                                ) : (
                                  <Building2 className="w-4 h-4" strokeWidth={1.5} />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-slate-900">
                                  {org.name}
                                </span>
                                <div className="flex items-center gap-2 pt-0.5">
                                  <span className="font-mono text-[11px] text-slate-400">
                                    {org.code}
                                  </span>
                                  {org.isEducation && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                      Education
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-4">
                            <div className="flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                              <span className="text-xs font-mono text-slate-700">
                                {org.domain}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="py-4">
                            {org.mailServiceActive ? (
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                                  <span className="text-xs font-mono text-slate-800 tabular-nums">
                                    {(org.mailMonthlySent ?? 0).toLocaleString()} /{" "}
                                    {(org.mailMonthlyLimit ?? 1000).toLocaleString()} mo
                                  </span>
                                </div>
                                <span className="text-[11px] font-mono text-slate-400 pl-5 tabular-nums">
                                  {(org.mailDailySent ?? 0).toLocaleString()} /{" "}
                                  {(org.mailDailyLimit ?? 100).toLocaleString()} day
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-mono text-slate-400">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right pr-6 py-4">
                            {org.ownerId === user?.uid ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-xs font-medium border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors"
                                onClick={() => handleOpenEdit(org)}
                              >
                                Manage
                              </Button>
                            ) : (
                              <span className="text-xs font-mono text-slate-400">
                                Member
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile view */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {orgs.map((org) => (
                    <div key={org.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                            {org.isEducation ? (
                              <GraduationCap className="w-4 h-4" strokeWidth={1.5} />
                            ) : (
                              <Building2 className="w-4 h-4" strokeWidth={1.5} />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-900">{org.name}</div>
                            <span className="font-mono text-[11px] text-slate-400">{org.code}</span>
                          </div>
                        </div>

                        {org.ownerId === user?.uid ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-slate-900 rounded-lg"
                            onClick={() => handleOpenEdit(org)}
                          >
                            <Settings className="w-4 h-4" strokeWidth={1.5} />
                          </Button>
                        ) : (
                          <span className="text-xs font-mono text-slate-400">Member</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                        <span className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                          {org.domain}
                        </span>
                        {org.isEducation && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                            Education
                          </span>
                        )}
                      </div>

                      {org.mailServiceActive && (
                        <div className="flex items-center justify-between text-xs font-mono bg-slate-50 p-2.5 rounded-lg text-slate-700 tabular-nums">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                            Quota
                          </span>
                          <span>
                            {(org.mailMonthlySent ?? 0).toLocaleString()} / {(org.mailMonthlyLimit ?? 1000).toLocaleString()} mo
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <div className="dialogs-portal">
          {/* Edit account name dialog */}
          <Dialog open={isEditNameOpen} onOpenChange={setIsEditNameOpen}>
            <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
              <DialogHeader className="border-b border-slate-100 p-6">
                <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                  Update account name
                </DialogTitle>
              </DialogHeader>
              <div className="p-6 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-name" className="text-xs font-medium text-slate-700">
                    Display name
                  </Label>
                  <Input
                    id="acc-name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="h-9 border-slate-200 bg-white rounded-lg text-xs"
                  />
                </div>
              </div>
              <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditNameOpen(false)}
                  className="rounded-lg text-xs font-medium h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateAccountName}
                  disabled={isUpdatingAccount || !accountName.trim()}
                  className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
                >
                  {isUpdatingAccount ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Register / edit organization dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
              <DialogHeader className="border-b border-slate-100 p-6">
                <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                  {editingOrg ? "Edit organization details" : "Register organization"}
                </DialogTitle>
              </DialogHeader>

              <ScrollArea className="max-h-[70vh]">
                <div className="p-6 space-y-6">
                  {/* Organization core */}
                  <div className="space-y-4">
                    <div className="text-xs font-medium text-slate-700">
                      Organization details
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="org-name"
                          className={cn(
                            "text-xs font-medium text-slate-700",
                            errors.name && "text-destructive"
                          )}
                        >
                          Legal name *
                        </Label>
                        <Input
                          id="org-name"
                          placeholder="Example Company"
                          value={formData.name}
                          onChange={(e) => handleInputChange("name", e.target.value)}
                          className={cn(
                            "h-9 border-slate-200 bg-white rounded-lg text-xs",
                            errors.name && "border-destructive focus-visible:ring-destructive/20"
                          )}
                        />
                        {errors.name && (
                          <span className="text-[11px] text-destructive block">{errors.name}</span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="org-domain"
                          className={cn(
                            "text-xs font-medium text-slate-700",
                            errors.domain && "text-destructive"
                          )}
                        >
                          Managed domain * {editingOrg && <span className="text-slate-400 font-normal">(immutable)</span>}
                        </Label>
                        <Input
                          id="org-domain"
                          placeholder="example.com"
                          value={formData.domain}
                          onChange={(e) => handleInputChange("domain", e.target.value)}
                          disabled={!!editingOrg}
                          className={cn(
                            "h-9 font-mono border-slate-200 bg-white rounded-lg text-xs",
                            errors.domain && "border-destructive focus-visible:ring-destructive/20",
                            !!editingOrg && "bg-slate-50 text-slate-400 cursor-not-allowed"
                          )}
                        />
                        {errors.domain && (
                          <span className="text-[11px] text-destructive block">{errors.domain}</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="org-email"
                          className={cn(
                            "text-xs font-medium text-slate-700",
                            errors.currentEmail && "text-destructive"
                          )}
                        >
                          General contact email
                        </Label>
                        <Input
                          id="org-email"
                          type="email"
                          placeholder="info@example.com"
                          value={formData.currentEmail}
                          onChange={(e) => handleInputChange("currentEmail", e.target.value)}
                          className={cn(
                            "h-9 border-slate-200 bg-white rounded-lg text-xs",
                            errors.currentEmail && "border-destructive focus-visible:ring-destructive/20"
                          )}
                        />
                        {errors.currentEmail && (
                          <span className="text-[11px] text-destructive block">{errors.currentEmail}</span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="org-address" className="text-xs font-medium text-slate-700">
                          Physical address
                        </Label>
                        <Input
                          id="org-address"
                          placeholder="Street, City, Country"
                          value={formData.address}
                          onChange={(e) => handleInputChange("address", e.target.value)}
                          className="h-9 border-slate-200 bg-white rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    {/* Educational toggle */}
                    <div className="flex items-center justify-between p-4 border border-slate-200/80 rounded-lg bg-slate-50/50">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="org-is-edu" className="text-xs font-medium text-slate-800 cursor-pointer">
                          Educational institution
                        </Label>
                        <span className="text-xs text-slate-500 block leading-relaxed">
                          Toggle on if this organization represents a school, college, or academic body.
                        </span>
                      </div>
                      <Switch
                        id="org-is-edu"
                        checked={formData.isEducation}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, isEducation: checked }))
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Representative contact */}
                  <div className="space-y-4">
                    <div className="text-xs font-medium text-slate-700">
                      Authorized representative
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="org-desc" className="text-xs font-medium text-slate-700">
                        Description (optional)
                      </Label>
                      <Textarea
                        id="org-desc"
                        placeholder="Brief description of the organization..."
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        className="min-h-[72px] border-slate-200 bg-white rounded-lg text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="contact-name"
                        className={cn(
                          "text-xs font-medium text-slate-700",
                          errors.contactName && "text-destructive"
                        )}
                      >
                        Representative name *
                      </Label>
                      <Input
                        id="contact-name"
                        placeholder="Contact name"
                        value={formData.contactName}
                        onChange={(e) => handleInputChange("contactName", e.target.value)}
                        className={cn(
                          "h-9 border-slate-200 bg-white rounded-lg text-xs",
                          errors.contactName && "border-destructive focus-visible:ring-destructive/20"
                        )}
                      />
                      {errors.contactName && (
                        <span className="text-[11px] text-destructive block">{errors.contactName}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="contact-phone"
                          className={cn(
                            "text-xs font-medium text-slate-700",
                            errors.contactPhone && "text-destructive"
                          )}
                        >
                          Phone number
                        </Label>
                        <Input
                          id="contact-phone"
                          placeholder="+1 555 0100"
                          value={formData.contactPhone}
                          onChange={(e) => handleInputChange("contactPhone", e.target.value)}
                          className={cn(
                            "h-9 border-slate-200 bg-white rounded-lg text-xs",
                            errors.contactPhone && "border-destructive focus-visible:ring-destructive/20"
                          )}
                        />
                        {errors.contactPhone && (
                          <span className="text-[11px] text-destructive block">{errors.contactPhone}</span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="contact-email"
                          className={cn(
                            "text-xs font-medium text-slate-700",
                            errors.contactEmail && "text-destructive"
                          )}
                        >
                          Direct email *
                        </Label>
                        <Input
                          id="contact-email"
                          type="email"
                          placeholder="representative@example.com"
                          value={formData.contactEmail}
                          onChange={(e) => handleInputChange("contactEmail", e.target.value)}
                          className={cn(
                            "h-9 border-slate-200 bg-white rounded-lg text-xs",
                            errors.contactEmail && "border-destructive focus-visible:ring-destructive/20"
                          )}
                        />
                        {errors.contactEmail && (
                          <span className="text-[11px] text-destructive block">{errors.contactEmail}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Danger zone in edit mode */}
                  {editingOrg && (
                    <div className="space-y-3 pt-2">
                      <Separator />
                      <div className="p-4 bg-rose-50/50 border border-rose-200/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-rose-900">Delete organization</p>
                          <p className="text-xs text-rose-700/80 leading-relaxed">
                            Permanently decommission DNS configurations, website data, and access for {editingOrg.name}.
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 px-3 text-xs font-medium rounded-lg shrink-0"
                          onClick={() => {
                            setIsDialogOpen(false)
                            setIsDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="rounded-lg text-xs font-medium h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveOrg}
                  disabled={isSubmitting}
                  className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-5 rounded-lg text-xs"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  ) : editingOrg ? (
                    "Save changes"
                  ) : (
                    "Confirm registration"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Sign out confirmation dialog */}
          <AlertDialog open={isSignOutOpen} onOpenChange={setIsSignOutOpen}>
            <AlertDialogContent className="bg-white border-slate-200 rounded-xl max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
                  Sign out
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to sign out? You will need to log back in to access your organizations and services.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 pt-2">
                <AlertDialogCancel
                  disabled={isLoggingOut}
                  className="h-9 text-xs font-medium rounded-lg"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="h-9 text-xs font-medium bg-destructive hover:bg-destructive/90 text-white rounded-lg"
                >
                  {isLoggingOut && (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                  )}
                  Sign out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Organization deletion confirmation dialog */}
          <AlertDialog
            open={isDeleteDialogOpen}
            onOpenChange={(open) => {
              setIsDeleteDialogOpen(open)
              if (!open) {
                setDeleteConfirmName("")
                if (typeof document !== "undefined") {
                  document.body.style.pointerEvents = ""
                }
              }
            }}
          >
            <AlertDialogContent className="max-w-md bg-white border border-slate-200 rounded-xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
                  Confirm organization deletion
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-xs text-slate-500 pt-1">
                    <p className="leading-relaxed">
                      Permanently delete <span className="font-medium text-slate-900">&quot;{editingOrg?.name}&quot;</span>. All DNS records, website configurations, and team access will be decommissioned. This action cannot be undone.
                    </p>
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs font-medium text-slate-700">
                        Type &quot;{editingOrg?.name}&quot; to confirm:
                      </Label>
                      <Input
                        placeholder={editingOrg?.name || "Organization name"}
                        value={deleteConfirmName}
                        onChange={(e) => setDeleteConfirmName(e.target.value)}
                        className="h-9 border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 pt-2">
                <AlertDialogCancel
                  onClick={() => {
                    setDeleteConfirmName("")
                    setIsDeleteDialogOpen(false)
                    if (typeof document !== "undefined") {
                      document.body.style.pointerEvents = ""
                    }
                  }}
                  className="text-xs h-9 font-medium rounded-lg"
                >
                  Cancel
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={handleDeleteOrg}
                  disabled={deleteConfirmName.trim() !== editingOrg?.name?.trim() || isSubmitting}
                  className="text-xs h-9 px-4 font-medium rounded-lg"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    "Delete organization"
                  )}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </DashboardShell>
  )
}
