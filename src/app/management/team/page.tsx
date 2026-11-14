"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, getDocs } from "firebase/firestore"
import {
  inviteTeamMember,
  updateTeamMemberStatus,
  updateTeamMemberAccess,
  deleteTeamMember,
} from "@/app/actions/team"
import { SERVICE_PERMISSION_OPTIONS, PERMISSION_GROUPS } from "@/lib/team-permissions"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Users,
  UserPlus,
  Trash2,
  Loader2,
  Building2,
  Pencil,
  ShieldAlert,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface TeamMember {
  id: string
  email: string
  organizationId?: string
  organizationIds?: string[]
  permissions?: string[]
  status: "Active" | "Pending" | "Suspended"
  invitedBy: string
  createdAt: any
}

interface Organization {
  id: string
  name: string
  domain?: string
  ownerId: string
  status?: string
}

function TeamTableSkeleton() {
  return (
    <div className="divide-y divide-slate-100">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center justify-between px-6 py-4 animate-pulse">
          <div className="h-3.5 w-44 rounded bg-slate-100" />
          <div className="h-3.5 w-40 rounded bg-slate-100" />
          <div className="h-3.5 w-32 rounded bg-slate-100" />
          <div className="h-3.5 w-16 rounded bg-slate-100" />
          <div className="h-6 w-20 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

function getMemberOrgIds(member: TeamMember): string[] {
  if (Array.isArray(member.organizationIds) && member.organizationIds.length > 0) {
    return member.organizationIds
  }
  if (member.organizationId) {
    return [member.organizationId]
  }
  return []
}

function StatusBadge({ status }: { status: TeamMember["status"] }) {
  const dotColor =
    status === "Active"
      ? "bg-emerald-600"
      : status === "Pending"
      ? "bg-amber-500"
      : "bg-slate-400"

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-700">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  )
}

export default function TeamManagementPage() {
  const { user } = useUser()
  const db = useFirestore()
  const { toast } = useToast()

  const [members, setMembers] = useState<TeamMember[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteOrgIds, setInviteOrgIds] = useState<string[]>([])
  const [invitePermissions, setInvitePermissions] = useState<string[]>(["DNS: Read", "Email: Read"])

  // Edit modal state
  const [memberToEdit, setMemberToEdit] = useState<TeamMember | null>(null)
  const [editOrgIds, setEditOrgIds] = useState<string[]>([])
  const [editPermissions, setEditPermissions] = useState<string[]>([])

  // Delete modal state
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null)

  const fetchTeamData = useCallback(async () => {
    if (!user || !db) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const [orgsResult, membersResult] = await Promise.allSettled([
        getDocs(query(collection(db, "organizations"), where("ownerId", "==", user.uid))),
        getDocs(query(collection(db, "teamMembers"), where("ownerId", "==", user.uid))),
      ])

      if (orgsResult.status === "fulfilled") {
        const ownedOrgs = orgsResult.value.docs
          .map((d) => ({ id: d.id, ...d.data() } as Organization))
          .filter((o) => o.status !== "Pending Deletion")
        setOrgs(ownedOrgs)
      }

      if (membersResult.status === "fulfilled") {
        const fetchedMembers = membersResult.value.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as TeamMember[]
        setMembers(fetchedMembers)
      }
    } catch (error: any) {
      console.error("Failed to fetch team data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [user, db])

  useEffect(() => {
    fetchTeamData()
  }, [fetchTeamData])

  const orgMap = useMemo(() => {
    const map = new Map<string, Organization>()
    for (const o of orgs) map.set(o.id, o)
    return map
  }, [orgs])

  const toggleSelection = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  const handleOpenInvite = () => {
    setInviteEmail("")
    setInviteOrgIds(orgs.length > 0 ? [orgs[0].id] : [])
    setInvitePermissions(["DNS: Read", "Email: Read"])
    setIsInviteOpen(true)
  }

  const handleInvite = async () => {
    if (!user || !inviteEmail.trim() || inviteOrgIds.length === 0 || invitePermissions.length === 0) {
      return
    }

    setIsSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const res = await inviteTeamMember(idToken, {
        email: inviteEmail.trim().toLowerCase(),
        organizationIds: inviteOrgIds,
        permissions: invitePermissions,
      })

      if (!res.success) {
        toast({
          variant: "destructive",
          title: "Invitation failed",
          description: res.error || "Could not send invitation.",
        })
        return
      }

      toast({
        title: "Invitation sent",
        description: `${inviteEmail.trim().toLowerCase()} is now Pending activation across ${inviteOrgIds.length} organization(s).`,
      })

      setIsInviteOpen(false)
      await fetchTeamData()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Invitation failed",
        description: error.message || "Could not send invitation.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenEdit = (member: TeamMember) => {
    setMemberToEdit(member)
    setEditOrgIds(getMemberOrgIds(member))
    setEditPermissions(Array.isArray(member.permissions) ? member.permissions : [])
  }

  const handleSaveEdit = async () => {
    if (!user || !memberToEdit || editOrgIds.length === 0 || editPermissions.length === 0) {
      return
    }

    setIsSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const res = await updateTeamMemberAccess(idToken, memberToEdit.id, {
        organizationIds: editOrgIds,
        permissions: editPermissions,
      })

      if (!res.success) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: res.error || "Could not update member access.",
        })
        return
      }

      toast({
        title: "Access updated",
        description: `Updated organizations and permissions for ${memberToEdit.email}.`,
      })
      setMemberToEdit(null)
      await fetchTeamData()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message || "Could not update member access.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleStatus = async (member: TeamMember) => {
    if (!user) return
    if (member.status === "Pending") {
      toast({
        title: "Pending activation",
        description: `${member.email} must sign up or sign in first to activate their account.`,
      })
      return
    }

    const newStatus = member.status === "Active" ? "Suspended" : "Active"
    try {
      const idToken = await user.getIdToken()
      const res = await updateTeamMemberStatus(idToken, member.id, newStatus)
      if (!res.success) {
        toast({
          variant: "destructive",
          title: "Status update failed",
          description: res.error || "Could not update member status.",
        })
        return
      }

      toast({
        title: `Access ${newStatus === "Active" ? "restored" : "suspended"}`,
        description: `${member.email} is now ${newStatus.toLowerCase()}.`,
      })
      await fetchTeamData()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message || "Could not update member status.",
      })
    }
  }

  const handleDeleteMember = async (member: TeamMember) => {
    if (!user) return
    try {
      const idToken = await user.getIdToken()
      const res = await deleteTeamMember(idToken, member.id)
      if (!res.success) {
        toast({
          variant: "destructive",
          title: "Removal failed",
          description: res.error || "Could not revoke access.",
        })
        return
      }

      toast({
        title: "Access revoked",
        description: `${member.email} has been removed from all assigned organizations.`,
      })
      setMemberToDelete(null)
      await fetchTeamData()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Removal failed",
        description: error.message || "Could not revoke access.",
      })
    }
  }

  const renderAccessCheckboxes = (
    selectedOrgIds: string[],
    setSelectedOrgIds: (ids: string[]) => void,
    selectedPermissions: string[],
    setSelectedPermissions: (perms: string[]) => void,
    idPrefix: string
  ) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs font-medium text-slate-700">
          Assign organizations ({selectedOrgIds.length} selected)
        </Label>
        <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
          {orgs.map((org) => {
            const checked = selectedOrgIds.includes(org.id)
            return (
              <label
                key={org.id}
                htmlFor={`${idPrefix}-org-${org.id}`}
                className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
              >
                <Checkbox
                  id={`${idPrefix}-org-${org.id}`}
                  checked={checked}
                  onCheckedChange={() => setSelectedOrgIds(toggleSelection(selectedOrgIds, org.id))}
                />
                <span className="font-medium text-slate-800 truncate">{org.name}</span>
                {org.domain && (
                  <span className="font-mono text-[11px] text-slate-400 ml-auto shrink-0">
                    {org.domain}
                  </span>
                )}
              </label>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-slate-700">
          Service permissions ({selectedPermissions.length} selected)
        </Label>
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
          {PERMISSION_GROUPS.map((group) => {
            const groupOptions = SERVICE_PERMISSION_OPTIONS.filter((opt) => opt.group === group)
            return (
              <div key={group} className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {group}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {groupOptions.map((opt) => {
                    const checked = selectedPermissions.includes(opt.id)
                    return (
                      <label
                        key={opt.id}
                        htmlFor={`${idPrefix}-perm-${opt.id}`}
                        className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs hover:border-slate-300 cursor-pointer"
                        title={opt.description}
                      >
                        <Checkbox
                          id={`${idPrefix}-perm-${opt.id}`}
                          checked={checked}
                          onCheckedChange={() =>
                            setSelectedPermissions(toggleSelection(selectedPermissions, opt.id))
                          }
                        />
                        <span className="text-slate-700 font-medium">{opt.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
          <h1 className="text-2xl font-headline font-semibold tracking-tight text-slate-900">
            Team Management
          </h1>

          {orgs.length > 0 && (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={handleOpenInvite}
                  className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0"
                >
                  <UserPlus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                  Invite member
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg rounded-xl border border-slate-200 p-0 overflow-hidden bg-white">
                <DialogHeader className="p-6 pb-2">
                  <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                    Invite team member
                  </DialogTitle>
                  <DialogDescription className="text-slate-500 text-xs">
                    Assign one or more organizations and choose the services they can access.
                  </DialogDescription>
                </DialogHeader>
                <div className="p-6 pt-2 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="member-email" className="text-xs font-medium text-slate-700">
                      Email address
                    </Label>
                    <Input
                      id="member-email"
                      type="email"
                      placeholder="staff@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="h-9 text-xs border-slate-200 bg-white rounded-lg"
                    />
                  </div>
                  {renderAccessCheckboxes(
                    inviteOrgIds,
                    setInviteOrgIds,
                    invitePermissions,
                    setInvitePermissions,
                    "invite"
                  )}
                </div>
                <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsInviteOpen(false)}
                    className="rounded-lg text-xs font-medium h-9 px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleInvite}
                    disabled={
                      isSubmitting ||
                      !inviteEmail.trim() ||
                      inviteOrgIds.length === 0 ||
                      invitePermissions.length === 0
                    }
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
          )}
        </div>

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
                    {orgs.length > 0
                      ? "Invite staff members to help manage your owned organizations."
                      : "Register your own organization in Account Home to invite team members."}
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
                            Organizations
                          </TableHead>
                          <TableHead className="text-xs font-medium py-3 text-slate-500">
                            Permissions
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
                        {members.map((member) => {
                          const assignedIds = getMemberOrgIds(member)
                          const perms = member.permissions || []

                          return (
                            <TableRow
                              key={member.id}
                              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                            >
                              <TableCell className="pl-6 py-3.5 align-top">
                                <span className="text-xs font-mono text-slate-800">
                                  {member.email}
                                </span>
                              </TableCell>

                              <TableCell className="py-3.5 align-top">
                                <div className="flex flex-wrap gap-1.5">
                                  {assignedIds.length === 0 ? (
                                    <span className="text-xs text-slate-400">None assigned</span>
                                  ) : (
                                    assignedIds.map((oid) => (
                                      <span
                                        key={oid}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md"
                                      >
                                        <Building2 className="w-3 h-3 text-slate-400" strokeWidth={1.5} />
                                        {orgMap.get(oid)?.name || "Unknown institution"}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </TableCell>

                              <TableCell className="py-3.5 align-top">
                                <div className="flex flex-wrap gap-1">
                                  {perms.length === 0 ? (
                                    <span className="text-[11px] text-slate-400">No permissions</span>
                                  ) : (
                                    perms.map((p) => (
                                      <span
                                        key={p}
                                        className="text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200/80 px-1.5 py-0.5 rounded"
                                      >
                                        {p}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </TableCell>

                              <TableCell className="py-3.5 align-top">
                                <StatusBadge status={member.status} />
                              </TableCell>

                              <TableCell className="text-right pr-6 py-3.5 align-top">
                                <div className="flex items-center justify-end gap-2">
                                  <Switch
                                    checked={member.status === "Active"}
                                    disabled={member.status === "Pending"}
                                    onCheckedChange={() => handleToggleStatus(member)}
                                    title={
                                      member.status === "Pending"
                                        ? "Pending activation until member signs in"
                                        : member.status === "Active"
                                        ? "Suspend access"
                                        : "Restore access"
                                    }
                                    className="scale-90"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenEdit(member)}
                                    className="h-8 w-8 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="Edit organizations and permissions"
                                  >
                                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setMemberToDelete(member)}
                                    className="h-8 w-8 text-slate-400 hover:text-destructive hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Revoke access"
                                  >
                                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile View */}
                  <div className="block md:hidden divide-y divide-slate-100">
                    {members.map((member) => {
                      const assignedIds = getMemberOrgIds(member)
                      const perms = member.permissions || []

                      return (
                        <div key={member.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-xs font-mono text-slate-800 truncate">
                              {member.email}
                            </span>
                            <StatusBadge status={member.status} />
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {assignedIds.map((oid) => (
                              <span
                                key={oid}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md"
                              >
                                <Building2 className="w-3 h-3 text-slate-400" strokeWidth={1.5} />
                                {orgMap.get(oid)?.name || "Unknown institution"}
                              </span>
                            ))}
                          </div>

                          {perms.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {perms.map((p) => (
                                <span
                                  key={p}
                                  className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-200/80 px-1.5 py-0.5 rounded"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <Switch
                              checked={member.status === "Active"}
                              disabled={member.status === "Pending"}
                              onCheckedChange={() => handleToggleStatus(member)}
                              className="scale-90"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(member)}
                              className="h-8 w-8 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                            >
                              <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </Button>
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
                      )
                    })}
                  </div>
                </>
              )}
          </CardContent>
        </Card>

        {/* Edit access dialog */}
        <Dialog open={!!memberToEdit} onOpenChange={(open) => !open && setMemberToEdit(null)}>
          <DialogContent className="sm:max-w-lg rounded-xl border border-slate-200 p-0 overflow-hidden bg-white">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Edit member access
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                Update organization allocations and service permissions for{" "}
                <span className="font-mono text-slate-800">{memberToEdit?.email}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="p-6 pt-2">
              {renderAccessCheckboxes(
                editOrgIds,
                setEditOrgIds,
                editPermissions,
                setEditPermissions,
                "edit"
              )}
            </div>
            <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setMemberToEdit(null)}
                className="rounded-lg text-xs font-medium h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={isSubmitting || editOrgIds.length === 0 || editPermissions.length === 0}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  "Save changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                <span className="font-mono text-slate-800">{memberToDelete?.email}</span> across all
                assigned organizations? They will immediately lose access.
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
