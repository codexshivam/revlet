
"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { UserPlus, MoreHorizontal, Building2, Loader2, Users as UsersIcon, Search } from "lucide-react"
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
  doc,
  serverTimestamp 
} from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'

interface Organization {
  id: string
  name: string
}

interface TeamMember {
  id: string
  name: string
  email: string
  organizationId: string
  organizationName: string
  status: "Active" | "Inactive"
  ownerId: string
}

function TeamTableSkeleton() {
  return (
    <div className="w-full divide-y divide-slate-100 animate-pulse bg-white">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-5 pl-8 pr-8">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-slate-100 rounded-full" />
            <div className="flex flex-col gap-2">
              <div className="h-4 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-24 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="h-4 w-28 bg-slate-150 rounded hidden md:block" />
          <div className="h-5 w-16 bg-slate-100 rounded" />
          <div className="h-5 w-10 bg-slate-100 rounded-full" />
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
  
  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    organizationId: ""
  })

  useEffect(() => {
    if (authLoading || !user) return

    // Fetch User Organizations for the selector
    const orgsRef = collection(db, "organizations")
    const qOrgs = query(orgsRef, where("ownerId", "==", user.uid))
    
    const membersRef = collection(db, "teamMembers")
    const qMembers = query(membersRef, where("ownerId", "==", user.uid))

    const fetchData = async () => {
      try {
        const [orgsSnap, membersSnap] = await Promise.all([
          getDocs(qOrgs),
          getDocs(qMembers)
        ]);

        setOrgs(orgsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name })) as Organization[]);

        setMembers(membersSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as TeamMember[]);
        setIsLoading(false);
      } catch (error) {
        const permissionError = new FirestorePermissionError({
          path: 'teamMembers',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, db])

  const handleInvite = async () => {
    if (!user) return
    if (!formData.name || !formData.email || !formData.organizationId) {
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
    
    addDoc(membersRef, {
      name: formData.name,
      email: formData.email,
      organizationId: formData.organizationId,
      organizationName: targetOrg?.name || "Unknown Institution",
      ownerId: user.uid,
      status: "Active",
      invitedAt: serverTimestamp()
    }).then(async () => {
      toast({
        title: "Invitation Sent",
        description: `A secure access invite has been sent to ${formData.name}.`,
      })
      setIsSubmitting(false)
      setIsDialogOpen(false)

      // Reactive Sync: If the invited user has already registered, sync their user document instantly
      try {
        const { getDocs, query, collection, where } = await import("firebase/firestore")
        const usersRef = collection(db, "users")
        const qUser = query(usersRef, where("email", "==", formData.email))
        const userSnap = await getDocs(qUser)
        if (!userSnap.empty) {
          const invitedUserDoc = userSnap.docs[0].data()
          await syncUserOrganizations(db, invitedUserDoc.uid, invitedUserDoc.email, invitedUserDoc.displayName || "")
        }
      } catch (e) {
        console.error("Error reactive syncing invited user:", e)
      }

      setFormData({ name: "", email: "", organizationId: "" })
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
    
    updateDoc(memberRef, { status: newStatus }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: memberRef.path,
        operation: 'update',
        requestResourceData: { status: newStatus }
      });
      errorEmitter.emit('permission-error', permissionError);
    })
  }

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Securing Member Protocol...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Management</span>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">Team Management Panel</h1>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="font-bold gap-2 bg-primary hover:bg-primary/95 text-white px-6 rounded-lg h-10 shadow-md shadow-primary/10">
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
                    <Label htmlFor="member-name" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Staff Full Name</Label>
                    <Input 
                      id="member-name" 
                      placeholder="e.g. Rajesh Karki" 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-email" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Staff Work Email</Label>
                    <Input 
                      id="member-email" 
                      type="email" 
                      placeholder="staff@institution.edu.np" 
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="member-org" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Assign to Organization</Label>
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
                <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded text-xs font-bold h-9">Cancel</Button>
                  <Button onClick={handleInvite} disabled={isSubmitting} className="bg-primary hover:bg-primary/95 text-white font-bold h-9 px-6 rounded text-xs">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Send Invitation"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-lg">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between py-4 px-8">
            <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Access Directory</CardTitle>
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
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/30 border-b border-slate-200">
                    <TableHead className="text-[10px] font-bold uppercase py-4 pl-8 tracking-wider text-slate-400">Team Member</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4 tracking-wider text-slate-400">Associated Organization</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4 tracking-wider text-slate-400">Status</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8 tracking-wider text-slate-400">Access Toggle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id} className="group hover:bg-[#F8FAFC] transition-colors border-b border-slate-100 last:border-0">
                      <TableCell className="pl-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center group-hover:bg-primary/5 transition-all font-headline font-bold text-xs text-slate-400 group-hover:text-primary">
                            {member.name.substring(0, 1).toUpperCase()}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-800 text-sm leading-none">{member.name}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{member.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-300" />
                          <span className="text-xs font-bold text-slate-600">{member.organizationName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] px-2 py-0.5 h-5 font-bold shadow-none rounded border transition-colors
                          ${member.status === "Active" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100"}`}>
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex items-center justify-end gap-3">
                          <Switch 
                            checked={member.status === "Active"} 
                            onCheckedChange={() => toggleStatus(member)}
                            className="scale-90" 
                          />
                        </div>
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
