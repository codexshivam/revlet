
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
  Check,
  Settings,
  CreditCard,
  Key,
  User,
  LifeBuoy,
  Activity,
  Shield,
  Sparkles,
  Clock,
  ArrowRight,
  ChevronRight,
  Star,
  Database,
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
  DialogTrigger,
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
  onSnapshot
} from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
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
  workspaceStatus?: 'none' | 'applied' | 'pending' | 'active'
  createdAt: any
}

function TableSkeleton() {
  return (
    <div className="w-full divide-y divide-slate-150 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-5 pl-8 pr-8">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-slate-100 rounded border border-slate-200" />
            <div className="flex flex-col gap-1.5">
              <div className="h-4 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-16 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="h-4 w-28 bg-slate-100 rounded hidden md:block" />
          <div className="h-8 w-20 bg-slate-100 rounded" />
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
  const { activeOrgId, setActiveOrgId } = useActiveOrg()

  const [greeting, setGreeting] = useState("Welcome back")

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting("Good morning")
    else if (hour < 17) setGreeting("Good afternoon")
    else setGreeting("Good evening")
  }, [])
  
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
  
  // Form State — matches Organization data model exactly
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
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
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
      tempErrors.domain = "Enter a valid domain (e.g. company.com)"
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
      setLocalDisplayName(user.displayName || "Administrative Portal")
      setAccountName(user.displayName || "")
    }
  }, [user])

  useEffect(() => {
    // Safety cleanup: Guarantee document.body pointer-events is restored whenever dialogs close
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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Organization[]

      const sortedOrgs = fetchedOrgs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0
        const timeB = b.createdAt?.toMillis?.() || 0
        return timeB - timeA
      })

      setOrgs(sortedOrgs)
      setIsLoadingOrgs(false)
      if (user && user.email && snapshot.docChanges().some(change => change.type === "added")) {
        syncUserOrganizations(db, user.uid, user.email, user.displayName || "")
      }
    }, (error) => {
      const permissionError = new FirestorePermissionError({
        path: 'organizations',
        operation: 'list',
      })
      errorEmitter.emit('permission-error', permissionError)
      setIsLoadingOrgs(false)
    })

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
        title: "Validation Failed",
        description: "Please correct the highlighted fields before submitting."
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (!editingOrg) {
        // Note: Domain uniqueness should ideally be checked server-side
        // to comply with Firestore security rules preventing global reads.
      }

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
          updatedAt: serverTimestamp()
        })
        toast({ title: "Organization Updated", description: "Details have been saved successfully." })
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
          createdAt: serverTimestamp()
        })
        toast({ title: "Organization Registered", description: `${formData.name} has been added to your account.` })
      }
      setIsDialogOpen(false)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Operation Failed", description: error.message || "An unexpected error occurred." })
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
        // Fallback to client SDK deleteDoc if needed
        const { deleteDoc, doc } = await import("firebase/firestore")
        await deleteDoc(doc(db, "organizations", editingOrg.id))
      }

      toast({ 
        title: "Organization Deleted", 
        description: `"${editingOrg.name}" has been permanently removed.` 
      })

      // If the deleted org was currently active in localStorage, switch to another
      if (typeof window !== "undefined") {
        const storedId = localStorage.getItem("selectedOrgId")
        if (storedId === editingOrg.id) {
          const remaining = orgs.filter(o => o.id !== editingOrg.id)
          const nextId = remaining.length > 0 ? remaining[0].id : ""
          if (nextId) {
            localStorage.setItem("selectedOrgId", nextId)
          } else {
            localStorage.removeItem("selectedOrgId")
          }
          window.dispatchEvent(new Event("active-org-changed"))
        }
      }

      setIsDeleteDialogOpen(false)
      setIsDialogOpen(false)
      setDeleteConfirmName("")
      setEditingOrg(null)
    } catch (error: any) {
      console.error("Error deleting organization:", error)
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: error.message || "Could not delete organization. Please try again.",
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
      toast({ title: "Account Name Updated", description: "Your display name has been changed." })
    } catch {
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update display name. Please try again." })
    } finally {
      setIsUpdatingAccount(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await signOut(auth)
      toast({
        title: "Signed Out",
        description: "You have been signed out of your account."
      })
      router.push("/login")
    } catch {
      toast({ variant: "destructive", title: "Sign Out Failed", description: "Please try again." })
      setIsLoggingOut(false)
    }
  }

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs font-medium text-slate-500">Initializing secure session...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* RESPONSIVE MINIMALIST HEADER */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-3xl sm:text-4xl font-headline font-bold text-slate-900 tracking-tight">
              {localDisplayName}
            </h1>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 bg-white border-slate-200 hover:bg-slate-50 transition-colors rounded-lg shadow-sm">
                    <MoreVertical className="w-4 h-4 text-slate-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200">
                  <DropdownMenuItem onSelect={() => setIsEditNameOpen(true)} className="gap-2 py-2.5 cursor-pointer">
                    <Edit2 className="w-4 h-4 text-slate-400" />
                    <span className="text-xs">Update account name</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsSignOutOpen(true)} className="gap-2 py-2.5 text-destructive cursor-pointer">
                    <LogOut className="w-4 h-4" />
                    <span className="text-xs">Logout session</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button onClick={handleOpenCreate} className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 shadow-sm rounded-lg text-xs">
                <Plus className="w-4 h-4 mr-2" />
                Register Organization
              </Button>
            </div>
          </div>
        </div>

        {/* ORGANIZATIONS SECTION */}
        <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-xl">
          <div className="h-1 w-full bg-primary/20" />
          <CardContent className="p-0 min-h-[300px]">
            {isLoadingOrgs ? (
              <TableSkeleton />
            ) : orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-4 px-4">
                <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-slate-200" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-headline font-bold text-slate-900">No Organizations Registered</h3>
                  <p className="text-sm text-slate-500 max-w-xs">Start by registering your first organization to manage DNS, websites, and team access.</p>
                </div>
                <Button variant="outline" onClick={handleOpenCreate} className="mt-2 font-bold rounded-lg h-9 px-4 text-xs">
                  Register First Organization
                </Button>
              </div>
            ) : (
              <>
                {/* DESKTOP TABLE VIEW */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200">
                        <TableHead className="text-xs font-medium py-3.5 pl-8 text-slate-500">Organization</TableHead>
                        <TableHead className="text-xs font-medium py-3.5 text-slate-500">Managed domain</TableHead>
                        <TableHead className="text-xs font-medium py-3.5 text-right pr-8 text-slate-500">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgs.map((org) => (
                        <TableRow key={org.id} className="group transition-colors border-b border-slate-100 last:border-0 hover:bg-[#F8FAFC]">
                          <TableCell className="pl-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "p-2.5 rounded-lg border transition-all",
                                org.isEducation 
                                  ? "bg-blue-50 border-blue-100 text-blue-600 group-hover:bg-blue-100/50" 
                                  : "bg-slate-100 border-slate-200 text-slate-400 group-hover:bg-primary/5 group-hover:text-primary"
                              )}>
                                {org.isEducation ? (
                                  <GraduationCap className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <Building2 className="w-4 h-4" />
                                )}
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-slate-800 text-sm">{org.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-slate-400">{org.code}</span>
                                  {org.isEducation && (
                                    <Badge className="text-[10px] h-4 font-medium px-1.5 bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-50">
                                      Education
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-slate-300" />
                              <span className="text-xs font-semibold text-slate-600">{org.domain}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            {org.ownerId === user?.uid ? (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-8 font-bold text-xs gap-2 border-slate-200 hover:bg-primary hover:text-white transition-all shadow-sm rounded-lg"
                                onClick={() => handleOpenEdit(org)}
                              >
                                Manage
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-2.5 py-1 font-bold shadow-none rounded border bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-500">
                                Staff Member
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* MOBILE INTERACTIVE WIDGETS LIST */}
                <div className="block md:hidden space-y-6 py-6 px-4">
                  {orgs.map((org) => (
                    <div 
                      key={org.id} 
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-6 relative overflow-hidden transition-all shadow-sm flex flex-col gap-5"
                    >
                      <div 
                        className={cn(
                          "absolute left-0 top-0 bottom-0 w-[5px]",
                          org.isEducation ? "bg-blue-600" : "bg-slate-400"
                        )}
                      />
                      
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "p-3 rounded-xl border shrink-0",
                            org.isEducation 
                              ? "bg-blue-50 border-blue-100 text-blue-600" 
                              : "bg-slate-50 border-slate-200 text-slate-400"
                          )}>
                            {org.isEducation ? (
                              <GraduationCap className="w-5 h-5 text-blue-600" />
                            ) : (
                              <Building2 className="w-5 h-5" />
                            )}
                          </div>
                          <div className="flex flex-col gap-0.5 truncate">
                            <span className="font-headline font-bold text-slate-800 text-sm leading-snug truncate max-w-[180px]">{org.name}</span>
                            <span className="font-mono text-[10px] text-slate-400">{org.code}</span>
                          </div>
                        </div>
                        
                        {org.ownerId === user?.uid ? (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-9 w-9 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl shrink-0"
                            onClick={() => handleOpenEdit(org)}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium shadow-none rounded border bg-slate-50 text-slate-500 border-slate-200 shrink-0 hover:bg-slate-50 hover:text-slate-500">
                            Staff
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pl-0.5">
                        {org.isEducation && (
                          <Badge className="text-[10px] h-5 font-medium px-2 bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-50">
                            Education
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-600 text-xs">
                        <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-semibold truncate">{org.domain}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* PERSISTENT PROGRAMMATIC DIALOGS */}
        <div className="dialogs-portal">
          {/* Edit Account Name Dialog */}
          <Dialog open={isEditNameOpen} onOpenChange={setIsEditNameOpen}>
            <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-lg border border-slate-200">
              <DialogHeader className="border-b border-slate-100 bg-white p-6">
                <DialogTitle className="font-headline font-semibold text-lg text-slate-900">Update Account Name</DialogTitle>
              </DialogHeader>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-name" className="text-xs font-medium text-slate-700 block">Display Name</Label>
                  <Input 
                    id="acc-name" 
                    value={accountName} 
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                  />
                </div>
              </div>
              <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsEditNameOpen(false)} className="rounded text-xs font-medium h-9">Cancel</Button>
                <Button onClick={handleUpdateAccountName} disabled={isUpdatingAccount} className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded text-xs">
                  {isUpdatingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Register / Edit Organization Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden rounded-lg border border-slate-200">
              <DialogHeader className="border-b border-slate-100 bg-white p-6">
                <DialogTitle className="font-headline font-semibold text-lg text-slate-900">
                  {editingOrg ? "Edit Organization Details" : "Register Organization"}
                </DialogTitle>
              </DialogHeader>
              
              <ScrollArea className="max-h-[70vh]">
                <div className="p-8 space-y-8">
                  {/* Core Details */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Building2 className="w-4 h-4" />
                      <h3 className="text-xs font-medium text-slate-700">Organization Core Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label 
                          htmlFor="org-name" 
                          className={cn("text-xs font-medium text-slate-700 block", errors.name && "text-red-500")}
                        >
                          Organization Legal Name *
                        </Label>
                        <Input 
                          id="org-name" 
                          placeholder="e.g. Example Company" 
                          value={formData.name}
                          onChange={(e) => handleInputChange("name", e.target.value)}
                          className={cn("h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3", errors.name && "border-red-400 focus-visible:ring-red-400/20")}
                        />
                        {errors.name && <span className="text-[10px] text-red-500 font-semibold block pt-0.5">{errors.name}</span>}
                      </div>
                      <div className="space-y-1.5">
                        <Label 
                          htmlFor="org-domain" 
                          className={cn("text-xs font-medium text-slate-700 block", errors.domain && "text-red-500")}
                        >
                          Managed Domain * {editingOrg && <span className="normal-case text-slate-400">(immutable)</span>}
                        </Label>
                        <Input 
                          id="org-domain" 
                          placeholder="e.g. example.com" 
                          value={formData.domain}
                          onChange={(e) => handleInputChange("domain", e.target.value)}
                          disabled={!!editingOrg}
                          className={cn("h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3", errors.domain && "border-red-400 focus-visible:ring-red-400/20", !!editingOrg && "bg-slate-50 text-slate-400 cursor-not-allowed")}
                        />
                        {errors.domain && <span className="text-[10px] text-red-500 font-semibold block pt-0.5">{errors.domain}</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label 
                          htmlFor="org-email" 
                          className={cn("text-xs font-medium text-slate-700 block", errors.currentEmail && "text-red-500")}
                        >
                          General Contact Email
                        </Label>
                        <Input 
                          id="org-email" 
                          type="email"
                          placeholder="info@yourcompany.com" 
                          value={formData.currentEmail}
                          onChange={(e) => handleInputChange("currentEmail", e.target.value)}
                          className={cn("h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3", errors.currentEmail && "border-red-400 focus-visible:ring-red-400/20")}
                        />
                        {errors.currentEmail && <span className="text-[10px] text-red-500 font-semibold block pt-0.5">{errors.currentEmail}</span>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="org-address" className="text-xs font-medium text-slate-700 block">Physical Address</Label>
                        <Input 
                          id="org-address" 
                          placeholder="Street, City, Country" 
                          value={formData.address}
                          onChange={(e) => handleInputChange("address", e.target.value)}
                          className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                        />
                      </div>
                    </div>

                    {/* Educational Institution Checkbox */}
                    <div className="flex items-center justify-between p-4 border border-slate-200/80 rounded-lg bg-slate-50/40 shadow-sm transition-all hover:bg-slate-50">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="org-is-edu" className="text-xs font-medium text-slate-800 cursor-pointer">Educational Institution</Label>
                        <span className="text-xs text-slate-500 block leading-normal">Toggle on if this organization represents a school, college, university, or academic body.</span>
                      </div>
                      <Switch
                        id="org-is-edu"
                        checked={formData.isEducation}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isEducation: checked }))}
                      />
                    </div>
                  </div>
 
                  {/* Contact Details */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Info className="w-4 h-4" />
                      <h3 className="text-xs font-medium text-slate-700">Authorized Representative</h3>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="org-desc" className="text-xs font-medium text-slate-700 block">Brief Description</Label>
                      <Textarea 
                        id="org-desc" 
                        placeholder="Briefly describe the organization's business operations..." 
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        className="min-h-[80px] border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label 
                        htmlFor="contact-name" 
                        className={cn("text-xs font-medium text-slate-700 block", errors.contactName && "text-red-500")}
                      >
                        Representative Full Name *
                      </Label>
                      <Input 
                        id="contact-name" 
                        placeholder="Authorized Contact Name" 
                        value={formData.contactName}
                        onChange={(e) => handleInputChange("contactName", e.target.value)}
                        className={cn("h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3", errors.contactName && "border-red-400 focus-visible:ring-red-400/20")}
                      />
                      {errors.contactName && <span className="text-[10px] text-red-500 font-semibold block pt-0.5">{errors.contactName}</span>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label 
                          htmlFor="contact-phone" 
                          className={cn("text-xs font-medium text-slate-700 block", errors.contactPhone && "text-red-500")}
                        >
                          Contact Mobile
                        </Label>
                        <Input 
                          id="contact-phone" 
                          placeholder="+X XXXXXXXXXX" 
                          value={formData.contactPhone}
                          onChange={(e) => handleInputChange("contactPhone", e.target.value)}
                          className={cn("h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3", errors.contactPhone && "border-red-400 focus-visible:ring-red-400/20")}
                        />
                        {errors.contactPhone && <span className="text-[10px] text-red-500 font-semibold block pt-0.5">{errors.contactPhone}</span>}
                      </div>
                      <div className="space-y-1.5">
                        <Label 
                          htmlFor="contact-email" 
                          className={cn("text-xs font-medium text-slate-700 block", errors.contactEmail && "text-red-500")}
                        >
                          Direct Email *
                        </Label>
                        <Input 
                          id="contact-email" 
                          type="email"
                          placeholder="contact@yourcompany.com" 
                          value={formData.contactEmail}
                          onChange={(e) => handleInputChange("contactEmail", e.target.value)}
                          className={cn("h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3", errors.contactEmail && "border-red-400 focus-visible:ring-red-400/20")}
                        />
                        {errors.contactEmail && <span className="text-[10px] text-red-500 font-semibold block pt-0.5">{errors.contactEmail}</span>}
                      </div>
                    </div>
                  </div>
 
                  {/* Danger Zone — Edit mode only */}
                  {editingOrg && (
                    <div className="space-y-4 pt-4">
                      <Separator />
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="w-4 h-4" />
                        <h3 className="text-xs font-semibold text-red-700">Danger Zone</h3>
                      </div>
                      <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex flex-col gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-red-900">Delete Organization</p>
                          <p className="text-xs text-red-700/80 leading-relaxed">
                            This action is permanent and cannot be reversed. All associated DNS configurations, website data, and service settings will be permanently decommissioned.
                          </p>
                        </div>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="w-fit font-medium gap-2"
                          onClick={() => {
                            setIsDialogOpen(false)
                            setIsDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Organization
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
 
              <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
                <Button onClick={handleSaveOrg} disabled={isSubmitting} className="px-6 font-medium h-10 bg-primary hover:bg-primary/95 !text-white text-white shadow-sm rounded text-xs">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : editingOrg ? "Save Changes" : "Confirm Registration"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Sign Out Confirmation Dialog */}
          <AlertDialog open={isSignOutOpen} onOpenChange={setIsSignOutOpen}>
            <AlertDialogContent className="bg-white border-slate-200 max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-lg font-bold text-slate-900">
                  Sign out of Revlet?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-slate-500 leading-relaxed">
                  Are you sure you want to sign out? You will need to log back in with your credentials to access your organizations and services.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-2 pt-2">
                <AlertDialogCancel disabled={isLoggingOut} className="border-slate-200 text-slate-700 hover:bg-slate-50">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium gap-2"
                >
                  {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  <span>Sign Out</span>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Deletion Confirmation Dialog */}
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => {
            setIsDeleteDialogOpen(open)
            if (!open) {
              setDeleteConfirmName("")
              if (typeof document !== "undefined") {
                document.body.style.pointerEvents = ""
              }
            }
          }}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-600 font-headline font-bold text-lg">Confirm Organization Deletion</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-4 text-left text-sm text-muted-foreground">
                    <p className="font-bold text-slate-900 text-sm">
                      Are you absolutely sure? This will permanently remove &quot;{editingOrg?.name}&quot;.
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      All DNS records, website configurations, and team member access for this organization will be permanently decommissioned. This action cannot be undone.
                    </p>
                    <div className="space-y-2 pt-2">
                      <Label className="text-xs font-semibold text-slate-700">Type &quot;{editingOrg?.name}&quot; to confirm:</Label>
                      <Input 
                        placeholder={editingOrg?.name || "Organization name"} 
                        value={deleteConfirmName}
                        onChange={(e) => setDeleteConfirmName(e.target.value)}
                        className="border-red-200 focus-visible:ring-red-500 h-10 text-xs px-3"
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => {
                  setDeleteConfirmName("")
                  setIsDeleteDialogOpen(false)
                  if (typeof document !== "undefined") {
                    document.body.style.pointerEvents = ""
                  }
                }} className="text-xs h-9 font-bold">Cancel</AlertDialogCancel>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteOrg}
                  disabled={deleteConfirmName.trim() !== editingOrg?.name?.trim() || isSubmitting}
                  className="font-bold text-xs h-9 px-4"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Delete Organization"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </DashboardShell>
  )
}
