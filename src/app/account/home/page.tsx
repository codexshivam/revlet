
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
import { 
  collection, 
  query, 
  where, 
  addDoc, 
  updateDoc,
  doc,
  serverTimestamp,
  onSnapshot
} from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import { cn } from "@/lib/utils"

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
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditNameOpen, setIsEditNameOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
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
    if (authLoading) return

    if (!user) {
      setIsLoadingOrgs(false)
      router.push("/login")
      return
    }

    const orgsRef = collection(db, "organizations")
    const q = query(orgsRef, where("ownerId", "==", user.uid))

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
        updateDoc(orgRef, {
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
        }).catch(async () => {
          const permissionError = new FirestorePermissionError({
            path: orgRef.path,
            operation: 'update',
            requestResourceData: formData,
          })
          errorEmitter.emit('permission-error', permissionError)
        })
        toast({ title: "Organization Updated", description: "Details have been saved successfully." })
      } else {
        const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
        const orgCode = `${formData.name.substring(0, 3).toUpperCase()}-${uniqueSuffix}`
        
        const orgsRef = collection(db, "organizations")
        addDoc(orgsRef, {
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
        }).catch(async () => {
          const permissionError = new FirestorePermissionError({
            path: 'organizations',
            operation: 'create',
            requestResourceData: formData,
          })
          errorEmitter.emit('permission-error', permissionError)
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
    if (!editingOrg) return
    setIsSubmitting(true)
    
    const orgRef = doc(db, "organizations", editingOrg.id)
    updateDoc(orgRef, { 
      status: "Pending Deletion",
      updatedAt: serverTimestamp()
    })
      .then(() => {
        toast({ title: "Deletion Requested", description: "The organization has been queued for permanent removal." })
        setIsDeleteDialogOpen(false)
        setIsDialogOpen(false)
        setDeleteConfirmName("")
      })
      .catch(async () => {
        const permissionError = new FirestorePermissionError({
          path: orgRef.path,
          operation: 'update',
          requestResourceData: { status: "Pending Deletion" }
        })
        errorEmitter.emit('permission-error', permissionError)
      })
      .finally(() => {
        setIsSubmitting(false)
      })
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
    try {
      await signOut(auth)
      router.push("/login")
    } catch {
      toast({ variant: "destructive", title: "Sign Out Failed", description: "Please try again." })
    }
  }

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Initialising Secure Session...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Home</span>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-headline font-bold text-slate-900 tracking-tight">
              {localDisplayName}
            </h1>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 bg-white border-slate-200 hover:bg-blue-600 hover:border-blue-600 transition-colors group">
                    <MoreVertical className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={() => setIsEditNameOpen(true)} className="gap-2 py-2.5">
                    <Edit2 className="w-4 h-4 text-slate-400" />
                    <span>Update account name</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="gap-2 py-2.5 text-destructive">
                    <LogOut className="w-4 h-4" />
                    <span>Logout session</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Edit Account Name Dialog */}
              <Dialog open={isEditNameOpen} onOpenChange={setIsEditNameOpen}>
                <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-lg border border-slate-200">
                  <DialogHeader className="border-b border-slate-100 bg-white p-6">
                    <DialogTitle className="font-headline font-semibold text-lg text-slate-900">Update Account Name</DialogTitle>
                  </DialogHeader>
                  <div className="p-6 space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="acc-name" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Display Name</Label>
                      <Input 
                        id="acc-name" 
                        value={accountName} 
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="e.g. Sagar Poudel"
                        className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                      />
                    </div>
                  </div>
                  <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setIsEditNameOpen(false)} className="rounded text-xs font-bold h-9">Cancel</Button>
                    <Button onClick={handleUpdateAccountName} disabled={isUpdatingAccount} className="bg-primary hover:bg-primary/95 text-white font-bold h-9 px-4 rounded text-xs">
                      {isUpdatingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              {/* Register / Edit Organization Dialog */}
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleOpenCreate} className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 shadow-md shadow-primary/10 rounded-lg">
                    <Plus className="w-4 h-4 mr-2" />
                    Register Organization
                  </Button>
                </DialogTrigger>
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
                          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Organization Core Details</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label 
                              htmlFor="org-name" 
                              className={cn("text-[10px] font-semibold uppercase tracking-wider block", errors.name ? "text-red-500" : "text-slate-500")}
                            >
                              Organization Legal Name *
                            </Label>
                            <Input 
                              id="org-name" 
                              placeholder="e.g. Revlet Tech Solutions" 
                              value={formData.name}
                              onChange={(e) => handleInputChange("name", e.target.value)}
                              className={cn("h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3", errors.name && "border-red-400 focus-visible:ring-red-400/20")}
                            />
                            {errors.name && <span className="text-[10px] text-red-500 font-semibold block pt-0.5">{errors.name}</span>}
                          </div>
                          <div className="space-y-1.5">
                            <Label 
                              htmlFor="org-domain" 
                              className={cn("text-[10px] font-semibold uppercase tracking-wider block", errors.domain ? "text-red-500" : "text-slate-500")}
                            >
                              Managed Domain * {editingOrg && <span className="normal-case text-slate-400">(immutable)</span>}
                            </Label>
                            <Input 
                              id="org-domain" 
                              placeholder="e.g. revlet.me" 
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
                              className={cn("text-[10px] font-semibold uppercase tracking-wider block", errors.currentEmail ? "text-red-500" : "text-slate-500")}
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
                            <Label htmlFor="org-address" className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">Physical Address</Label>
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
                            <Label htmlFor="org-is-edu" className="text-xs font-bold text-slate-800 cursor-pointer">Educational Institution</Label>
                            <span className="text-[10px] text-slate-400 block leading-normal">Toggle on if this organization represents a school, college, university, or academic body.</span>
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
                          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Authorized Representative</h3>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="org-desc" className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">Brief Description</Label>
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
                            className={cn("text-[10px] font-semibold uppercase tracking-wider block", errors.contactName ? "text-red-500" : "text-slate-500")}
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
                              className={cn("text-[10px] font-semibold uppercase tracking-wider block", errors.contactPhone ? "text-red-500" : "text-slate-500")}
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
                              className={cn("text-[10px] font-semibold uppercase tracking-wider block", errors.contactEmail ? "text-red-500" : "text-slate-500")}
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
                      {editingOrg && editingOrg.status !== "Pending Deletion" && (
                        <div className="space-y-4 pt-4">
                          <Separator />
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="w-4 h-4" />
                            <h3 className="text-[10px] font-bold uppercase tracking-wider">Danger Zone</h3>
                          </div>
                          <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex flex-col gap-4">
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-red-900">Request Organization Deletion</p>
                              <p className="text-xs text-red-700/80 leading-relaxed">
                                This action is permanent and cannot be reversed. All associated DNS configurations, website data, and service settings will be permanently decommissioned.
                              </p>
                            </div>
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              className="w-fit font-bold gap-2"
                              onClick={() => setIsDeleteDialogOpen(true)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Request Deletion
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
 
                  <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
                    <Button onClick={handleSaveOrg} disabled={isSubmitting} className="px-8 font-bold h-11 bg-primary hover:bg-primary/95 text-white shadow-sm rounded">
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : editingOrg ? "Save Changes" : "Confirm Registration"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Deletion Confirmation Dialog */}
              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-red-600">Confirm Organization Deletion</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-4">
                      <p className="font-bold text-slate-900">
                        Are you absolutely sure? This will permanently remove "{editingOrg?.name}".
                      </p>
                      <p className="text-xs text-slate-500">
                        All DNS records, website configurations, and team member access for this organization will be permanently decommissioned. This action cannot be undone.
                      </p>
                      <div className="space-y-2 pt-2">
                        <Label className="text-[10px] font-bold uppercase text-slate-700">Type "{editingOrg?.name}" to confirm:</Label>
                        <Input 
                          placeholder="Type organization name exactly" 
                          value={deleteConfirmName}
                          onChange={(e) => setDeleteConfirmName(e.target.value)}
                          className="border-red-200 focus-visible:ring-red-500"
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirmName("")}>Cancel</AlertDialogCancel>
                    <Button 
                      variant="destructive" 
                      onClick={handleDeleteOrg}
                      disabled={deleteConfirmName !== editingOrg?.name || isSubmitting}
                      className="font-bold"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Confirm Deletion"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        {/* Organizations Table */}
        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-lg">
          <div className="h-1 w-full bg-primary/20" />
          <CardContent className="p-0 min-h-[400px]">
            {isLoadingOrgs ? (
              <TableSkeleton />
            ) : orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-slate-200" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-headline font-bold text-slate-900">No Organizations Registered</h3>
                  <p className="text-sm text-slate-500 max-w-xs">Start by registering your first organization to manage DNS, websites, and team access.</p>
                </div>
                <Button variant="outline" onClick={handleOpenCreate} className="mt-2 font-bold rounded">
                  Register First Organization
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                    <TableHead className="text-[10px] font-bold uppercase py-5 pl-8 text-slate-400 tracking-widest">Organization</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Managed Domain</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-5 text-right pr-8 text-slate-400 tracking-widest">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id} className="group hover:bg-[#F8FAFC] transition-colors border-b border-slate-100 last:border-0">
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
                              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-tighter">{org.code}</span>
                              {org.isEducation && (
                                <Badge className="text-[8px] h-4 font-bold px-1.5 uppercase bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-50">
                                  Education
                                </Badge>
                              )}
                              {org.status === "Pending Deletion" && (
                                <Badge variant="destructive" className="text-[8px] h-4 font-bold px-1.5 uppercase tracking-tighter">
                                  Pending Deletion
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
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 font-bold text-xs gap-2 border-slate-200 hover:bg-primary hover:text-white transition-all shadow-sm rounded"
                          onClick={() => handleOpenEdit(org)}
                          disabled={org.status === "Pending Deletion"}
                        >
                          Manage
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
