
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MoreVertical, Plus, Building2, ExternalLink, Edit2, LogOut, Globe, Loader2, Info } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  serverTimestamp,
} from "firebase/firestore"

interface Organization {
  id: string
  name: string
  address: string
  phone: string
  currentEmail: string
  domain: string
  hasWebsite: boolean
  contactName: string
  contactPhone: string
  contactEmail: string
  description: string
  services: string[]
  code: string
  ownerId: string
  createdAt: any
}

export default function AccountHomePage() {
  const router = useRouter()
  const auth = useAuth()
  const db = useFirestore()
  const { user, loading: authLoading } = useUser()
  
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true)
  const [isAddingOrg, setIsAddingOrg] = useState(false)
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditNameOpen, setIsEditNameOpen] = useState(false)
  
  // Form State
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    currentEmail: "",
    domain: "",
    hasWebsite: false,
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    description: ""
  })
  
  const [accountName, setAccountName] = useState("")
  const [localDisplayName, setLocalDisplayName] = useState("")

  useEffect(() => {
    if (user) {
      setLocalDisplayName(user.displayName || "Administrative Portal")
      setAccountName(user.displayName || "")
    }
  }, [user])

  const userId = user?.uid
  useEffect(() => {
    // If auth is still loading, wait
    if (authLoading) return

    // If no user, redirect to login
    if (!userId) {
      setIsLoadingOrgs(false)
      router.push("/login")
      return
    }

    // Safety timeout to prevent infinite spinner
    const timer = setTimeout(() => {
      setIsLoadingOrgs(current => {
        if (current) {
          console.warn("Sync timeout reached")
          return false
        }
        return false
      })
    }, 8000)

    const orgsRef = collection(db, "organizations")
    // Simplified query to avoid index requirement during initial setup
    const q = query(
      orgsRef, 
      where("ownerId", "==", userId)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Organization[]

      // Sort client-side to avoid index requirement
      const sortedOrgs = fetchedOrgs.sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0
        const dateB = b.createdAt?.seconds || 0
        return dateB - dateA
      })

      setOrgs(sortedOrgs)
      setIsLoadingOrgs(false)
      clearTimeout(timer)
    }, (error) => {
      console.error("Error fetching organizations:", error)
      setIsLoadingOrgs(false)
      clearTimeout(timer)
      toast({
        variant: "destructive",
        title: "Synchronization Error",
        description: "Could not sync your institutions. Please check your connection."
      })
    })

    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [userId, authLoading, db, router])

  const handleAddOrg = async () => {
    if (!user) return
    
    // Basic validation
    if (!formData.name || !formData.domain || !formData.contactEmail) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Institution name, domain, and contact email are required."
      })
      return
    }

    setIsAddingOrg(true)
    try {
      const orgCode = `${formData.name.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`
      
      await addDoc(collection(db, "organizations"), {
        ...formData,
        services: ["DNS", "Hosting"],
        code: orgCode,
        ownerId: user.uid,
        createdAt: serverTimestamp()
      })

      toast({
        title: "Organization Registered",
        description: `${formData.name} has been successfully added to your directory.`
      })
      
      setFormData({
        name: "",
        address: "",
        phone: "",
        currentEmail: "",
        domain: "",
        hasWebsite: false,
        contactName: "",
        contactPhone: "",
        contactEmail: "",
        description: ""
      })
      setIsDialogOpen(false)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: "We couldn't register the institution. Please check your connection."
      })
    } finally {
      setIsAddingOrg(false)
    }
  }

  const handleUpdateAccountName = async () => {
    if (!user || !accountName) return

    setIsUpdatingAccount(true)
    try {
      await updateProfile(user, { displayName: accountName })
      setLocalDisplayName(accountName)
      setIsEditNameOpen(false)
      toast({
        title: "Profile Updated",
        description: "Your administrative name has been updated successfully."
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Failed to update profile name."
      })
    } finally {
      setIsUpdatingAccount(false)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      toast({ title: "Logged out", description: "You have been securely signed out." })
      router.push("/login")
    } catch (error: any) {
      toast({ variant: "destructive", title: "Logout Failed", description: "Error during sign out." })
    }
  }

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Synchronizing Session...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Portal Overview</span>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-headline font-bold text-slate-900 tracking-tight">
              {localDisplayName}
            </h1>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 bg-white border-slate-200 hover:bg-slate-50 shadow-sm transition-all active:scale-95">
                    <MoreVertical className="w-4 h-4 text-slate-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem 
                    onSelect={() => setIsEditNameOpen(true)}
                    className="cursor-pointer gap-2 py-2.5"
                  >
                    <Edit2 className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-sm">Update display name</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-2 py-2.5 text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4" />
                    <span className="font-medium text-sm">Logout session</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog open={isEditNameOpen} onOpenChange={setIsEditNameOpen}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-headline font-bold">Administrative Display Name</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="acc-name" className="text-xs font-bold text-slate-500 uppercase">New Display Name</Label>
                      <Input 
                        id="acc-name" 
                        value={accountName} 
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="e.g. Sagar Poudel"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsEditNameOpen(false)} className="text-xs font-bold uppercase tracking-tight">Cancel</Button>
                    <Button onClick={handleUpdateAccountName} disabled={isUpdatingAccount} className="font-bold">
                      {isUpdatingAccount ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Commit Changes"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 shadow-md shadow-primary/10 transition-all hover:-translate-y-0.5 active:translate-y-0">
                    <Plus className="w-4 h-4 mr-2" />
                    Register Institution
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl bg-white p-0 overflow-hidden border-none shadow-2xl">
                  <DialogHeader className="bg-slate-900 text-white p-6">
                    <DialogTitle className="font-headline font-bold text-xl">Institution Onboarding</DialogTitle>
                    <p className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-bold">Comprehensive Registration Protocol</p>
                  </DialogHeader>
                  
                  <ScrollArea className="max-h-[70vh]">
                    <div className="p-8 space-y-8">
                      {/* Section 1: Core Details */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <Building2 className="w-4 h-4" />
                          <h3 className="text-[10px] font-bold uppercase tracking-wider">Institution Core Details</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="org-name" className="text-[10px] font-bold text-slate-500 uppercase">Legal Institution Name</Label>
                            <Input 
                              id="org-name" 
                              placeholder="e.g. Kathmandu University" 
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="org-domain" className="text-[10px] font-bold text-slate-500 uppercase">Primary Domain</Label>
                            <Input 
                              id="org-domain" 
                              placeholder="e.g. ku.edu.np" 
                              value={formData.domain}
                              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="org-phone" className="text-[10px] font-bold text-slate-500 uppercase">Institutional Phone</Label>
                            <Input 
                              id="org-phone" 
                              placeholder="+977-1-XXXXXX" 
                              value={formData.phone}
                              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="org-email" className="text-[10px] font-bold text-slate-500 uppercase">General Contact Email</Label>
                            <Input 
                              id="org-email" 
                              type="email"
                              placeholder="info@institution.edu.np" 
                              value={formData.currentEmail}
                              onChange={(e) => setFormData({ ...formData, currentEmail: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="org-address" className="text-[10px] font-bold text-slate-500 uppercase">Physical Office Address</Label>
                          <Input 
                            id="org-address" 
                            placeholder="Street, City, Province, Nepal" 
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Section 2: Technical Status */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <Globe className="w-4 h-4" />
                          <h3 className="text-[10px] font-bold uppercase tracking-wider">Infrastructure & Status</h3>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-lg">
                          <div className="space-y-0.5">
                            <Label htmlFor="has-website" className="text-sm font-bold text-slate-900">Active Website?</Label>
                            <p className="text-[10px] text-slate-400">Is there an existing live platform for this domain?</p>
                          </div>
                          <Switch 
                            id="has-website"
                            checked={formData.hasWebsite}
                            onCheckedChange={(checked) => setFormData({ ...formData, hasWebsite: checked })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="org-desc" className="text-[10px] font-bold text-slate-500 uppercase">Institutional Brief / Level</Label>
                          <Textarea 
                            id="org-desc" 
                            placeholder="e.g. Higher Secondary, Bachelor/Masters Programs, Technical Vocational..." 
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="min-h-[100px]"
                          />
                        </div>
                      </div>

                      {/* Section 3: Point of Contact */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <Info className="w-4 h-4" />
                          <h3 className="text-[10px] font-bold uppercase tracking-wider">Primary Administrative Contact</h3>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="contact-name" className="text-[10px] font-bold text-slate-500 uppercase">Contact Person Full Name</Label>
                          <Input 
                            id="contact-name" 
                            placeholder="Authorized Representative Name" 
                            value={formData.contactName}
                            onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="contact-phone" className="text-[10px] font-bold text-slate-500 uppercase">Contact Mobile/Direct</Label>
                            <Input 
                              id="contact-phone" 
                              placeholder="+977-98XXXXXXXX" 
                              value={formData.contactPhone}
                              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="contact-email" className="text-[10px] font-bold text-slate-500 uppercase">Direct Administrative Email</Label>
                            <Input 
                              id="contact-email" 
                              type="email"
                              placeholder="admin.contact@domain.edu.np" 
                              value={formData.contactEmail}
                              onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>

                  <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
                    <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-xs font-bold uppercase tracking-widest text-slate-400">Abort</Button>
                    <Button onClick={handleAddOrg} disabled={isAddingOrg} className="px-8 font-bold h-11 bg-slate-900 hover:bg-black text-white shadow-xl">
                      {isAddingOrg ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Complete Registration"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl border-t-0">
          <div className="h-1.5 w-full bg-primary/10" />
          <CardContent className="p-0 min-h-[400px]">
            {isLoadingOrgs ? (
              <div className="flex flex-col items-center justify-center py-32 gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-slate-200" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Synchronizing Directory...</p>
              </div>
            ) : orgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-slate-200" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-headline font-bold text-slate-900">No Organizations Registered</h3>
                  <p className="text-sm text-slate-500 max-w-xs">Start by adding your first educational institution to the management dashboard.</p>
                </div>
                <Button variant="outline" onClick={() => setIsDialogOpen(true)} className="mt-2 font-bold h-9">
                  Register First Institution
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                    <TableHead className="text-[10px] font-bold uppercase py-5 pl-8 text-slate-400 tracking-widest">Institution Name</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Managed Domain</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Active Services</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-5 text-right pr-8 text-slate-400 tracking-widest">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                      <TableCell className="pl-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 group-hover:bg-primary/5 group-hover:border-primary/20 transition-all">
                            <Building2 className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-800 text-sm">{org.name}</span>
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
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {org.services?.map((s) => (
                            <Badge key={s} variant="secondary" className="bg-slate-100 text-[9px] font-bold text-slate-500 border-slate-200 py-0.5 h-5 px-2 tracking-tight group-hover:border-slate-300 transition-colors uppercase">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 font-bold text-xs gap-2 border-slate-200 hover:bg-primary hover:text-white transition-all shadow-sm"
                          onClick={() => router.push(`/services/dns?org=${org.id}`)}
                        >
                          Manage
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!isLoadingOrgs && orgs.length > 0 && (
              <div className="py-4 px-8 border-t border-slate-50 bg-slate-50/30">
                <p className="text-[10px] text-slate-400 font-medium">
                  Total Managed Organizations: {orgs.length} • Real-time database synchronization active
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
