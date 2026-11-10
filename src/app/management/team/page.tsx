
"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { UserPlus, MoreHorizontal, Building2, Loader2, Users as UsersIcon, Search, Trash2 } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { useUser, useFirestore, syncUserOrganizations } from "@/firebase"
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot
} from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'

interface Organization {
  id: string
  name: string
}

interface TeamMember {
  id: string
  email: string
  organizationId: string
  status: "Active" | "Inactive"
  ownerId: string
}

function TeamTableSkeleton() {
  return (
    <div className="w-full divide-y divide-slate-100 animate-pulse bg-white">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 sm:p-6 md:py-5 md:px-8 space-y-3 md:space-y-0 md:flex md:items-center md:justify-between">
          <div className="flex items-center justify-between md:justify-start gap-4 w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-100 rounded-full" />
              <div className="h-4 w-48 bg-slate-200 rounded" />
            </div>
            <div className="h-5 w-16 bg-slate-100 rounded md:hidden" />
          </div>
          <div className="flex items-center justify-between md:contents w-full md:w-auto pt-1 md:pt-0">
            <div className="h-4 w-28 bg-slate-150 rounded hidden md:block" />
            <div className="h-5 w-16 bg-slate-100 rounded hidden md:block" />
            <div className="flex items-center gap-2 md:block">
              <div className="h-3 w-12 bg-slate-100 rounded md:hidden" />
              <div className="h-5 w-10 bg-slate-100 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TeamManagementPage() {
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()

  const [members, setMembers] = useState<TeamMember[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null)
  
  // Form State
  const [formData, setFormData] = useState({
    email: "",
    organizationId: ""
  })

  useEffect(() => {
    if (authLoading || !user) return

    // Fetch User Organizations for the selector (real-time)
    const orgsRef = collection(db, "organizations")
    const qOrgs = query(orgsRef, where("ownerId", "==", user.uid))
    
    const unsubscribeOrgs = onSnapshot(qOrgs, (orgsSnap) => {
      setOrgs(orgsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name })) as Organization[])
    }, (error) => {
      console.error("Error listening to organizations:", error)
    })
    
    // Fetch Team Members (real-time)
    const membersRef = collection(db, "teamMembers")
    const qMembers = query(membersRef, where("ownerId", "==", user.uid))

    const unsubscribeMembers = onSnapshot(qMembers, (membersSnap) => {
      setMembers(membersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TeamMember[])
      setIsLoading(false)
    }, (error) => {
      const permissionError = new FirestorePermissionError({
        path: 'teamMembers',
        operation: 'list',
      })
      errorEmitter.emit('permission-error', permissionError)
      setIsLoading(false)
    })

    return () => {
      unsubscribeOrgs()
      unsubscribeMembers()
    }
  }, [user, authLoading, db])

  const handleInvite = async () => {
    if (!user) return
    if (!formData.email || !formData.organizationId) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "All invitation fields are mandatory.",
      })
      return
    }

    setIsSubmitting(true)
    const membersRef = collection(db, "teamMembers")
    const targetOrg = orgs.find(o => o.id === formData.organizationId)
    
    const targetOrgId = formData.organizationId;
    const targetEmail = formData.email.toLowerCase().trim();

    addDoc(membersRef, {
      email: targetEmail,
      organizationId: formData.organizationId,
      ownerId: user.uid,
      status: "Active",
      invitedAt: serverTimestamp()
    }).then(async () => {
      // Add email to organization memberEmails array
      try {
        const { updateDoc, doc, arrayUnion } = await import("firebase/firestore")
        const orgRef = doc(db, "organizations", targetOrgId)
        await updateDoc(orgRef, {
          memberEmails: arrayUnion(targetEmail)
        })
      } catch (e) {
        console.error("Error updating organization memberEmails on invite:", e)
      }

      toast({
        title: "Invitation Sent",
        description: `A secure access invite has been sent to ${targetEmail}.`,
      })
      setIsSubmitting(false)
      setIsDialogOpen(false)

      // Reactive Sync: If the invited user has already registered, sync their user document instantly
      try {
        const { getDocs, query, collection, where } = await import("firebase/firestore")
        const usersRef = collection(db, "users")
        const qUser = query(usersRef, where("email", "==", targetEmail))
        const userSnap = await getDocs(qUser)
        if (!userSnap.empty) {
          const invitedUserDoc = userSnap.docs[0].data()
          const invitedUserId = userSnap.docs[0].id
          await syncUserOrganizations(db, invitedUserId, invitedUserDoc.email, invitedUserDoc.displayName || "")
        }
      } catch (e) {
        console.error("Error reactive syncing invited user:", e)
      }

      setFormData({ email: "", organizationId: "" })
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: 'teamMembers',
        operation: 'create',
        requestResourceData: formData
      });
      errorEmitter.emit('permission-error', permissionError);
      setIsSubmitting(false)
    })
  }

  const toggleStatus = async (member: TeamMember) => {
    const memberRef = doc(db, "teamMembers", member.id)
    const newStatus = member.status === "Active" ? "Inactive" : "Active"
    
    try {
      // Update team member status
      await updateDoc(memberRef, { status: newStatus })

      // Update organization memberEmails array
      const { arrayUnion, arrayRemove } = await import("firebase/firestore")
      const orgRef = doc(db, "organizations", member.organizationId)
      await updateDoc(orgRef, {
        memberEmails: newStatus === "Active"
          ? arrayUnion(member.email.toLowerCase().trim())
          : arrayRemove(member.email.toLowerCase().trim())
      })
    } catch (error: any) {
      const permissionError = new FirestorePermissionError({
        path: memberRef.path,
        operation: 'update',
        requestResourceData: { status: newStatus }
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  }

  const handleDeleteMember = async (member: TeamMember) => {
    try {
      const memberRef = doc(db, "teamMembers", member.id)
      await deleteDoc(memberRef)

      // Remove email from organization memberEmails array
      const { arrayRemove } = await import("firebase/firestore")
      const orgRef = doc(db, "organizations", member.organizationId)
      await updateDoc(orgRef, {
        memberEmails: arrayRemove(member.email.toLowerCase().trim())
      })

      // Update local state
      setMembers(prev => prev.filter(m => m.id !== member.id))

      toast({
        title: "Access Revoked",
        description: `${member.email} has been removed from the team.`,
      })
    } catch (error: any) {
      const permissionError = new FirestorePermissionError({
        path: `teamMembers/${member.id}`,
        operation: 'delete'
      });
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setMemberToDelete(null)
    }
  }

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs font-medium text-slate-500">Securing member protocol...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-4 sm:gap-1">
          <div className="flex flex-col gap-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">Team Management</h1>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto font-bold gap-2 bg-primary hover:bg-primary/95 text-white px-6 rounded-lg h-10 shadow-md shadow-primary/10">
                    <UserPlus className="w-4 h-4" />
                    Invite Member
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md bg-white p-0 overflow-hidden border border-slate-200 rounded-lg">
                  <DialogHeader className="border-b border-slate-100 bg-white p-6">
                    <DialogTitle className="font-headline font-semibold text-lg text-slate-900">Invite Team Member</DialogTitle>
                    <p className="text-slate-400 text-xs mt-1">Authorize administrative access for your staff.</p>
                  </DialogHeader>
                  <div className="p-6 space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="member-email" className="text-xs font-medium text-slate-700 block">Staff Work Email</Label>
                      <Input 
                        id="member-email" 
                        type="email" 
                        placeholder="staff@organization.com" 
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="member-org" className="text-xs font-medium text-slate-700 block">Assign to Organization</Label>
                      <Select 
                        value={formData.organizationId} 
                        onValueChange={(v) => setFormData({ ...formData, organizationId: v })}
                      >
                        <SelectTrigger id="member-org" className="h-10 text-xs font-semibold border-slate-200 bg-white rounded">
                          <SelectValue placeholder="Select organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {orgs.map(org => (
                            <SelectItem key={org.id} value={org.id} className="text-xs">{org.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2">
                    <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto rounded text-xs font-bold h-9">Cancel</Button>
                    <Button onClick={handleInvite} disabled={isSubmitting} className="w-full sm:w-auto bg-primary hover:bg-primary/95 text-white font-bold h-9 px-6 rounded text-xs">
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Send Invitation"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-lg">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between py-4 px-4 sm:px-8">
            <CardTitle className="text-xs font-semibold text-slate-700">Active Access Directory</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] font-bold h-5 px-2 bg-white rounded">
                {members.length} Members
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 min-h-[300px]">
            {isLoading ? (
              <TeamTableSkeleton />
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <UsersIcon className="w-8 h-8 text-slate-100" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">No team members invited</h3>
                  <p className="text-xs text-slate-500 max-w-[200px]">Add staff members to help manage your organizations.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop View */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/30 border-b border-slate-200">
                        <TableHead className="text-xs font-medium py-3.5 pl-8 text-slate-500">Team Member</TableHead>
                        <TableHead className="text-xs font-medium py-3.5 text-slate-500">Associated Organization</TableHead>
                        <TableHead className="text-xs font-medium py-3.5 text-slate-500">Status</TableHead>
                        <TableHead className="text-xs font-medium py-3.5 text-right pr-8 text-slate-500">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.id} className="group hover:bg-[#F8FAFC] transition-colors border-b border-slate-100 last:border-0">
                          <TableCell className="pl-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center group-hover:bg-primary/5 transition-all font-headline font-bold text-xs text-slate-400 group-hover:text-primary">
                                {member.email.substring(0, 1).toUpperCase()}
                              </div>
                              <span className="font-bold text-slate-800 text-sm">{member.email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-slate-300" />
                              <span className="text-xs font-bold text-slate-600">
                                {orgs.find(o => o.id === member.organizationId)?.name || "Unknown Institution"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[9px] px-2 py-0.5 h-5 font-bold shadow-none rounded border transition-colors
                              ${member.status === "Active" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100"}`}>
                              {member.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <div className="flex items-center justify-end gap-4">
                              <Switch 
                                checked={member.status === "Active"} 
                                onCheckedChange={() => toggleStatus(member)}
                                className="scale-90" 
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setMemberToDelete(member)}
                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile View */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {members.map((member) => (
                    <div key={member.id} className="p-4 space-y-4 hover:bg-[#F8FAFC]/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-headline font-bold text-xs text-slate-500">
                            {member.email.substring(0, 1).toUpperCase()}
                          </div>
                          <span className="font-bold text-slate-800 text-sm">{member.email}</span>
                        </div>
                        <Badge className={`text-[9px] px-2 py-0.5 h-5 font-bold shadow-none rounded border transition-colors
                          ${member.status === "Active" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100"}`}>
                          {member.status}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-semibold">
                            {orgs.find(o => o.id === member.organizationId)?.name || "Unknown Institution"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500 font-medium">Access</span>
                            <Switch 
                              checked={member.status === "Active"} 
                              onCheckedChange={() => toggleStatus(member)}
                              className="scale-90" 
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setMemberToDelete(member)}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
          <AlertDialogContent className="bg-white border border-slate-200 rounded-lg p-6 max-w-md">
            <AlertDialogHeader className="space-y-2 text-left">
              <AlertDialogTitle className="font-headline font-semibold text-lg text-[#191c1e]">Remove Team Member</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-500 text-xs leading-normal">
                Are you sure you want to remove <strong>{memberToDelete?.email}</strong>? This will permanently revoke their access to the organization <strong>{orgs.find(o => o.id === memberToDelete?.organizationId)?.name || "Unknown Institution"}</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="bg-slate-50 -mx-6 -mb-6 p-4 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2 mt-6">
              <AlertDialogCancel className="w-full sm:w-auto rounded text-xs font-bold h-9">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => memberToDelete && handleDeleteMember(memberToDelete)}
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold h-9 px-6 rounded text-xs"
              >
                Remove Member
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardShell>
  )
}
