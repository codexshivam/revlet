"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { UserPlus, Building2, Loader2, Users, Trash2 } from "lucide-react"
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
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore"
import { errorEmitter } from "@/firebase/error-emitter"
import { FirestorePermissionError } from "@/firebase/errors"

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
        <div key={i} className="py-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-3.5 w-48 bg-slate-200 rounded" />
          </div>
          <div className="h-3.5 w-28 bg-slate-100 rounded hidden md:block" />
          <div className="h-4 w-12 bg-slate-100 rounded hidden md:block" />
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
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    email: "",
    organizationId: "",
  })

  useEffect(() => {
    if (authLoading || !user) return

    const orgsRef = collection(db, "organizations")
    const qOrgs = query(orgsRef, where("ownerId", "==", user.uid))

    const unsubscribeOrgs = onSnapshot(
      qOrgs,
      (orgsSnap) => {
        setOrgs(
          orgsSnap.docs.map((d) => ({ id: d.id, name: d.data().name })) as Organization[]
        )
      },
      (error) => {
        console.error("Error listening to organizations:", error)
      }
    )

    const membersRef = collection(db, "teamMembers")
    const qMembers = query(membersRef, where("ownerId", "==", user.uid))

    const unsubscribeMembers = onSnapshot(
      qMembers,
      (membersSnap) => {
        setMembers(
          membersSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as TeamMember[]
        )
        setIsLoading(false)
      },
      () => {
        const permissionError = new FirestorePermissionError({
          path: "teamMembers",
          operation: "list",
        })
        errorEmitter.emit("permission-error", permissionError)
        setIsLoading(false)
      }
    )

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
        title: "Missing information",
        description: "Please enter a staff email and select an organization.",
      })
      return
    }

    setIsSubmitting(true)
    const membersRef = collection(db, "teamMembers")
    const targetOrgId = formData.organizationId
    const targetEmail = formData.email.toLowerCase().trim()

    try {
      await addDoc(membersRef, {
        email: targetEmail,
        organizationId: targetOrgId,
        ownerId: user.uid,
        status: "Active",
        invitedAt: serverTimestamp(),
      })

      try {
        const { updateDoc: updateDocSdk, doc: docSdk, arrayUnion } = await import("firebase/firestore")
        const orgRef = docSdk(db, "organizations", targetOrgId)
        await updateDocSdk(orgRef, {
          memberEmails: arrayUnion(targetEmail),
        })
      } catch (e) {
        console.error("Error updating organization memberEmails on invite:", e)
      }

      toast({
        title: "Invitation sent",
        description: `Access invitation sent to ${targetEmail}.`,
      })
      setIsSubmitting(false)
      setIsDialogOpen(false)

      try {
        const { getDocs, query: qQuery, collection: colRef, where: wWhere } = await import("firebase/firestore")
        const usersRef = colRef(db, "users")
        const qUser = qQuery(usersRef, wWhere("email", "==", targetEmail))
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
    } catch {
      const permissionError = new FirestorePermissionError({
        path: "teamMembers",
        operation: "create",
        requestResourceData: formData,
      })
      errorEmitter.emit("permission-error", permissionError)
      setIsSubmitting(false)
    }
  }

  const toggleStatus = async (member: TeamMember) => {
    const memberRef = doc(db, "teamMembers", member.id)
    const newStatus = member.status === "Active" ? "Inactive" : "Active"

    try {
      await updateDoc(memberRef, { status: newStatus })

      const { arrayUnion, arrayRemove } = await import("firebase/firestore")
      const orgRef = doc(db, "organizations", member.organizationId)
      await updateDoc(orgRef, {
        memberEmails:
          newStatus === "Active"
            ? arrayUnion(member.email.toLowerCase().trim())
            : arrayRemove(member.email.toLowerCase().trim()),
      })
    } catch {
      const permissionError = new FirestorePermissionError({
        path: memberRef.path,
        operation: "update",
        requestResourceData: { status: newStatus },
      })
      errorEmitter.emit("permission-error", permissionError)
    }
  }

  const handleDeleteMember = async (member: TeamMember) => {
    try {
      const memberRef = doc(db, "teamMembers", member.id)
      await deleteDoc(memberRef)

      const { arrayRemove } = await import("firebase/firestore")
      const orgRef = doc(db, "organizations", member.organizationId)
      await updateDoc(orgRef, {
        memberEmails: arrayRemove(member.email.toLowerCase().trim()),
      })

      setMembers((prev) => prev.filter((m) => m.id !== member.id))

      toast({
        title: "Access revoked",
        description: `${member.email} has been removed from the team.`,
      })
    } catch {
      const permissionError = new FirestorePermissionError({
        path: `teamMembers/${member.id}`,
        operation: "delete",
      })
      errorEmitter.emit("permission-error", permissionError)
    } finally {
      setMemberToDelete(null)
    }
  }

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" strokeWidth={1.5} />
          <p className="text-xs text-slate-500">Loading team members</p>
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
              Team management
            </h1>
            <p className="text-xs text-slate-500">
              Authorize staff members to manage your registered organizations
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs transition-colors shrink-0 shadow-none">
                <UserPlus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                Invite member
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-white p-0 overflow-hidden border border-slate-200 rounded-xl">
              <DialogHeader className="border-b border-slate-100 p-6">
                <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                  Invite team member
                </DialogTitle>
                <p className="text-slate-500 text-xs mt-1">
                  Authorize administrative access for a staff member
                </p>
              </DialogHeader>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="member-email" className="text-xs font-medium text-slate-700">
                    Work email address
                  </Label>
                  <Input
                    id="member-email"
                    type="email"
                    placeholder="staff@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-9 text-xs border-slate-200 bg-white rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="member-org" className="text-xs font-medium text-slate-700">
                    Assign to organization
                  </Label>
                  <Select
                    value={formData.organizationId}
                    onValueChange={(v) => setFormData({ ...formData, organizationId: v })}
                  >
                    <SelectTrigger
                      id="member-org"
                      className="h-9 text-xs border-slate-200 bg-white rounded-lg"
                    >
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      {orgs.map((org) => (
                        <SelectItem key={org.id} value={org.id} className="text-xs">
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="rounded-lg text-xs font-medium h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={isSubmitting || !formData.email || !formData.organizationId}
                  className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    "Send invitation"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Directory table container */}
        <Card className="bg-white border border-slate-200/80 shadow-none overflow-hidden rounded-xl">
          <CardContent className="p-0">
            {isLoading ? (
              <TeamTableSkeleton />
            ) : members.length === 0 ? (
              <div className="py-20 text-center space-y-3 px-4 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center mx-auto text-slate-400">
                  <Users className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-headline font-semibold text-slate-900">
                    No team members invited
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Invite staff members to help manage your registered organizations.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop View */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200/80">
                        <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                          Team member
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-slate-500">
                          Assigned organization
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-slate-500">
                          Status
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow
                          key={member.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                        >
                          <TableCell className="pl-6 py-3.5">
                            <span className="text-xs font-mono text-slate-800">
                              {member.email}
                            </span>
                          </TableCell>

                          <TableCell className="py-3.5">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                              <span className="text-xs font-medium text-slate-700">
                                {orgs.find((o) => o.id === member.organizationId)?.name ||
                                  "Unknown institution"}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="py-3.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-600">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  member.status === "Active" ? "bg-emerald-600" : "bg-slate-300"
                                }`}
                              />
                              {member.status}
                            </span>
                          </TableCell>

                          <TableCell className="text-right pr-6 py-3.5">
                            <div className="flex items-center justify-end gap-3">
                              <Switch
                                checked={member.status === "Active"}
                                onCheckedChange={() => toggleStatus(member)}
                                className="scale-90"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setMemberToDelete(member)}
                                className="h-8 w-8 text-slate-400 hover:text-destructive hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
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
                    <div key={member.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-xs font-mono text-slate-800 truncate">
                          {member.email}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-600 shrink-0">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              member.status === "Active" ? "bg-emerald-600" : "bg-slate-300"
                            }`}
                          />
                          {member.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />
                          <span className="truncate">
                            {orgs.find((o) => o.id === member.organizationId)?.name ||
                              "Unknown institution"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Switch
                            checked={member.status === "Active"}
                            onCheckedChange={() => toggleStatus(member)}
                            className="scale-90"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setMemberToDelete(member)}
                            className="h-8 w-8 text-slate-400 hover:text-destructive hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
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

        {/* Revoke confirmation dialog */}
        <AlertDialog
          open={!!memberToDelete}
          onOpenChange={(open) => !open && setMemberToDelete(null)}
        >
          <AlertDialogContent className="bg-white border border-slate-200 rounded-xl p-6 max-w-md">
            <AlertDialogHeader className="space-y-2 text-left">
              <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
                Revoke team member access
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-500 text-xs leading-relaxed">
                Revoke administrative access for{" "}
                <span className="font-mono text-slate-800">{memberToDelete?.email}</span> on{" "}
                <span className="font-medium text-slate-800">
                  {orgs.find((o) => o.id === memberToDelete?.organizationId)?.name ||
                    "Unknown institution"}
                </span>
                ? They will immediately lose access to this organization.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 pt-4">
              <AlertDialogCancel className="h-9 px-4 text-xs font-medium rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => memberToDelete && handleDeleteMember(memberToDelete)}
                className="h-9 px-4 text-xs font-medium bg-destructive hover:bg-destructive/90 text-white rounded-lg"
              >
                Revoke access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardShell>
  )
}
