
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
  Edit2, 
  LogOut, 
  Globe, 
  Loader2, 
  Info,
  Trash2,
  AlertTriangle,
  Clock,
  GraduationCap
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
import { useAuth, useUser, useFirestore } from "@/firebase"
import { signOut, updateProfile } from "firebase/auth"
import { useRouter } from "next/navigation"
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  doc,
  serverTimestamp,
  getDocs
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
  cloudflareZoneId: string
  contactName: string
  contactPhone: string
  contactEmail: string
  description: string
  code: string
  ownerId: string
  status?: string
  gEducation?: boolean
  createdAt: any
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
  
  // Form State
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
    gEducation: false
  })
  
  const [accountName, setAccountName] = useState("")
  const [localDisplayName, setLocalDisplayName] = useState("")
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false)

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
    }, async (error: any) => {
      const permissionError = new FirestorePermissionError({
        path: 'organizations',
        operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
      setIsLoadingOrgs(false)
    })

    return () => unsubscribe()
  }, [user, authLoading, db, router])

  const handleOpenEdit = (org: Organization) => {
    setEditingOrg(org)
    setFormData({
      name: org.name,
      address: org.address,
      phone: org.phone,
      currentEmail: org.currentEmail,
      domain: org.domain,
      contactName: org.contactName,
      contactPhone: org.contactPhone,
      contactEmail: org.contactEmail,
      description: org.description,
      gEducation: org.gEducation || false
    })
    setIsDialogOpen(true)
  }

  const handleOpenCreate = () => {
    setEditingOrg(null)
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
      gEducation: false
    })
    setIsDialogOpen(true)
  }

  const handleSaveOrg = async () => {
    if (!user) return
    
    if (!formData.name || !formData.domain || !formData.contactEmail) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Organization name, domain, and contact email are mandatory."
      })
      return
    }

    setIsSubmitting(true)
    try {
      if (!editingOrg) {
        const orgsRef = collection(db, "organizations")
        const q = query(orgsRef, where("domain", "==", formData.domain.toLowerCase()))
        const querySnapshot = await getDocs(q)
        
        if (!querySnapshot.empty) {
          toast({
            variant: "destructive",
            title: "Domain Already Registered",
            description: "This domain is already associated with an organization in our network."
          })
          setIsSubmitting(false)
          return
        }
      }

      if (editingOrg) {
        const orgRef = doc(db, "organizations", editingOrg.id)
        updateDoc(orgRef, {
          ...formData,
          domain: formData.domain.toLowerCase(),
          updatedAt: serverTimestamp()
        }).catch(async (error) => {
          const permissionError = new FirestorePermissionError({
            path: orgRef.path,
            operation: 'update',
            requestResourceData: formData,
          });
          errorEmitter.emit('permission-error', permissionError);
        })
        toast({ title: "Updated", description: "Organization details saved." })
      } else {
        const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
        const orgCode = `${formData.name.substring(0, 3).toUpperCase()}-${uniqueSuffix}`
        
        const orgsRef = collection(db, "organizations")
        addDoc(orgsRef, {
          ...formData,
          domain: formData.domain.toLowerCase(),
          code: orgCode,
          ownerId: user.uid,
          createdAt: serverTimestamp()
        }).catch(async (error) => {
          const permissionError = new FirestorePermissionError({
            path: 'organizations',
            operation: 'create',
            requestResourceData: formData,
          });
          errorEmitter.emit('permission-error', permissionError);
        })
        toast({ title: "Success", description: "Organization registered." })
      }
      setIsDialogOpen(false)
    } catch (error: any) {
      toast({ variant: "destructive", title: "Operation Failed", description: error.message })
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
        toast({ title: "Request Submitted", description: "The organization has been marked for permanent deletion." })
        setIsDeleteDialogOpen(false)
        setIsDialogOpen(false)
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: orgRef.path,
          operation: 'update',
          requestResourceData: { status: "Pending Deletion" }
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsSubmitting(false)
      })
  }

  const handleUpdateAccountName = async () => {
    if (!user || !accountName) return
    setIsUpdatingAccount(true)
    try {
      await updateProfile(user, { displayName: accountName })
      setLocalDisplayName(accountName)
      setIsEditNameOpen(false)
      toast({ title: "Account Name Updated" })
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed" })
    } finally {
      setIsUpdatingAccount(false)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push("/login")
    } catch (error) {
      toast({ variant: "destructive", title: "Sign out failed" })
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
                  <Button variant="outline" size="icon" className="h-10 w-10 bg-white border-slate-200">
                    <MoreVertical className="w-4 h-4 text-slate-600" />
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

              <Dialog open={isEditNameOpen} onOpenChange={setIsEditNameOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Account Name</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="acc-name">New Account Name</Label>
                      <Input 
                        id="acc-name" 
                        value={accountName} 
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="e.g. Sagar Poudel"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsEditNameOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateAccountName} disabled={isUpdatingAccount}>
                      {isUpdatingAccount ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Save Changes"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleOpenCreate} className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 shadow-md shadow-primary/10">
                    <Plus className="w-4 h-4 mr-2" />
                    Register Organization
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden">
                  <DialogHeader className="bg-slate-900 text-white p-6">
                    <DialogTitle className="font-headline font-bold text-xl">
                      {editingOrg ? "Edit Organization Details" : "Register Organization"}
                    </DialogTitle>
                  </DialogHeader>
                  
                  <ScrollArea className="max-h-[70vh]">
                    <div className="p-8 space-y-8">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <Building2 className="w-4 h-4" />
                          <h3 className="text-[10px] font-bold uppercase tracking-wider">Organization Core Details</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="org-name" className="text-[10px] font-bold text-slate-500 uppercase">Organization Legal Name</Label>
                            <Input 
                              id="org-name" 
                              placeholder="e.g. Revlet Tech Solutions" 
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="org-domain" className="text-[10px] font-bold text-slate-500 uppercase">Domain</Label>
                            <Input 
                              id="org-domain" 
                              placeholder="e.g. revlet.me" 
                              value={formData.domain}
                              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                            />
                          </div>
                        </div>

                        {/* Classification Field */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-lg shadow-sm">
                              <GraduationCap className={cn("w-4 h-4", formData.gEducation ? "text-primary" : "text-slate-400")} />
                            </div>
                            <div className="space-y-0.5">
                              <Label htmlFor="is-edu" className="text-xs font-bold text-slate-900">Educational Institution</Label>
                              <p className="text-[10px] text-slate-400 font-medium leading-tight">Enable Education exclusive Workspace features and pricing.</p>
                            </div>
                          </div>
                          <Switch 
                            id="is-edu"
                            checked={formData.gEducation} 
                            onCheckedChange={(v) => setFormData({ ...formData, gEducation: v })} 
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="org-email" className="text-[10px] font-bold text-slate-500 uppercase">General Contact Email</Label>
                            <Input 
                              id="org-email" 
                              type="email"
                              placeholder="info@yourcompany.com" 
                              value={formData.currentEmail}
                              onChange={(e) => setFormData({ ...formData, currentEmail: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="org-address" className="text-[10px] font-bold text-slate-500 uppercase">Physical Office Address</Label>
                            <Input 
                              id="org-address" 
                              placeholder="Street, City, Country" 
                              value={formData.address}
                              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <Info className="w-4 h-4" />
                          <h3 className="text-[10px] font-bold uppercase tracking-wider">Infrastructure & Contact</h3>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="org-desc" className="text-[10px] font-bold text-slate-500 uppercase">Brief Description</Label>
                          <Textarea 
                            id="org-desc" 
                            placeholder="Briefly describe the business operations..." 
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="min-h-[100px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="contact-name" className="text-[10px] font-bold text-slate-500 uppercase">Representative Name</Label>
                          <Input 
                            id="contact-name" 
                            placeholder="Authorized Contact Name" 
                            value={formData.contactName}
                            onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="contact-phone" className="text-[10px] font-bold text-slate-500 uppercase">Contact Mobile</Label>
                            <Input 
                              id="contact-phone" 
                              placeholder="+X XXXXXXXXXX" 
                              value={formData.contactPhone}
                              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="contact-email" className="text-[10px] font-bold text-slate-500 uppercase">Direct Email</Label>
                            <Input 
                              id="contact-email" 
                              type="email"
                              placeholder="contact@yourcompany.com" 
                              value={formData.contactEmail}
                              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

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
                                This action is permanent and cannot be reversed. All associated DNS configurations, website data, and workspace settings will be wiped from our infrastructure.
                              </p>
                            </div>
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              className="w-fit font-bold gap-2"
                              onClick={() => setIsDeleteDialogOpen(true)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove Organization
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
                    <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-xs font-bold uppercase tracking-widest text-slate-400">Abort</Button>
                    <Button onClick={handleSaveOrg} disabled={isSubmitting} className="px-8 font-bold h-11 bg-slate-900 hover:bg-black text-white shadow-xl">
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : editingOrg ? "Update Details" : "Confirm Registration"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-red-600">Irreversible Action</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-4">
                      <p className="font-bold text-slate-900">
                        Are you absolutely sure? This will permanently remove "{editingOrg?.name}".
                      </p>
                      <p className="text-xs text-slate-500">
                        By confirming, you acknowledge that all DNS, Website, and workspace services for this organization will be decommissioned immediately.
                      </p>
                      <div className="space-y-2 pt-2">
                        <Label className="text-[10px] font-bold uppercase">To confirm, type "{editingOrg?.name}" below:</Label>
                        <Input 
                          placeholder="Type organization name" 
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

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
          <div className="h-1 w-full bg-primary/20" />
          <CardContent className="p-0 min-h-[400px]">
            {isLoadingOrgs ? (
              <div className="flex flex-col items-center justify-center py-32 gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-slate-200" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Directory...</p>
              </div>
            ) : orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-slate-200" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-headline font-bold text-slate-900">No Organizations Registered</h3>
                  <p className="text-sm text-slate-500 max-w-xs">Start by registering your first organization.</p>
                </div>
                <Button variant="outline" onClick={handleOpenCreate} className="mt-2 font-bold">
                  Add First Organization
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                    <TableHead className="text-[10px] font-bold uppercase py-5 pl-8 text-slate-400 tracking-widest">Organization Name</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Managed Domain</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-5 text-right pr-8 text-slate-400 tracking-widest">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                      <TableCell className="pl-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 group-hover:bg-primary/5 transition-all">
                            <Building2 className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">{org.name}</span>
                              {org.status === "Pending Deletion" && (
                                <Badge variant="destructive" className="text-[8px] h-4 font-bold px-1.5 uppercase tracking-tighter">
                                  <Clock className="w-2 h-2 mr-1" />
                                  Pending Deletion
                                </Badge>
                              )}
                              {org.gEducation && (
                                <Badge variant="outline" className="text-[8px] h-4 font-bold px-1.5 uppercase tracking-tighter bg-blue-50 text-blue-600 border-blue-100">
                                  <GraduationCap className="w-2 h-2 mr-1" />
                                  Education
                                </Badge>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-tighter">{org.code}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-slate-300" />
                          <span className="text-xs font-semibold text-slate-600">
                            {org.domain}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 font-bold text-xs gap-2 border-slate-200 hover:bg-primary hover:text-white transition-all shadow-sm"
                          onClick={() => handleOpenEdit(org)}
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
