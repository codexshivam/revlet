"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { PageHeader } from "@/components/layout/page-header"
import { TableSkeleton } from "@/components/ui/table-skeleton"
import { useUser, useFirestore } from "@/firebase"
import { useActiveOrg } from "@/hooks/use-active-org"
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore"
import {
  listTeamManagementData,
  inviteTeamMember,
  resendTeamInvitation,
  updateTeamMemberStatus,
  updateTeamMemberAccess,
  deleteTeamMember,
} from "@/app/actions/team"
import {
  SERVICE_PERMISSION_OPTIONS,
  PERMISSION_GROUPS,
  ORG_ADMIN_PERMISSION,
  ADMIN_ALL_PERMISSIONS,
  RBAC_ROLE_PRESETS,
} from "@/lib/team-permissions"
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
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface TeamMember {
  id: string
  email: string
  organizationId?: string
  organizationIds?: string[]
  accessMode?: "admin" | "services"
  permissions?: string[]
  orgPermissions?: Record<string, string[]>
  status: "Active" | "Pending" | "Suspended"
  invitedBy?: string
}

type OrgAccessMap = Record<string, { mode: "admin" | "services"; permissions: string[] }>

interface Organization {
  id: string
  name: string
  domain?: string
  ownerId: string
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

function isMemberAdmin(member: TeamMember): boolean {
  return (
    member.accessMode === "admin" ||
    (Array.isArray(member.permissions) && member.permissions.includes(ORG_ADMIN_PERMISSION))
  )
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
  const { orgs: activeContextOrgs, loading: isContextOrgsLoading } = useActiveOrg()
  const { toast } = useToast()

  const [members, setMembers] = useState<TeamMember[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteOrgIds, setInviteOrgIds] = useState<string[]>([])
  const [inviteOrgAccess, setInviteOrgAccess] = useState<OrgAccessMap>({})

  // Edit modal state
  const [memberToEdit, setMemberToEdit] = useState<TeamMember | null>(null)
  const [editOrgIds, setEditOrgIds] = useState<string[]>([])
  const [editOrgAccess, setEditOrgAccess] = useState<OrgAccessMap>({})

  // Delete modal state
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null)

  const fetchTeamData = useCallback(async () => {
    if (!user) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const idToken = await user.getIdToken()
      const res = await listTeamManagementData(idToken)
      if (res.success && res.data) {
        setOrgs(res.data.orgs)
        setMembers(res.data.members)
        setIsLoading(false)
        return
      }
    } catch {
      // Fallback to client-side Firestore below
    }

    try {
      if (db) {
        const ownedQ = query(collection(db, "organizations"), where("ownerId", "==", user.uid))
        const ownedSnap = await getDocs(ownedQ)
        const orgMapLocal = new Map<string, Organization>()
        for (const d of ownedSnap.docs) {
          const data = d.data()
          if (data.status !== "Pending Deletion") {
            orgMapLocal.set(d.id, {
              id: d.id,
              name: data.name || d.id,
              domain: data.domain,
              ownerId: data.ownerId || user.uid,
            })
          }
        }
        for (const ao of activeContextOrgs) {
          if (!orgMapLocal.has(ao.id)) {
            orgMapLocal.set(ao.id, {
              id: ao.id,
              name: ao.name,
              domain: ao.domain,
              ownerId: ao.ownerId || user.uid,
            })
          }
        }
        const resolvedOrgs = Array.from(orgMapLocal.values())
        setOrgs(resolvedOrgs)

        const membersQ = query(collection(db, "teamMembers"), where("ownerId", "==", user.uid))
        const membersSnap = await getDocs(membersQ)
        const callerEmail = (user.email || "").toLowerCase().trim()
        const resolvedMembers: TeamMember[] = []
        for (const md of membersSnap.docs) {
          const mdata = md.data()
          if ((mdata.email || "").toLowerCase().trim() === callerEmail) continue
          resolvedMembers.push({
            id: md.id,
            email: mdata.email,
            organizationId: mdata.organizationId,
            organizationIds:
              mdata.organizationIds || (mdata.organizationId ? [mdata.organizationId] : []),
            accessMode: mdata.accessMode,
            permissions: mdata.permissions || [],
            orgPermissions: mdata.orgPermissions || {},
            status: mdata.status || "Pending",
            invitedBy: mdata.invitedBy,
          })
        }
        setMembers(resolvedMembers)
      }
    } catch (err) {
      console.error("Client fallback for team data failed:", err)
    } finally {
      setIsLoading(false)
    }
  }, [user, db, activeContextOrgs])

  useEffect(() => {
    fetchTeamData()
  }, [fetchTeamData])

  // Also sync any newly loaded activeContextOrgs so the user never sees an empty org state
  useEffect(() => {
    if (activeContextOrgs.length > 0 && orgs.length === 0) {
      setOrgs(
        activeContextOrgs.map((ao) => ({
          id: ao.id,
          name: ao.name,
          domain: ao.domain,
          ownerId: ao.ownerId || user?.uid || "",
        }))
      )
    }
  }, [activeContextOrgs, orgs.length, user?.uid])

  // Support ?inviteOrg={orgId}&preset=dns-viewer shortcut from the DNS page
  const handledInviteParamRef = useRef(false)
  useEffect(() => {
    if (handledInviteParamRef.current || orgs.length === 0 || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const inviteOrg = params.get("inviteOrg")
    if (!inviteOrg) return
    const matched = orgs.find((o) => o.id === inviteOrg)
    if (!matched) return
    handledInviteParamRef.current = true
    const preset = params.get("preset")
    setInviteEmail("")
    setInviteOrgIds([matched.id])
    setInviteOrgAccess({
      [matched.id]: {
        mode: "services",
        permissions: preset === "dns-viewer" ? ["DNS: Read"] : ["DNS: Read", "Email: Read"],
      },
    })
    setIsInviteOpen(true)
  }, [orgs])

  const orgMap = useMemo(() => {
    const map = new Map<string, Organization>()
    for (const o of orgs) map.set(o.id, o)
    return map
  }, [orgs])

  const toggleSelection = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  const buildOrgPermissionsPayload = (orgIds: string[], accessMap: OrgAccessMap): Record<string, string[]> => {
    const out: Record<string, string[]> = {}
    for (const oid of orgIds) {
      const cfg = accessMap[oid] || { mode: "services", permissions: ["DNS: Read", "Email: Read"] }
      out[oid] = cfg.mode === "admin" ? [...ADMIN_ALL_PERMISSIONS] : cfg.permissions
    }
    return out
  }

  const isAccessMapValid = (orgIds: string[], accessMap: OrgAccessMap): boolean => {
    if (orgIds.length === 0) return false
    return orgIds.every((oid) => {
      const cfg = accessMap[oid]
      if (!cfg) return false
      return cfg.mode === "admin" || cfg.permissions.length > 0
    })
  }

  const handleOpenInvite = () => {
    setInviteEmail("")
    const initialIds = orgs.length > 0 ? [orgs[0].id] : []
    setInviteOrgIds(initialIds)
    const initialMap: OrgAccessMap = {}
    for (const oid of initialIds) {
      initialMap[oid] = { mode: "services", permissions: ["DNS: Read", "Email: Read"] }
    }
    setInviteOrgAccess(initialMap)
    setIsInviteOpen(true)
  }

  const handleInvite = async () => {
    if (!user || !inviteEmail.trim() || !isAccessMapValid(inviteOrgIds, inviteOrgAccess)) return

    setIsSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const orgPermissions = buildOrgPermissionsPayload(inviteOrgIds, inviteOrgAccess)
      const flatPerms = Array.from(new Set(Object.values(orgPermissions).flat()))
      const hasAnyAdmin = flatPerms.includes(ORG_ADMIN_PERMISSION)

      const res = await inviteTeamMember(idToken, {
        email: inviteEmail.trim().toLowerCase(),
        organizationIds: inviteOrgIds,
        accessMode: hasAnyAdmin ? "admin" : "services",
        permissions: flatPerms,
        orgPermissions,
      })

      if (!res.success) {
        toast({
          variant: "destructive",
          title: "Invitation failed",
          description: res.error || "Could not send invitation.",
        })
        return
      }

      const inviteUrl = res.data?.inviteUrl
      const emailSent = res.data?.emailSent
      if (inviteUrl && typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(inviteUrl).catch(() => {})
      }
      toast({
        variant: emailSent === false ? "destructive" : "default",
        title: emailSent === false ? "Invitation created (email delivery failed)" : "Invitation sent",
        description:
          emailSent === false
            ? `Invitation created for ${inviteEmail.trim().toLowerCase()}, but email delivery failed. The invite link was copied to your clipboard — or use Resend.`
            : `${inviteEmail.trim().toLowerCase()} has been emailed an invite link (also copied to clipboard).`,
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
    const assignedIds = getMemberOrgIds(member)
    setEditOrgIds(assignedIds)
    const initialMap: OrgAccessMap = {}
    const fallbackAdmin = isMemberAdmin(member)
    const fallbackServicePerms = (member.permissions || []).filter((p) => p !== ORG_ADMIN_PERMISSION)
    for (const oid of assignedIds) {
      const rawPerms = member.orgPermissions?.[oid] || member.permissions || []
      const isOrgAdmin = member.orgPermissions?.[oid]
        ? rawPerms.includes(ORG_ADMIN_PERMISSION)
        : fallbackAdmin
      const servicePerms = rawPerms.filter((p) => p !== ORG_ADMIN_PERMISSION)
      initialMap[oid] = isOrgAdmin
        ? { mode: "admin", permissions: [...ADMIN_ALL_PERMISSIONS] }
        : {
            mode: "services",
            permissions:
              servicePerms.length > 0
                ? servicePerms
                : fallbackServicePerms.length > 0
                ? fallbackServicePerms
                : ["DNS: Read", "Email: Read"],
          }
    }
    setEditOrgAccess(initialMap)
  }

  const handleSaveEdit = async () => {
    if (!user || !memberToEdit || !isAccessMapValid(editOrgIds, editOrgAccess)) return

    setIsSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const orgPermissions = buildOrgPermissionsPayload(editOrgIds, editOrgAccess)
      const flatPerms = Array.from(new Set(Object.values(orgPermissions).flat()))
      const hasAnyAdmin = flatPerms.includes(ORG_ADMIN_PERMISSION)

      const res = await updateTeamMemberAccess(idToken, memberToEdit.id, {
        organizationIds: editOrgIds,
        accessMode: hasAnyAdmin ? "admin" : "services",
        permissions: flatPerms,
        orgPermissions,
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
        description: `Updated organizations and access level for ${memberToEdit.email}.`,
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

  const handleResendInvite = async (member: TeamMember) => {
    if (!user) return
    try {
      const idToken = await user.getIdToken()
      const res = await resendTeamInvitation(idToken, member.id)
      if (!res.success || !res.data) {
        throw new Error(res.error || "Could not resend invitation.")
      }
      if (res.data.inviteUrl && typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(res.data.inviteUrl).catch(() => {})
      }
      toast({
        variant: res.data.emailSent ? "default" : "destructive",
        title: res.data.emailSent ? "Invitation resent" : "Link rotated (email delivery failed)",
        description: res.data.emailSent
          ? `Sent a fresh invitation link to ${member.email} (and copied it to clipboard).`
          : `Email delivery failed, but the fresh invite link for ${member.email} was copied to your clipboard.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Resend failed",
        description: err?.message || "Could not resend invitation.",
      })
    }
  }

  const handleToggleStatus = async (member: TeamMember) => {
    if (!user) return
    if (member.status === "Pending") {
      await handleResendInvite(member)
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

  const renderAccessForm = (
    selectedOrgIds: string[],
    setSelectedOrgIds: (ids: string[]) => void,
    orgAccessMap: OrgAccessMap,
    setOrgAccessMap: React.Dispatch<React.SetStateAction<OrgAccessMap>>,
    idPrefix: string
  ) => {
    const toggleOrg = (orgId: string) => {
      const nextIds = toggleSelection(selectedOrgIds, orgId)
      setSelectedOrgIds(nextIds)
      if (!selectedOrgIds.includes(orgId) && !orgAccessMap[orgId]) {
        setOrgAccessMap((prev) => ({
          ...prev,
          [orgId]: { mode: "services", permissions: ["DNS: Read", "Email: Read"] },
        }))
      }
    }

    const selectAllOrgs = () => {
      if (selectedOrgIds.length === orgs.length) {
        setSelectedOrgIds([])
        return
      }
      const allIds = orgs.map((o) => o.id)
      setSelectedOrgIds(allIds)
      setOrgAccessMap((prev) => {
        const next = { ...prev }
        for (const oid of allIds) {
          if (!next[oid]) {
            next[oid] = { mode: "services", permissions: ["DNS: Read", "Email: Read"] }
          }
        }
        return next
      })
    }

    return (
      <div className="space-y-5">
        {/* Organizations */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-slate-700">
              Organizations ({selectedOrgIds.length} selected)
            </Label>
            {orgs.length > 1 && (
              <button
                type="button"
                onClick={selectAllOrgs}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {selectedOrgIds.length === orgs.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>
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
                    onCheckedChange={() => toggleOrg(org.id)}
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

        {/* Per-Organization Permission Level Settings */}
        {selectedOrgIds.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs font-medium text-slate-700">
              Permission Level per Organization
            </Label>
            <div className="space-y-3">
              {selectedOrgIds.map((oid) => {
                const org = orgMap.get(oid)
                const cfg = orgAccessMap[oid] || { mode: "services", permissions: [] }
                const setOrgMode = (mode: "admin" | "services") => {
                  setOrgAccessMap((prev) => ({
                    ...prev,
                    [oid]: {
                      mode,
                      permissions:
                        mode === "admin"
                          ? [...ADMIN_ALL_PERMISSIONS]
                          : prev[oid]?.permissions.filter((p) => p !== ORG_ADMIN_PERMISSION) || [
                              "DNS: Read",
                              "Email: Read",
                            ],
                    },
                  }))
                }
                const toggleOrgPerm = (permId: string) => {
                  setOrgAccessMap((prev) => {
                    const current = prev[oid]?.permissions || []
                    return {
                      ...prev,
                      [oid]: {
                        mode: "services",
                        permissions: toggleSelection(current, permId),
                      },
                    }
                  })
                }

                return (
                  <div
                    key={oid}
                    className="rounded-lg border border-slate-200 bg-slate-50/40 p-3.5 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {org?.name || "Organization"}
                        </span>
                        {org?.domain && (
                          <span className="text-[11px] font-mono text-slate-400 truncate">
                            {org.domain}
                          </span>
                        )}
                      </div>

                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shrink-0 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setOrgMode("admin")}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1",
                            cfg.mode === "admin"
                              ? "bg-primary text-white"
                              : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          Admin
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrgMode("services")}
                          className={cn(
                            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1",
                            cfg.mode === "services"
                              ? "bg-slate-900 text-white"
                              : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Assign Services
                        </button>
                      </div>
                    </div>

                    {cfg.mode === "admin" ? (
                      <p className="text-[11px] text-slate-500">
                        Full access to all services and team management for this organization (cannot delete organization).
                      </p>
                    ) : (
                      <div className="space-y-2.5 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5 pb-1">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                            Role Presets:
                          </span>
                          {RBAC_ROLE_PRESETS.filter((r) => r.id !== "ORG_ADMIN" && r.id !== "CUSTOM").map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() =>
                                setOrgAccessMap((prev) => ({
                                  ...prev,
                                  [oid]: {
                                    mode: "services",
                                    permissions: [...preset.permissions],
                                  },
                                }))
                              }
                              title={preset.description}
                              className="px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 transition-colors"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        {PERMISSION_GROUPS.map((group) => {
                          const groupOptions = SERVICE_PERMISSION_OPTIONS.filter(
                            (opt) => opt.group === group
                          )
                          return (
                            <div key={group} className="space-y-1.5">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                {group}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {groupOptions.map((opt) => {
                                  const checked = cfg.permissions.includes(opt.id)
                                  return (
                                    <label
                                      key={opt.id}
                                      htmlFor={`${idPrefix}-${oid}-perm-${opt.id}`}
                                      className={cn(
                                        "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer transition-colors",
                                        checked
                                          ? "border-primary/40 bg-white"
                                          : "border-slate-200 bg-white hover:border-slate-300"
                                      )}
                                    >
                                      <Checkbox
                                        id={`${idPrefix}-${oid}-perm-${opt.id}`}
                                        checked={checked}
                                        className="mt-0.5"
                                        onCheckedChange={() => toggleOrgPerm(opt.id)}
                                      />
                                      <div className="space-y-0.5">
                                        <span className="text-slate-800 font-medium block">
                                          {opt.label}
                                        </span>
                                        <span className="text-[10px] text-slate-400 leading-tight block">
                                          {opt.description}
                                        </span>
                                      </div>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <PageHeader
          title="Team Management"
          className="pb-6"
          actions={
            orgs.length > 0 ? (
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
                <DialogContent className="sm:max-w-2xl rounded-xl border border-slate-200 p-0 overflow-hidden bg-white flex flex-col max-h-[90dvh]">
                  <DialogHeader className="p-5 sm:p-6 pb-3 shrink-0 border-b border-slate-100">
                    <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                      Invite Team Member
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs">
                      Assign organizations and configure Admin or service-level permissions per organization.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="p-5 sm:p-6 space-y-5 flex-1 min-h-0 overflow-y-auto">
                    <div className="space-y-1.5">
                      <Label htmlFor="member-email" className="text-xs font-medium text-slate-700">
                        Email Address
                      </Label>
                      <Input
                        id="member-email"
                        type="email"
                        placeholder="member@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="h-9 text-xs border-slate-200 bg-white rounded-lg"
                      />
                    </div>
                    {renderAccessForm(
                      inviteOrgIds,
                      setInviteOrgIds,
                      inviteOrgAccess,
                      setInviteOrgAccess,
                      "invite"
                    )}
                    {inviteOrgIds.length > 0 && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs space-y-1">
                        <p className="font-semibold text-slate-800">Effective access summary</p>
                        <p className="text-slate-600 leading-relaxed">
                          <span className="font-mono text-slate-900">
                            {inviteEmail.trim() || "invitee@company.com"}
                          </span>{" "}
                          will be invited as{" "}
                          <span className="font-medium text-slate-900">Pending acceptance</span> to{" "}
                          {inviteOrgIds
                            .map((oid) => {
                              const o = orgMap.get(oid)
                              const cfg = inviteOrgAccess[oid]
                              const roleLabel =
                                cfg?.mode === "admin"
                                  ? "Organization Admin"
                                  : (cfg?.permissions || []).join(", ") || "No permissions"
                              return `${o?.name || o?.domain || oid} (${roleLabel})`
                            })
                            .join(" · ")}
                        </p>
                      </div>
                    )}
                  </div>
                  <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex flex-row justify-end gap-2 shrink-0">
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
                        !isAccessMapValid(inviteOrgIds, inviteOrgAccess)
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
            ) : undefined
          }
        />

        <Card className="bg-white border border-slate-200/80 shadow-none overflow-hidden rounded-xl">
          <CardContent className="p-0">
            {isLoading || isContextOrgsLoading ? (
              <TableSkeleton rows={4} cols={5} />
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
                      ? "Invite team members to collaborate across your organizations."
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
                          Access
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
                        const admin = isMemberAdmin(member)
                        const servicePerms = (member.permissions || []).filter(
                          (p) => p !== ORG_ADMIN_PERMISSION
                        )

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
                                      {orgMap.get(oid)?.name || "Organization"}
                                    </span>
                                  ))
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="py-3.5 align-top">
                              {admin ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                                  <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                                  Admin
                                </span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {servicePerms.length === 0 ? (
                                    <span className="text-[11px] text-slate-400">No permissions</span>
                                  ) : (
                                    servicePerms.map((p) => (
                                      <span
                                        key={p}
                                        className="text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200/80 px-1.5 py-0.5 rounded"
                                      >
                                        {p}
                                      </span>
                                    ))
                                  )}
                                </div>
                              )}
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
                                  title="Edit organizations and access"
                                  aria-label={`Edit access for ${member.email}`}
                                >
                                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setMemberToDelete(member)}
                                  className="h-8 w-8 text-slate-400 hover:text-destructive hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Revoke access"
                                  aria-label={`Revoke access for ${member.email}`}
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
                    const admin = isMemberAdmin(member)
                    const servicePerms = (member.permissions || []).filter(
                      (p) => p !== ORG_ADMIN_PERMISSION
                    )

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
                              {orgMap.get(oid)?.name || "Organization"}
                            </span>
                          ))}
                        </div>

                        {admin ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                            <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
                            Admin
                          </span>
                        ) : (
                          servicePerms.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {servicePerms.map((p) => (
                                <span
                                  key={p}
                                  className="text-[10px] font-mono text-slate-600 bg-slate-50 border border-slate-200/80 px-1.5 py-0.5 rounded"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          )
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
                            aria-label={`Edit access for ${member.email}`}
                            onClick={() => handleOpenEdit(member)}
                            className="h-8 w-8 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Revoke access for ${member.email}`}
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
          <DialogContent className="sm:max-w-2xl rounded-xl border border-slate-200 p-0 overflow-hidden bg-white flex flex-col max-h-[90dvh]">
            <DialogHeader className="p-5 sm:p-6 pb-3 shrink-0 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Edit Member Access
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                Update organization allocations and per-organization permissions for{" "}
                <span className="font-mono text-slate-800">{memberToEdit?.email}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="p-5 sm:p-6 flex-1 min-h-0 overflow-y-auto">
              {renderAccessForm(
                editOrgIds,
                setEditOrgIds,
                editOrgAccess,
                setEditOrgAccess,
                "edit"
              )}
            </div>
            <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex flex-row justify-end gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => setMemberToEdit(null)}
                className="rounded-lg text-xs font-medium h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={isSubmitting || !isAccessMapValid(editOrgIds, editOrgAccess)}
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
