"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  MoreVertical,
  Search,
  KeyRound,
  UserPen,
  AtSign,
  Ban,
  Trash2,
  RotateCcw,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  X,
  Edit2,
  Users,
} from "lucide-react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "@/hooks/use-toast"
import { useUser } from "@/firebase"
import { useActiveOrg } from "@/hooks/use-active-org"
import { cn } from "@/lib/utils"
import {
  getMailServiceState,
  activateMailService,
  deactivateMailService,
  syncMailDnsRecords,
  updateMailCatchAll,
  listMailOrgUnits,
  createMailOrgUnit,
  deleteMailOrgUnit,
  listMailUsers,
  createMailUser,
  updateMailUserAccount,
  resetMailUserPassword,
  manageMailUserAlias,
  toggleMailUserSuspend,
  deleteMailUserAccount,
  recoverMailUserAccount,
  listMailGroups,
  createMailGroup,
  updateMailGroup,
  deleteMailGroup,
  type MailRequiredDnsRecord,
  type MailOrgUnit,
  type MailUserRecord,
  type MailGroupRecord,
} from "@/app/actions/revlet-mail"

function getDaysRemaining(recoverableUntil: string | null): number {
  if (!recoverableUntil) return 14
  const diff = new Date(recoverableUntil).getTime() - Date.now()
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export default function EmailServiceAdminPage() {
  const { user, loading: authLoading } = useUser()
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()

  // Core service state
  const [isLoadingState, setIsLoadingState] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [isSyncingDns, setIsSyncingDns] = useState(false)

  const [serviceActive, setServiceActive] = useState(false)
  const [dnsServiceActive, setDnsServiceActive] = useState(false)
  const [monthlyOutboundLimit, setMonthlyOutboundLimit] = useState(1000)
  const [dailyOutboundLimit, setDailyOutboundLimit] = useState(100)
  const [monthlySentCount, setMonthlySentCount] = useState(0)
  const [dailySentCount, setDailySentCount] = useState(0)
  const [catchAllUserId, setCatchAllUserId] = useState<string | null>(null)
  const [catchAllEmail, setCatchAllEmail] = useState<string | null>(null)
  const [requiredDnsRecords, setRequiredDnsRecords] = useState<MailRequiredDnsRecord[]>([])

  // Directory collections
  const [orgUnits, setOrgUnits] = useState<MailOrgUnit[]>([])
  const [users, setUsers] = useState<MailUserRecord[]>([])
  const [groups, setGroups] = useState<MailGroupRecord[]>([])

  // Active tab & filters
  const [activeTab, setActiveTab] = useState("users")
  const [selectedUserOu, setSelectedUserOu] = useState<string>("ALL")
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [selectedGroupOu, setSelectedGroupOu] = useState<string>("ALL")
  const [groupSearchQuery, setGroupSearchQuery] = useState("")
  const [suspendedSearchQuery, setSuspendedSearchQuery] = useState("")

  // Copy helper state
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Dialog states
  const [isOuModalOpen, setIsOuModalOpen] = useState(false)
  const [newOuName, setNewOuName] = useState("")
  const [newOuDescription, setNewOuDescription] = useState("")
  const [isSavingOu, setIsSavingOu] = useState(false)

  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({
    firstName: "",
    lastName: "",
    emailPrefix: "",
    password: "",
    orgUnitPath: "/",
  })
  const [isCreatingUser, setIsCreatingUser] = useState(false)

  const [editingUser, setEditingUser] = useState<MailUserRecord | null>(null)
  const [editUserForm, setEditUserForm] = useState({
    firstName: "",
    lastName: "",
    orgUnitPath: "/",
  })
  const [isUpdatingUser, setIsUpdatingUser] = useState(false)

  const [passwordTargetUser, setPasswordTargetUser] = useState<MailUserRecord | null>(null)
  const [newPasswordValue, setNewPasswordValue] = useState("")
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  const [aliasTargetUser, setAliasTargetUser] = useState<MailUserRecord | null>(null)
  const [newAliasPrefix, setNewAliasPrefix] = useState("")
  const [editingAliasOriginal, setEditingAliasOriginal] = useState<string | null>(null)
  const [editingAliasPrefix, setEditingAliasPrefix] = useState("")
  const [isMutatingAlias, setIsMutatingAlias] = useState(false)

  const [deletingUser, setDeletingUser] = useState<MailUserRecord | null>(null)
  const [isDeletingUser, setIsDeletingUser] = useState(false)

  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false)
  const [createGroupForm, setCreateGroupForm] = useState({
    name: "",
    emailPrefix: "",
    orgUnitPath: "/",
    memberEmails: [] as string[],
  })
  const [newGroupMemberInput, setNewGroupMemberInput] = useState("")
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)

  const [editingGroup, setEditingGroup] = useState<MailGroupRecord | null>(null)
  const [editGroupForm, setEditGroupForm] = useState({
    name: "",
    orgUnitPath: "/",
  })
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false)

  const [membersTargetGroup, setMembersTargetGroup] = useState<MailGroupRecord | null>(null)
  const [groupMemberInput, setGroupMemberInput] = useState("")
  const [isUpdatingGroupMembers, setIsUpdatingGroupMembers] = useState(false)

  const [deletingGroup, setDeletingGroup] = useState<MailGroupRecord | null>(null)
  const [isDeletingGroup, setIsDeletingGroup] = useState(false)

  const [isUpdatingCatchAll, setIsUpdatingCatchAll] = useState(false)
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false)

  useEffect(() => {
    const anyOpen =
      isOuModalOpen ||
      isCreateUserOpen ||
      Boolean(editingUser) ||
      Boolean(passwordTargetUser) ||
      Boolean(aliasTargetUser) ||
      Boolean(deletingUser) ||
      isCreateGroupOpen ||
      Boolean(editingGroup) ||
      Boolean(membersTargetGroup) ||
      Boolean(deletingGroup) ||
      isDeactivateConfirmOpen
    if (!anyOpen && typeof document !== "undefined") {
      document.body.style.pointerEvents = ""
    }
  }, [
    isOuModalOpen,
    isCreateUserOpen,
    editingUser,
    passwordTargetUser,
    aliasTargetUser,
    deletingUser,
    isCreateGroupOpen,
    editingGroup,
    membersTargetGroup,
    deletingGroup,
    isDeactivateConfirmOpen,
  ])

  const loadAllMailData = useCallback(
    async (silent = false) => {
      if (!user || !selectedOrgId) {
        setIsLoadingState(false)
        return
      }
      if (!silent) setIsLoadingState(true)
      else setIsRefreshing(true)

      try {
        const idToken = await user.getIdToken()
        const [stateRes, ousRes, usersRes, groupsRes] = await Promise.all([
          getMailServiceState(idToken, selectedOrgId),
          listMailOrgUnits(idToken, selectedOrgId),
          listMailUsers(idToken, selectedOrgId),
          listMailGroups(idToken, selectedOrgId),
        ])

        if (stateRes.success && stateRes.data) {
          setServiceActive(stateRes.data.mailServiceActive)
          setDnsServiceActive(stateRes.data.dnsServiceActive)
          setMonthlyOutboundLimit(stateRes.data.monthlyOutboundLimit)
          setDailyOutboundLimit(stateRes.data.dailyOutboundLimit)
          setMonthlySentCount(stateRes.data.monthlySentCount)
          setDailySentCount(stateRes.data.dailySentCount)
          setCatchAllUserId(stateRes.data.catchAllUserId)
          setCatchAllEmail(stateRes.data.catchAllEmail)
          setRequiredDnsRecords(stateRes.data.requiredDnsRecords)
        }

        if (ousRes.success && ousRes.data) {
          setOrgUnits(ousRes.data)
        }
        if (usersRes.success && usersRes.data) {
          setUsers(usersRes.data)
        }
        if (groupsRes.success && groupsRes.data) {
          setGroups(groupsRes.data)
        }
      } catch (err: any) {
        toast({
          variant: "destructive",
          title: "Failed to load email service",
          description: err.message || "Could not retrieve organization mail configuration.",
        })
      } finally {
        setIsLoadingState(false)
        setIsRefreshing(false)
      }
    },
    [user, selectedOrgId]
  )

  useEffect(() => {
    if (!authLoading && !isLoadingOrgs) {
      loadAllMailData()
    }
  }, [authLoading, isLoadingOrgs, loadAllMailData])

  const copyToClipboard = (value: string, key: string) => {
    navigator.clipboard.writeText(value)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1800)
  }

  // Service activation / deactivation / DNS sync
  const handleActivateService = async () => {
    if (!user || !selectedOrgId) return
    setIsActivating(true)
    try {
      const idToken = await user.getIdToken()
      const res = await activateMailService(idToken, selectedOrgId)
      if (!res.success) {
        throw new Error(res.error)
      }

      if (res.data?.dnsProvisionedAutomatically) {
        toast({
          title: "Email service activated",
          description: `Required DNS records were automatically added to ${selectedOrg?.domain}.`,
        })
      } else if (res.data?.dnsWarning) {
        toast({
          title: "Email service activated",
          description: `Review required DNS records in Settings (${res.data.dnsWarning}).`,
        })
      } else {
        toast({
          title: "Email service activated",
          description: `Email service is now active for ${selectedOrg?.domain}.`,
        })
      }

      await loadAllMailData(true)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Activation failed",
        description: err.message || "Could not activate email service.",
      })
    } finally {
      setIsActivating(false)
    }
  }

  const handleDeactivateService = async () => {
    if (!user || !selectedOrgId) return
    setIsDeactivating(true)
    try {
      const idToken = await user.getIdToken()
      const res = await deactivateMailService(idToken, selectedOrgId)
      if (!res.success) throw new Error(res.error)

      setServiceActive(false)
      setIsDeactivateConfirmOpen(false)
      toast({
        title: "Email service deactivated",
        description: "Email service has been paused for this organization.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Deactivation failed",
        description: err.message || "Could not deactivate email service.",
      })
    } finally {
      setIsDeactivating(false)
    }
  }

  const handleSyncDnsRecords = async () => {
    if (!user || !selectedOrgId) return
    setIsSyncingDns(true)
    try {
      const idToken = await user.getIdToken()
      const res = await syncMailDnsRecords(idToken, selectedOrgId)
      if (!res.success) throw new Error(res.error)

      toast({
        title: "DNS records synchronized",
        description:
          res.data?.addedCount && res.data.addedCount > 0
            ? `Added ${res.data.addedCount} missing DNS record(s) to ${selectedOrg?.domain}.`
            : `All required DNS records are present on ${selectedOrg?.domain}.`,
      })
      await loadAllMailData(true)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "DNS sync failed",
        description: err.message || "Could not synchronize DNS records.",
      })
    } finally {
      setIsSyncingDns(false)
    }
  }

  // Catch-all handlers
  const handleCatchAllToggle = async (enabled: boolean) => {
    if (!user || !selectedOrgId) return
    const activeUsersList = users.filter((u) => u.status === "active")
    if (enabled && activeUsersList.length === 0) {
      toast({
        variant: "destructive",
        title: "No active email accounts",
        description: "Create at least one active user account before enabling catch-all routing.",
      })
      return
    }

    const targetId = enabled ? activeUsersList[0].id : null
    await handleCatchAllTargetChange(targetId)
  }

  const handleCatchAllTargetChange = async (nextUserId: string | null) => {
    if (!user || !selectedOrgId) return
    setIsUpdatingCatchAll(true)
    try {
      const idToken = await user.getIdToken()
      const res = await updateMailCatchAll(idToken, selectedOrgId, nextUserId)
      if (!res.success) throw new Error(res.error)

      setCatchAllUserId(res.data?.catchAllUserId ?? null)
      setCatchAllEmail(res.data?.catchAllEmail ?? null)
      toast({
        title: nextUserId ? "Catch-all routing updated" : "Catch-all routing disabled",
        description: nextUserId
          ? `Unmatched mail to @${selectedOrg?.domain} routes to ${res.data?.catchAllEmail}.`
          : `Unmatched mail to @${selectedOrg?.domain} will be rejected.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message || "Could not update catch-all routing.",
      })
    } finally {
      setIsUpdatingCatchAll(false)
    }
  }

  // Organizational unit handlers
  const handleCreateOu = async () => {
    if (!user || !selectedOrgId || !newOuName.trim()) return
    setIsSavingOu(true)
    try {
      const idToken = await user.getIdToken()
      const res = await createMailOrgUnit(idToken, selectedOrgId, {
        name: newOuName,
        description: newOuDescription,
      })
      if (!res.success || !res.data) throw new Error(res.error)

      setOrgUnits((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)))
      setNewOuName("")
      setNewOuDescription("")
      toast({
        title: "Organizational unit created",
        description: `${res.data.path} is now available.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not create organizational unit",
        description: err.message || "Failed to create organizational unit.",
      })
    } finally {
      setIsSavingOu(false)
    }
  }

  const handleDeleteOu = async (ou: MailOrgUnit) => {
    if (!user || !selectedOrgId) return
    setIsSavingOu(true)
    try {
      const idToken = await user.getIdToken()
      const res = await deleteMailOrgUnit(idToken, selectedOrgId, ou.id)
      if (!res.success) throw new Error(res.error)

      setOrgUnits((prev) => prev.filter((item) => item.id !== ou.id))
      setUsers((prev) =>
        prev.map((u) => (u.orgUnitPath === ou.path ? { ...u, orgUnitPath: "/" } : u))
      )
      setGroups((prev) =>
        prev.map((g) => (g.orgUnitPath === ou.path ? { ...g, orgUnitPath: "/" } : g))
      )
      if (selectedUserOu === ou.path) setSelectedUserOu("ALL")
      if (selectedGroupOu === ou.path) setSelectedGroupOu("ALL")

      toast({
        title: "Organizational unit removed",
        description: `${ou.path} was removed and members were reassigned to /.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to remove organizational unit",
        description: err.message || "Could not delete organizational unit.",
      })
    } finally {
      setIsSavingOu(false)
    }
  }

  // User directory handlers
  const handleCreateUser = async () => {
    if (!user || !selectedOrgId) return
    setIsCreatingUser(true)
    try {
      const idToken = await user.getIdToken()
      const res = await createMailUser(idToken, selectedOrgId, createUserForm)
      if (!res.success || !res.data) throw new Error(res.error)

      setUsers((prev) =>
        [...prev, res.data!].sort((a, b) => a.displayName.localeCompare(b.displayName))
      )
      setIsCreateUserOpen(false)
      setCreateUserForm({
        firstName: "",
        lastName: "",
        emailPrefix: "",
        password: "",
        orgUnitPath: "/",
      })
      toast({
        title: "Email account created",
        description: `${res.data.primaryEmail} is ready for sign-in on Revlet Mail.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not create email account",
        description: err.message || "Failed to create user account.",
      })
    } finally {
      setIsCreatingUser(false)
    }
  }

  const handleUpdateUserAccount = async () => {
    if (!user || !selectedOrgId || !editingUser) return
    setIsUpdatingUser(true)
    try {
      const idToken = await user.getIdToken()
      const res = await updateMailUserAccount(
        idToken,
        selectedOrgId,
        editingUser.id,
        editUserForm
      )
      if (!res.success || !res.data) throw new Error(res.error)

      setUsers((prev) =>
        prev
          .map((u) =>
            u.id === editingUser.id
              ? {
                  ...u,
                  firstName: res.data!.firstName,
                  lastName: res.data!.lastName,
                  displayName: res.data!.displayName,
                  orgUnitPath: res.data!.orgUnitPath,
                  updatedAt: res.data!.updatedAt,
                }
              : u
          )
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
      )
      setEditingUser(null)
      toast({
        title: "Account updated",
        description: "Account name and organizational unit saved.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message || "Could not update user account.",
      })
    } finally {
      setIsUpdatingUser(false)
    }
  }

  const handleResetUserPassword = async () => {
    if (!user || !selectedOrgId || !passwordTargetUser) return
    setIsResettingPassword(true)
    try {
      const idToken = await user.getIdToken()
      const res = await resetMailUserPassword(
        idToken,
        selectedOrgId,
        passwordTargetUser.id,
        newPasswordValue
      )
      if (!res.success) throw new Error(res.error)

      toast({
        title: "Password reset",
        description: `Sign-in password updated for ${passwordTargetUser.primaryEmail}.`,
      })
      setPasswordTargetUser(null)
      setNewPasswordValue("")
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Password reset failed",
        description: err.message || "Could not reset password.",
      })
    } finally {
      setIsResettingPassword(false)
    }
  }

  const handleAliasAction = async (
    action: "add" | "update" | "remove",
    payload: { aliasPrefix?: string; targetAlias?: string; updatedAliasPrefix?: string }
  ) => {
    if (!user || !selectedOrgId || !aliasTargetUser) return
    setIsMutatingAlias(true)
    try {
      const idToken = await user.getIdToken()
      const res = await manageMailUserAlias(
        idToken,
        selectedOrgId,
        aliasTargetUser.id,
        action,
        payload
      )
      if (!res.success || !res.data) throw new Error(res.error)

      const updatedAliases = res.data.aliases
      setUsers((prev) =>
        prev.map((u) =>
          u.id === aliasTargetUser.id
            ? { ...u, aliases: updatedAliases, updatedAt: res.data!.updatedAt }
            : u
        )
      )
      setAliasTargetUser((prev) => (prev ? { ...prev, aliases: updatedAliases } : null))
      setNewAliasPrefix("")
      setEditingAliasOriginal(null)
      setEditingAliasPrefix("")

      toast({
        title:
          action === "add"
            ? "Email alias added"
            : action === "update"
            ? "Email alias updated"
            : "Email alias removed",
        description: `Updated aliases for ${aliasTargetUser.primaryEmail}.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Alias update failed",
        description: err.message || "Could not update email alias.",
      })
    } finally {
      setIsMutatingAlias(false)
    }
  }

  const handleSuspendOrReactivateUser = async (targetUser: MailUserRecord, suspend: boolean) => {
    if (!user || !selectedOrgId) return
    try {
      const idToken = await user.getIdToken()
      const res = await toggleMailUserSuspend(idToken, selectedOrgId, targetUser.id, suspend)
      if (!res.success || !res.data) throw new Error(res.error)

      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? { ...u, status: res.data!.status as MailUserRecord["status"], updatedAt: res.data!.updatedAt }
            : u
        )
      )
      if (suspend && catchAllUserId === targetUser.id) {
        setCatchAllUserId(null)
        setCatchAllEmail(null)
      }

      toast({
        title: suspend ? "Account suspended" : "Account reactivated",
        description: suspend
          ? `${targetUser.primaryEmail} moved to Suspended accounts.`
          : `${targetUser.primaryEmail} is active again.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Status update failed",
        description: err.message || "Could not update account status.",
      })
    }
  }

  const handleConfirmDeleteUser = async () => {
    if (!user || !selectedOrgId || !deletingUser) return
    setIsDeletingUser(true)
    try {
      const idToken = await user.getIdToken()
      const res = await deleteMailUserAccount(idToken, selectedOrgId, deletingUser.id)
      if (!res.success || !res.data) throw new Error(res.error)

      setUsers((prev) =>
        prev.map((u) =>
          u.id === deletingUser.id
            ? {
                ...u,
                status: "deleted",
                deletedAt: res.data!.deletedAt,
                recoverableUntil: res.data!.recoverableUntil,
              }
            : u
        )
      )
      if (catchAllUserId === deletingUser.id) {
        setCatchAllUserId(null)
        setCatchAllEmail(null)
      }

      toast({
        title: "Account scheduled for deletion",
        description: `${deletingUser.primaryEmail} can be recovered within 14 days from Suspended accounts.`,
      })
      setDeletingUser(null)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Deletion failed",
        description: err.message || "Could not delete email account.",
      })
    } finally {
      setIsDeletingUser(false)
    }
  }

  const handleRecoverDeletedUser = async (targetUser: MailUserRecord) => {
    if (!user || !selectedOrgId) return
    try {
      const idToken = await user.getIdToken()
      const res = await recoverMailUserAccount(idToken, selectedOrgId, targetUser.id)
      if (!res.success || !res.data) throw new Error(res.error)

      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? {
                ...u,
                status: "active",
                deletedAt: null,
                recoverableUntil: null,
                updatedAt: res.data!.updatedAt,
              }
            : u
        )
      )

      toast({
        title: "Email account recovered",
        description: `${targetUser.primaryEmail} has been restored to active status.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Recovery failed",
        description: err.message || "Could not recover email account.",
      })
    }
  }

  // Group handlers
  const handleCreateGroup = async () => {
    if (!user || !selectedOrgId) return
    setIsCreatingGroup(true)
    try {
      const idToken = await user.getIdToken()
      const res = await createMailGroup(idToken, selectedOrgId, createGroupForm)
      if (!res.success || !res.data) throw new Error(res.error)

      setGroups((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)))
      setIsCreateGroupOpen(false)
      setCreateGroupForm({
        name: "",
        emailPrefix: "",
        orgUnitPath: "/",
        memberEmails: [],
      })
      setNewGroupMemberInput("")
      toast({
        title: "Group created",
        description: `${res.data.groupEmail} is now active.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not create group",
        description: err.message || "Failed to create group.",
      })
    } finally {
      setIsCreatingGroup(false)
    }
  }

  const handleUpdateGroupDetails = async () => {
    if (!user || !selectedOrgId || !editingGroup) return
    setIsUpdatingGroup(true)
    try {
      const idToken = await user.getIdToken()
      const res = await updateMailGroup(idToken, selectedOrgId, editingGroup.id, {
        name: editGroupForm.name,
        orgUnitPath: editGroupForm.orgUnitPath,
      })
      if (!res.success || !res.data) throw new Error(res.error)

      setGroups((prev) =>
        prev
          .map((g) =>
            g.id === editingGroup.id
              ? {
                  ...g,
                  name: res.data!.name,
                  orgUnitPath: res.data!.orgUnitPath,
                  updatedAt: res.data!.updatedAt,
                }
              : g
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setEditingGroup(null)
      toast({
        title: "Group updated",
        description: "Group name and organizational unit saved.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err.message || "Could not update group.",
      })
    } finally {
      setIsUpdatingGroup(false)
    }
  }

  const handleUpdateGroupMembersList = async (nextMembers: string[]) => {
    if (!user || !selectedOrgId || !membersTargetGroup) return
    setIsUpdatingGroupMembers(true)
    try {
      const idToken = await user.getIdToken()
      const res = await updateMailGroup(idToken, selectedOrgId, membersTargetGroup.id, {
        memberEmails: nextMembers,
      })
      if (!res.success || !res.data) throw new Error(res.error)

      const updatedList = res.data.memberEmails
      setGroups((prev) =>
        prev.map((g) =>
          g.id === membersTargetGroup.id
            ? { ...g, memberEmails: updatedList, updatedAt: res.data!.updatedAt }
            : g
        )
      )
      setMembersTargetGroup((prev) => (prev ? { ...prev, memberEmails: updatedList } : null))
      setGroupMemberInput("")
      toast({
        title: "Group members updated",
        description: `Updated recipients for ${membersTargetGroup.groupEmail}.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to update group members",
        description: err.message || "Could not update members.",
      })
    } finally {
      setIsUpdatingGroupMembers(false)
    }
  }

  const handleConfirmDeleteGroup = async () => {
    if (!user || !selectedOrgId || !deletingGroup) return
    setIsDeletingGroup(true)
    try {
      const idToken = await user.getIdToken()
      const res = await deleteMailGroup(idToken, selectedOrgId, deletingGroup.id)
      if (!res.success) throw new Error(res.error)

      setGroups((prev) => prev.filter((g) => g.id !== deletingGroup.id))
      toast({
        title: "Group deleted",
        description: `${deletingGroup.groupEmail} was removed.`,
      })
      setDeletingGroup(null)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to delete group",
        description: err.message || "Could not delete group.",
      })
    } finally {
      setIsDeletingGroup(false)
    }
  }

  // Filtered views
  const activeUsers = useMemo(() => users.filter((u) => u.status === "active"), [users])
  const suspendedUsers = useMemo(() => users.filter((u) => u.status === "suspended"), [users])
  const deletedUsers = useMemo(() => users.filter((u) => u.status === "deleted"), [users])

  const filteredActiveUsers = useMemo(() => {
    return activeUsers.filter((u) => {
      if (selectedUserOu !== "ALL" && u.orgUnitPath !== selectedUserOu) return false
      if (!userSearchQuery.trim()) return true
      const q = userSearchQuery.toLowerCase().trim()
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.primaryEmail.toLowerCase().includes(q) ||
        u.orgUnitPath.toLowerCase().includes(q) ||
        u.aliases.some((a) => a.toLowerCase().includes(q))
      )
    })
  }, [activeUsers, selectedUserOu, userSearchQuery])

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (selectedGroupOu !== "ALL" && g.orgUnitPath !== selectedGroupOu) return false
      if (!groupSearchQuery.trim()) return true
      const q = groupSearchQuery.toLowerCase().trim()
      return (
        g.name.toLowerCase().includes(q) ||
        g.groupEmail.toLowerCase().includes(q) ||
        g.orgUnitPath.toLowerCase().includes(q) ||
        g.memberEmails.some((m) => m.toLowerCase().includes(q))
      )
    })
  }, [groups, selectedGroupOu, groupSearchQuery])

  const filteredSuspendedUsers = useMemo(() => {
    if (!suspendedSearchQuery.trim()) return suspendedUsers
    const q = suspendedSearchQuery.toLowerCase().trim()
    return suspendedUsers.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.primaryEmail.toLowerCase().includes(q) ||
        u.orgUnitPath.toLowerCase().includes(q)
    )
  }, [suspendedUsers, suspendedSearchQuery])

  const filteredDeletedUsers = useMemo(() => {
    if (!suspendedSearchQuery.trim()) return deletedUsers
    const q = suspendedSearchQuery.toLowerCase().trim()
    return deletedUsers.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.primaryEmail.toLowerCase().includes(q) ||
        u.orgUnitPath.toLowerCase().includes(q)
    )
  }, [deletedUsers, suspendedSearchQuery])

  const allOuOptions = useMemo(() => {
    const paths = new Set<string>(["/"])
    orgUnits.forEach((ou) => paths.add(ou.path))
    return Array.from(paths)
  }, [orgUnits])

  if (authLoading || isLoadingOrgs || isLoadingState) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" strokeWidth={1.5} />
          <p className="text-xs text-slate-500">Loading email service</p>
        </div>
      </DashboardShell>
    )
  }

  if (orgs.length === 0 || !selectedOrg) {
    return (
      <DashboardShell>
        <div className="py-20 text-center max-w-sm mx-auto space-y-2">
          <h2 className="text-base font-headline font-semibold text-slate-900">
            No organization selected
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Register or select an organization on Account home to configure domain email accounts and routing.
          </p>
        </div>
      </DashboardShell>
    )
  }

  const verifiedDnsCount = requiredDnsRecords.filter((r) => r.verified).length

  // Pre-activation screen: asymmetric split with real domain routing ledger preview
  if (!serviceActive) {
    return (
      <DashboardShell>
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-slate-200/80 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-headline font-semibold text-slate-900 tracking-tight">
                  Email service
                </h1>
                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  {selectedOrg.domain}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Custom domain mailboxes, send-as aliases, organizational units, and group routing
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/80">
              {/* Left column: plain statement and activation action */}
              <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between gap-8">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-500">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        dnsServiceActive ? "bg-emerald-600" : "bg-amber-500"
                      )}
                    />
                    {dnsServiceActive
                      ? "DNS management active — records provision automatically"
                      : "Manual registrar DNS configuration"}
                  </div>

                  <h2 className="text-xl font-headline font-semibold text-slate-900 leading-snug">
                    Domain mail and directory for {selectedOrg.domain}
                  </h2>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Provision accounts for signing in to Revlet Mail, attach send-as aliases, group addresses by organizational unit, and route unmatched domain mail to a fallback inbox. Deleted accounts remain recoverable for 14 days.
                  </p>
                </div>

                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-500">Outbound allowance</span>
                    <span className="font-mono text-slate-900 tabular-nums">
                      1,000 / month · 100 / day
                    </span>
                  </div>

                  <Button
                    onClick={handleActivateService}
                    disabled={isActivating}
                    className="w-full bg-primary hover:bg-primary/95 !text-white text-white font-medium h-10 px-5 rounded-lg text-xs transition-colors"
                  >
                    {isActivating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" strokeWidth={1.5} />
                        Activating email service
                      </>
                    ) : (
                      "Activate email service"
                    )}
                  </Button>
                </div>
              </div>

              {/* Right column: real routing & DNS ledger preview for this domain */}
              <div className="lg:col-span-7 bg-slate-50/50 p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    Required routing records for {selectedOrg.domain}
                  </span>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {requiredDnsRecords.length} records
                  </span>
                </div>

                <div className="rounded-lg border border-slate-200/80 bg-white divide-y divide-slate-100">
                  {requiredDnsRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-[11px] text-slate-500 w-14 shrink-0">
                          {rec.type}
                        </span>
                        <span className="font-mono text-slate-800 truncate">{rec.name}</span>
                      </div>
                      <span className="font-mono text-slate-500 truncate max-w-[220px]">
                        {rec.content}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  {dnsServiceActive
                    ? `Activating email service snapshots your zone and writes these ${requiredDnsRecords.length} records to ${selectedOrg.domain} immediately.`
                    : `After activation, copy these records from Settings into your domain registrar for ${selectedOrg.domain}.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  // Active Email Service Admin Center
  return (
    <DashboardShell>
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-headline font-semibold text-slate-900 tracking-tight">
                Email service
              </h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                {selectedOrg.domain}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Directory, aliases, organizational units, distribution groups, and domain routing
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAllMailData(true)}
              disabled={isRefreshing}
              className="h-9 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors"
            >
              <RefreshCw
                className={cn("w-4 h-4 mr-2 text-slate-400", isRefreshing && "animate-spin")}
                strokeWidth={1.5}
              />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOuModalOpen(true)}
              className="h-9 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors"
            >
              Organizational units
              <span className="ml-2 font-mono text-slate-400 tabular-nums">
                {orgUnits.length + 1}
              </span>
            </Button>
          </div>
        </div>

        {/* Moment: Live domain routing & outbound quota ledger strip */}
        <div className="rounded-xl border border-slate-200/80 bg-white grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Active mailboxes</div>
            <div className="text-2xl font-medium text-slate-900 tabular-nums">
              {activeUsers.length}
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              {groups.length} {groups.length === 1 ? "group" : "groups"} · {orgUnits.length + 1} units
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Monthly outbound quota</div>
            <div className="text-2xl font-medium text-slate-900 tabular-nums">
              {monthlySentCount.toLocaleString()}{" "}
              <span className="text-sm font-normal text-slate-400">
                / {monthlyOutboundLimit.toLocaleString()}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              {(monthlyOutboundLimit - monthlySentCount).toLocaleString()} remaining this month
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Daily outbound limit</div>
            <div className="text-2xl font-medium text-slate-900 tabular-nums">
              {dailySentCount.toLocaleString()}{" "}
              <span className="text-sm font-normal text-slate-400">
                / {dailyOutboundLimit.toLocaleString()}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              24-hour rolling window
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Domain routing status</div>
            <div className="flex items-center gap-2 pt-0.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  verifiedDnsCount === requiredDnsRecords.length && requiredDnsRecords.length > 0
                    ? "bg-emerald-600"
                    : "bg-amber-500"
                )}
              />
              <span className="text-base font-medium text-slate-900 tabular-nums">
                {verifiedDnsCount} of {requiredDnsRecords.length} DNS verified
              </span>
            </div>
            <div className="text-xs font-mono text-slate-400 truncate">
              {catchAllEmail ? `Catch-all → ${catchAllEmail}` : "Catch-all disabled"}
            </div>
          </div>
        </div>

        {/* Navigation tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="border-b border-slate-200/80">
            <TabsList className="bg-transparent p-0 h-auto gap-6 rounded-none">
              <TabsTrigger
                value="users"
                className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
              >
                Users directory
                <span className="ml-2 font-mono text-slate-400 tabular-nums">
                  {activeUsers.length}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="groups"
                className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
              >
                Groups
                <span className="ml-2 font-mono text-slate-400 tabular-nums">
                  {groups.length}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="suspended"
                className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
              >
                Suspended accounts
                <span className="ml-2 font-mono text-slate-400 tabular-nums">
                  {suspendedUsers.length + deletedUsers.length}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="settings"
                className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
              >
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          {/* =====================================================================
              TAB 1: USERS DIRECTORY
          ===================================================================== */}
          <TabsContent value="users" className="mt-0">
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              {/* Unified filter & action bar */}
              <div className="p-4 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40">
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedUserOu("ALL")}
                    className={cn(
                      "h-8 px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                      selectedUserOu === "ALL"
                        ? "bg-white text-slate-900 border border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    )}
                  >
                    <span>All units</span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {activeUsers.length}
                    </span>
                  </button>

                  {allOuOptions.map((ouPath) => {
                    const count = activeUsers.filter((u) => u.orgUnitPath === ouPath).length
                    return (
                      <button
                        key={ouPath}
                        type="button"
                        onClick={() => setSelectedUserOu(ouPath)}
                        className={cn(
                          "h-8 px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                          selectedUserOu === ouPath
                            ? "bg-white text-slate-900 border border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                        )}
                      >
                        <span className="font-mono">{ouPath}</span>
                        <span className="font-mono text-slate-400 tabular-nums">{count}</span>
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => setIsOuModalOpen(true)}
                    className="h-8 px-2.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/70 transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>New unit</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      strokeWidth={1.5}
                    />
                    <Input
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Search"
                      className="h-9 pl-9 text-xs border-slate-200 bg-white rounded-lg"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      setCreateUserForm({
                        firstName: "",
                        lastName: "",
                        emailPrefix: "",
                        password: "",
                        orgUnitPath: selectedUserOu === "ALL" ? "/" : selectedUserOu,
                      })
                      setIsCreateUserOpen(true)
                    }}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                    Add user
                  </Button>
                </div>
              </div>

              {/* Users table */}
              {filteredActiveUsers.length === 0 ? (
                <div className="py-16 px-4 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-900">
                    {activeUsers.length === 0
                      ? "No email accounts provisioned"
                      : "No matching email accounts"}
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {activeUsers.length === 0
                      ? `Create an account on @${selectedOrg.domain} with sign-in credentials for Revlet Mail`
                      : "Adjust the organizational unit filter or search query"}
                  </p>
                  {activeUsers.length === 0 && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        onClick={() => setIsCreateUserOpen(true)}
                        className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
                      >
                        <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                        Add user
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                      <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                        Account name
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Primary address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Aliases
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Organizational unit
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActiveUsers.map((u) => (
                      <TableRow
                        key={u.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                      >
                        <TableCell className="pl-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                            <span className="text-xs font-medium text-slate-900">
                              {u.displayName}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5">
                          <span className="text-xs font-mono text-slate-700">
                            {u.primaryEmail}
                          </span>
                        </TableCell>

                        <TableCell className="py-3.5">
                          {u.aliases.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAliasTargetUser(u)
                                setNewAliasPrefix("")
                                setEditingAliasOriginal(null)
                              }}
                              className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                            >
                              + Add alias
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {u.aliases.map((alias) => (
                                <span
                                  key={alias}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700"
                                >
                                  {alias}
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="py-3.5">
                          <span className="text-xs font-mono text-slate-500">
                            {u.orgUnitPath}
                          </span>
                        </TableCell>

                        <TableCell className="text-right pr-6 py-3.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                              >
                                <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-52 bg-white border border-slate-200 shadow-md rounded-xl p-1"
                            >
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditingUser(u)
                                  setEditUserForm({
                                    firstName: u.firstName,
                                    lastName: u.lastName,
                                    orgUnitPath: u.orgUnitPath || "/",
                                  })
                                }}
                                className="gap-2 py-2 text-xs cursor-pointer rounded-lg"
                              >
                                <UserPen className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                                <span>Update account name</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => {
                                  setPasswordTargetUser(u)
                                  setNewPasswordValue("")
                                }}
                                className="gap-2 py-2 text-xs cursor-pointer rounded-lg"
                              >
                                <KeyRound className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                                <span>Reset password</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => {
                                  setAliasTargetUser(u)
                                  setNewAliasPrefix("")
                                  setEditingAliasOriginal(null)
                                  setEditingAliasPrefix("")
                                }}
                                className="gap-2 py-2 text-xs cursor-pointer rounded-lg"
                              >
                                <AtSign className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                                <span className="flex-1">Manage email aliases</span>
                                <span className="font-mono text-slate-400 tabular-nums">
                                  {u.aliases.length}
                                </span>
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                onSelect={() => handleSuspendOrReactivateUser(u, true)}
                                className="gap-2 py-2 text-xs text-amber-700 focus:text-amber-800 cursor-pointer rounded-lg"
                              >
                                <Ban className="w-4 h-4" strokeWidth={1.5} />
                                <span>Suspend account</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => setDeletingUser(u)}
                                className="gap-2 py-2 text-xs text-destructive focus:text-destructive cursor-pointer rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                <span>Delete email account</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* =====================================================================
              TAB 2: GROUPS (Same Styling & Approach as Users Directory Tab)
          ===================================================================== */}
          <TabsContent value="groups" className="mt-0">
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40">
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupOu("ALL")}
                    className={cn(
                      "h-8 px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                      selectedGroupOu === "ALL"
                        ? "bg-white text-slate-900 border border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    )}
                  >
                    <span>All units</span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {groups.length}
                    </span>
                  </button>

                  {allOuOptions.map((ouPath) => {
                    const count = groups.filter((g) => g.orgUnitPath === ouPath).length
                    return (
                      <button
                        key={ouPath}
                        type="button"
                        onClick={() => setSelectedGroupOu(ouPath)}
                        className={cn(
                          "h-8 px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                          selectedGroupOu === ouPath
                            ? "bg-white text-slate-900 border border-slate-200/90 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                        )}
                      >
                        <span className="font-mono">{ouPath}</span>
                        <span className="font-mono text-slate-400 tabular-nums">{count}</span>
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => setIsOuModalOpen(true)}
                    className="h-8 px-2.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/70 transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>New unit</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      strokeWidth={1.5}
                    />
                    <Input
                      value={groupSearchQuery}
                      onChange={(e) => setGroupSearchQuery(e.target.value)}
                      placeholder="Search"
                      className="h-9 pl-9 text-xs border-slate-200 bg-white rounded-lg"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      setCreateGroupForm({
                        name: "",
                        emailPrefix: "",
                        orgUnitPath: selectedGroupOu === "ALL" ? "/" : selectedGroupOu,
                        memberEmails: [],
                      })
                      setNewGroupMemberInput("")
                      setIsCreateGroupOpen(true)
                    }}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                    Create group
                  </Button>
                </div>
              </div>

              {filteredGroups.length === 0 ? (
                <div className="py-16 px-4 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-900">
                    {groups.length === 0 ? "No distribution groups created" : "No matching groups"}
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {groups.length === 0
                      ? `Create shared addresses on @${selectedOrg.domain} that deliver incoming messages to multiple members`
                      : "Adjust the organizational unit filter or search query"}
                  </p>
                  {groups.length === 0 && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        onClick={() => setIsCreateGroupOpen(true)}
                        className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
                      >
                        <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                        Create group
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                      <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                        Group name
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Group address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Members
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Organizational unit
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGroups.map((g) => (
                      <TableRow
                        key={g.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                      >
                        <TableCell className="pl-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                            <span className="text-xs font-medium text-slate-900">{g.name}</span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3.5">
                          <span className="text-xs font-mono text-slate-700">
                            {g.groupEmail}
                          </span>
                        </TableCell>

                        <TableCell className="py-3.5">
                          {g.memberEmails.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setMembersTargetGroup(g)
                                setGroupMemberInput("")
                              }}
                              className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                            >
                              + Add members
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {g.memberEmails.slice(0, 3).map((member) => (
                                <span
                                  key={member}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700"
                                >
                                  {member}
                                </span>
                              ))}
                              {g.memberEmails.length > 3 && (
                                <span className="text-xs font-mono text-slate-400 tabular-nums">
                                  +{g.memberEmails.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="py-3.5">
                          <span className="text-xs font-mono text-slate-500">
                            {g.orgUnitPath}
                          </span>
                        </TableCell>

                        <TableCell className="text-right pr-6 py-3.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                              >
                                <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-52 bg-white border border-slate-200 shadow-md rounded-xl p-1"
                            >
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditingGroup(g)
                                  setEditGroupForm({
                                    name: g.name,
                                    orgUnitPath: g.orgUnitPath || "/",
                                  })
                                }}
                                className="gap-2 py-2 text-xs cursor-pointer rounded-lg"
                              >
                                <Edit2 className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                                <span>Update group name</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => {
                                  setMembersTargetGroup(g)
                                  setGroupMemberInput("")
                                }}
                                className="gap-2 py-2 text-xs cursor-pointer rounded-lg"
                              >
                                <Users className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                                <span className="flex-1">Manage members</span>
                                <span className="font-mono text-slate-400 tabular-nums">
                                  {g.memberEmails.length}
                                </span>
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                onSelect={() => setDeletingGroup(g)}
                                className="gap-2 py-2 text-xs text-destructive focus:text-destructive cursor-pointer rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                <span>Delete group</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* =====================================================================
              TAB 3: SUSPENDED ACCOUNTS & 14-DAY DELETED RECOVERY
          ===================================================================== */}
          <TabsContent value="suspended" className="space-y-6 mt-0">
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40">
                <div className="space-y-0.5">
                  <h2 className="text-xs font-medium text-slate-900">
                    Suspended accounts
                    <span className="ml-2 font-mono text-slate-400 tabular-nums">
                      {filteredSuspendedUsers.length}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    Suspended accounts cannot sign in or send mail until reactivated
                  </p>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    strokeWidth={1.5}
                  />
                  <Input
                    value={suspendedSearchQuery}
                    onChange={(e) => setSuspendedSearchQuery(e.target.value)}
                    placeholder="Search"
                    className="h-9 pl-9 text-xs border-slate-200 bg-white rounded-lg"
                  />
                </div>
              </div>

              {filteredSuspendedUsers.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No suspended email accounts
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                      <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                        Account name
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Primary address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Organizational unit
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuspendedUsers.map((u) => (
                      <TableRow key={u.id} className="border-b border-slate-100 last:border-0">
                        <TableCell className="pl-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span className="text-xs font-medium text-slate-900">
                              {u.displayName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 text-xs font-mono text-slate-700">
                          {u.primaryEmail}
                        </TableCell>
                        <TableCell className="py-3.5 text-xs font-mono text-slate-500">
                          {u.orgUnitPath}
                        </TableCell>
                        <TableCell className="text-right pr-6 py-3.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                              >
                                <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-48 bg-white border border-slate-200 shadow-md rounded-xl p-1"
                            >
                              <DropdownMenuItem
                                onSelect={() => handleSuspendOrReactivateUser(u, false)}
                                className="gap-2 py-2 text-xs cursor-pointer rounded-lg"
                              >
                                <RotateCcw className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                                <span>Reactivate account</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setDeletingUser(u)}
                                className="gap-2 py-2 text-xs text-destructive focus:text-destructive cursor-pointer rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                <span>Delete email account</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Deleted accounts — 14-day recovery */}
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200/80 bg-slate-50/40 space-y-0.5">
                <h2 className="text-xs font-medium text-slate-900">
                  Deleted accounts (14-day recovery)
                  <span className="ml-2 font-mono text-slate-400 tabular-nums">
                    {filteredDeletedUsers.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Accounts can be restored for 14 days after deletion before permanent removal
                </p>
              </div>

              {filteredDeletedUsers.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No deleted accounts in the 14-day recovery window
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                      <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                        Account name
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Primary address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Recovery window
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeletedUsers.map((u) => {
                      const daysLeft = getDaysRemaining(u.recoverableUntil)
                      return (
                        <TableRow key={u.id} className="border-b border-slate-100 last:border-0">
                          <TableCell className="pl-6 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" />
                              <span className="text-xs font-medium text-slate-900">
                                {u.displayName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-3.5 text-xs font-mono text-slate-700">
                            {u.primaryEmail}
                          </TableCell>
                          <TableCell className="py-3.5 text-xs font-mono text-slate-500 tabular-nums">
                            {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining
                          </TableCell>
                          <TableCell className="text-right pr-6 py-3.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRecoverDeletedUser(u)}
                              className="h-8 px-3 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                            >
                              Recover account
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* =====================================================================
              TAB 4: SETTINGS (Domain Catch-All Routing + Required DNS Records)
          ===================================================================== */}
          <TabsContent value="settings" className="space-y-6 mt-0">
            {/* Domain catch-all routing */}
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="p-6 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-headline font-semibold text-slate-900">
                    Domain catch-all routing
                  </h2>
                  <p className="text-xs text-slate-500">
                    Deliver incoming messages addressed to any unmatched{" "}
                    <span className="font-mono text-slate-700">@{selectedOrg.domain}</span>{" "}
                    recipient to a designated fallback email account
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-500">
                    {catchAllUserId ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={Boolean(catchAllUserId)}
                    disabled={isUpdatingCatchAll}
                    onCheckedChange={handleCatchAllToggle}
                  />
                </div>
              </div>

              <div className="p-6">
                <div className="max-w-md space-y-2">
                  <Label className="text-xs font-medium text-slate-700">
                    Fallback account
                  </Label>
                  <Select
                    value={catchAllUserId || "NONE"}
                    disabled={isUpdatingCatchAll || activeUsers.length === 0}
                    onValueChange={(val) =>
                      handleCatchAllTargetChange(val === "NONE" ? null : val)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs border-slate-200 bg-white rounded-lg">
                      <SelectValue placeholder="Select an active email account" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="NONE" className="text-xs">
                        Disabled (reject unmatched recipients)
                      </SelectItem>
                      {activeUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs">
                          {u.displayName} ({u.primaryEmail})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {catchAllEmail
                      ? `Unmatched mail to @${selectedOrg.domain} routes to ${catchAllEmail}.`
                      : `Unmatched mail to @${selectedOrg.domain} is rejected when catch-all is disabled.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Required DNS records */}
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="p-6 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-headline font-semibold text-slate-900">
                      Required DNS records
                    </h2>
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 tabular-nums">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          verifiedDnsCount === requiredDnsRecords.length &&
                            requiredDnsRecords.length > 0
                            ? "bg-emerald-600"
                            : "bg-amber-500"
                        )}
                      />
                      {verifiedDnsCount} of {requiredDnsRecords.length} verified
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    DNS records required for inbound delivery and outbound domain signing on{" "}
                    <span className="font-mono text-slate-700">{selectedOrg.domain}</span>
                  </p>
                </div>

                {dnsServiceActive && (
                  <Button
                    size="sm"
                    onClick={handleSyncDnsRecords}
                    disabled={isSyncingDns}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0 transition-colors"
                  >
                    {isSyncingDns ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" strokeWidth={1.5} />
                        Syncing DNS records
                      </>
                    ) : (
                      "Sync DNS records"
                    )}
                  </Button>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/40 hover:bg-slate-50/40 border-b border-slate-200/80">
                    <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                      Purpose
                    </TableHead>
                    <TableHead className="text-xs font-medium py-3 text-slate-500">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-medium py-3 text-slate-500">
                      Host
                    </TableHead>
                    <TableHead className="text-xs font-medium py-3 text-slate-500">
                      Value
                    </TableHead>
                    <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requiredDnsRecords.map((rec) => (
                    <TableRow key={rec.id} className="border-b border-slate-100 last:border-0">
                      <TableCell className="pl-6 py-3.5 text-xs font-medium text-slate-800">
                        {rec.purpose}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className="text-xs font-mono text-slate-600 tabular-nums">
                          {rec.type}
                          {rec.priority !== undefined ? ` ${rec.priority}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-2 max-w-[220px]">
                          <span className="text-xs font-mono text-slate-700 truncate">
                            {rec.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(rec.name, `${rec.id}-name`)}
                            className="text-slate-400 hover:text-slate-700 shrink-0 transition-colors"
                            title="Copy host"
                          >
                            {copiedKey === `${rec.id}-name` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.5} />
                            ) : (
                              <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                            )}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-2 max-w-[280px]">
                          <span className="text-xs font-mono text-slate-700 truncate">
                            {rec.content}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(rec.content, `${rec.id}-content`)}
                            className="text-slate-400 hover:text-slate-700 shrink-0 transition-colors"
                            title="Copy value"
                          >
                            {copiedKey === `${rec.id}-content` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.5} />
                            ) : (
                              <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                            )}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6 py-3.5">
                        <span className="inline-flex items-center justify-end gap-1.5 text-xs font-mono text-slate-600">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              rec.verified ? "bg-emerald-600" : "bg-amber-500"
                            )}
                          />
                          {rec.verified
                            ? "Verified"
                            : dnsServiceActive
                            ? "Pending sync"
                            : "Unverified"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Service deactivation */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-headline font-semibold text-slate-900">
                  Deactivate email service
                </h3>
                <p className="text-xs text-slate-500">
                  Pause email service for {selectedOrg.domain}. Accounts, aliases, and groups remain saved in your directory.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeactivateConfirmOpen(true)}
                className="h-9 px-4 text-xs font-medium text-destructive border-slate-200 hover:bg-rose-50 hover:text-destructive rounded-lg shrink-0 transition-colors"
              >
                Deactivate service
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* =========================================================================
            DIALOGS
        ========================================================================= */}

        {/* 1. Organizational units dialog */}
        <Dialog open={isOuModalOpen} onOpenChange={setIsOuModalOpen}>
          <DialogContent className="max-w-lg bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Organizational units
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create and manage organizational units for accounts and groups
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-3 bg-slate-50/70 p-4 rounded-lg border border-slate-200/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Unit name</Label>
                    <Input
                      value={newOuName}
                      onChange={(e) => setNewOuName(e.target.value)}
                      placeholder="Faculty"
                      className="h-9 text-xs bg-white border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Description (optional)
                    </Label>
                    <Input
                      value={newOuDescription}
                      onChange={(e) => setNewOuDescription(e.target.value)}
                      placeholder="Academic staff"
                      className="h-9 text-xs bg-white border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleCreateOu}
                    disabled={isSavingOu || !newOuName.trim()}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-8 px-4 rounded-lg text-xs"
                  >
                    {isSavingOu && (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" strokeWidth={1.5} />
                    )}
                    Create unit
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200/80 bg-white">
                  <div>
                    <div className="text-xs font-mono font-medium text-slate-800">/</div>
                    <div className="text-xs text-slate-400">Default root organizational unit</div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">Default</span>
                </div>

                {orgUnits.map((ou) => (
                  <div
                    key={ou.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200/80 bg-white"
                  >
                    <div>
                      <div className="text-xs font-mono font-medium text-slate-800">{ou.path}</div>
                      {ou.description && (
                        <div className="text-xs text-slate-500">{ou.description}</div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isSavingOu}
                      onClick={() => handleDeleteOu(ou)}
                      className="h-8 w-8 text-slate-400 hover:text-destructive hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOuModalOpen(false)}
                className="h-8 px-4 text-xs font-medium rounded-lg"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 2. Create user dialog */}
        <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Create email account
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create an address and password for signing in to Revlet Mail
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">First name</Label>
                  <Input
                    value={createUserForm.firstName}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    placeholder="Alex"
                    className="h-9 text-xs border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">Last name</Label>
                  <Input
                    value={createUserForm.lastName}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    placeholder="Morgan"
                    className="h-9 text-xs border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Email address</Label>
                <div className="flex items-center">
                  <Input
                    value={createUserForm.emailPrefix}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, emailPrefix: e.target.value }))
                    }
                    placeholder="alex"
                    className="h-9 text-xs font-mono border-slate-200 rounded-l-lg rounded-r-none"
                  />
                  <div className="h-9 px-3 bg-slate-50 border border-l-0 border-slate-200 rounded-r-lg flex items-center text-xs font-mono text-slate-500">
                    @{selectedOrg.domain}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Password</Label>
                <Input
                  type="password"
                  value={createUserForm.password}
                  onChange={(e) =>
                    setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder="Minimum 8 characters"
                  className="h-9 text-xs border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Organizational unit</Label>
                <Select
                  value={createUserForm.orgUnitPath}
                  onValueChange={(val) =>
                    setCreateUserForm((prev) => ({ ...prev, orgUnitPath: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {allOuOptions.map((ouPath) => (
                      <SelectItem key={ouPath} value={ouPath} className="text-xs font-mono">
                        {ouPath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateUserOpen(false)}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateUser}
                disabled={
                  isCreatingUser ||
                  !createUserForm.firstName.trim() ||
                  !createUserForm.emailPrefix.trim() ||
                  createUserForm.password.length < 8
                }
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
              >
                {isCreatingUser && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Create account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 3. Update user account name / OU dialog */}
        <Dialog
          open={Boolean(editingUser)}
          onOpenChange={(open) => {
            if (!open) setEditingUser(null)
          }}
        >
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Update account name
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update name and organizational unit for{" "}
                <span className="font-mono text-slate-700">{editingUser?.primaryEmail}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">First name</Label>
                  <Input
                    value={editUserForm.firstName}
                    onChange={(e) =>
                      setEditUserForm((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    className="h-9 text-xs border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">Last name</Label>
                  <Input
                    value={editUserForm.lastName}
                    onChange={(e) =>
                      setEditUserForm((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    className="h-9 text-xs border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Organizational unit</Label>
                <Select
                  value={editUserForm.orgUnitPath}
                  onValueChange={(val) =>
                    setEditUserForm((prev) => ({ ...prev, orgUnitPath: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {allOuOptions.map((ouPath) => (
                      <SelectItem key={ouPath} value={ouPath} className="text-xs font-mono">
                        {ouPath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingUser(null)}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateUserAccount}
                disabled={isUpdatingUser || !editUserForm.firstName.trim()}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
              >
                {isUpdatingUser && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 4. Reset user password dialog */}
        <Dialog
          open={Boolean(passwordTargetUser)}
          onOpenChange={(open) => {
            if (!open) setPasswordTargetUser(null)
          }}
        >
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Reset password
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Set a new sign-in password for{" "}
                <span className="font-mono text-slate-700">{passwordTargetUser?.primaryEmail}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">New password</Label>
                <Input
                  type="password"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="h-9 text-xs border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPasswordTargetUser(null)}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleResetUserPassword}
                disabled={isResettingPassword || newPasswordValue.length < 8}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
              >
                {isResettingPassword && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Update password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 5. Manage user email aliases dialog */}
        <Dialog
          open={Boolean(aliasTargetUser)}
          onOpenChange={(open) => {
            if (!open) {
              setAliasTargetUser(null)
              setEditingAliasOriginal(null)
            }
          }}
        >
          <DialogContent className="max-w-lg bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Manage email aliases
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Add, update, or remove aliases for{" "}
                <span className="font-mono text-slate-700">{aliasTargetUser?.primaryEmail}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">New alias</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center flex-1">
                    <Input
                      value={newAliasPrefix}
                      onChange={(e) => setNewAliasPrefix(e.target.value)}
                      placeholder="alias"
                      className="h-9 text-xs font-mono border-slate-200 rounded-l-lg rounded-r-none"
                    />
                    <div className="h-9 px-3 bg-slate-50 border border-l-0 border-slate-200 rounded-r-lg flex items-center text-xs font-mono text-slate-500">
                      @{selectedOrg.domain}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={isMutatingAlias || !newAliasPrefix.trim()}
                    onClick={() =>
                      handleAliasAction("add", { aliasPrefix: newAliasPrefix.trim() })
                    }
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0"
                  >
                    Add alias
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {aliasTargetUser?.aliases.length === 0 ? (
                  <div className="p-6 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No aliases assigned to this account
                  </div>
                ) : (
                  aliasTargetUser?.aliases.map((alias) => {
                    const isEditingThis = editingAliasOriginal === alias
                    return (
                      <div
                        key={alias}
                        className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200/80 bg-slate-50/40"
                      >
                        {isEditingThis ? (
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex items-center flex-1">
                              <Input
                                value={editingAliasPrefix}
                                onChange={(e) => setEditingAliasPrefix(e.target.value)}
                                className="h-8 text-xs font-mono bg-white border-slate-200 rounded-l-lg rounded-r-none"
                              />
                              <div className="h-8 px-2.5 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg flex items-center text-xs font-mono text-slate-500">
                                @{selectedOrg.domain}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              disabled={isMutatingAlias || !editingAliasPrefix.trim()}
                              onClick={() =>
                                handleAliasAction("update", {
                                  targetAlias: alias,
                                  updatedAliasPrefix: editingAliasPrefix.trim(),
                                })
                              }
                              className="h-8 px-3 text-xs font-medium bg-primary !text-white text-white rounded-lg"
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingAliasOriginal(null)
                                setEditingAliasPrefix("")
                              }}
                              className="h-8 px-2 text-xs text-slate-500"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="text-xs font-mono text-slate-800">{alias}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isMutatingAlias}
                                onClick={() => {
                                  setEditingAliasOriginal(alias)
                                  setEditingAliasPrefix(alias.split("@")[0] || "")
                                }}
                                className="h-7 w-7 text-slate-400 hover:text-slate-800 rounded-lg"
                                title="Update alias"
                              >
                                <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isMutatingAlias}
                                onClick={() =>
                                  handleAliasAction("remove", { targetAlias: alias })
                                }
                                className="h-7 w-7 text-slate-400 hover:text-destructive hover:bg-rose-50 rounded-lg"
                                title="Remove alias"
                              >
                                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAliasTargetUser(null)}
                className="h-8 px-4 text-xs font-medium rounded-lg"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 6. Delete user confirmation (14-day recovery) */}
        <AlertDialog
          open={Boolean(deletingUser)}
          onOpenChange={(open) => {
            if (!open) setDeletingUser(null)
          }}
        >
          <AlertDialogContent className="bg-white border border-slate-200 rounded-xl max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
                Delete email account
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                <span className="font-mono text-slate-800">{deletingUser?.primaryEmail}</span> will
                be moved to Deleted accounts and remain recoverable for 14 days before permanent removal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs font-medium rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleConfirmDeleteUser()
                }}
                disabled={isDeletingUser}
                className="h-9 text-xs font-medium bg-destructive text-white hover:bg-destructive/90 rounded-lg"
              >
                {isDeletingUser && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Delete account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 7. Create group dialog */}
        <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Create group
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create a shared group email address that forwards to multiple members
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Group name</Label>
                <Input
                  value={createGroupForm.name}
                  onChange={(e) =>
                    setCreateGroupForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Admissions"
                  className="h-9 text-xs border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Group address</Label>
                <div className="flex items-center">
                  <Input
                    value={createGroupForm.emailPrefix}
                    onChange={(e) =>
                      setCreateGroupForm((prev) => ({ ...prev, emailPrefix: e.target.value }))
                    }
                    placeholder="admissions"
                    className="h-9 text-xs font-mono border-slate-200 rounded-l-lg rounded-r-none"
                  />
                  <div className="h-9 px-3 bg-slate-50 border border-l-0 border-slate-200 rounded-r-lg flex items-center text-xs font-mono text-slate-500">
                    @{selectedOrg.domain}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Organizational unit</Label>
                <Select
                  value={createGroupForm.orgUnitPath}
                  onValueChange={(val) =>
                    setCreateGroupForm((prev) => ({ ...prev, orgUnitPath: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {allOuOptions.map((ouPath) => (
                      <SelectItem key={ouPath} value={ouPath} className="text-xs font-mono">
                        {ouPath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-700">
                  Members (optional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={newGroupMemberInput}
                    onChange={(e) => setNewGroupMemberInput(e.target.value)}
                    placeholder={`member@${selectedOrg.domain}`}
                    className="h-9 text-xs font-mono border-slate-200 rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const clean = newGroupMemberInput.toLowerCase().trim()
                      if (clean && clean.includes("@")) {
                        setCreateGroupForm((prev) => ({
                          ...prev,
                          memberEmails: Array.from(new Set([...prev.memberEmails, clean])),
                        }))
                        setNewGroupMemberInput("")
                      }
                    }}
                    className="h-9 px-3 text-xs font-medium border-slate-200 rounded-lg"
                  >
                    Add
                  </Button>
                </div>
                {createGroupForm.memberEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {createGroupForm.memberEmails.map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700"
                      >
                        {m}
                        <button
                          type="button"
                          onClick={() =>
                            setCreateGroupForm((prev) => ({
                              ...prev,
                              memberEmails: prev.memberEmails.filter((item) => item !== m),
                            }))
                          }
                        >
                          <X className="w-3 h-3 text-slate-400 hover:text-slate-700" strokeWidth={1.5} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateGroupOpen(false)}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateGroup}
                disabled={
                  isCreatingGroup ||
                  !createGroupForm.name.trim() ||
                  !createGroupForm.emailPrefix.trim()
                }
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
              >
                {isCreatingGroup && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Create group
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 8. Update group name / OU dialog */}
        <Dialog
          open={Boolean(editingGroup)}
          onOpenChange={(open) => {
            if (!open) setEditingGroup(null)
          }}
        >
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Update group name
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update name and organizational unit for{" "}
                <span className="font-mono text-slate-700">{editingGroup?.groupEmail}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Group name</Label>
                <Input
                  value={editGroupForm.name}
                  onChange={(e) =>
                    setEditGroupForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="h-9 text-xs border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Organizational unit</Label>
                <Select
                  value={editGroupForm.orgUnitPath}
                  onValueChange={(val) =>
                    setEditGroupForm((prev) => ({ ...prev, orgUnitPath: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {allOuOptions.map((ouPath) => (
                      <SelectItem key={ouPath} value={ouPath} className="text-xs font-mono">
                        {ouPath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingGroup(null)}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateGroupDetails}
                disabled={isUpdatingGroup || !editGroupForm.name.trim()}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
              >
                {isUpdatingGroup && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 9. Manage group members dialog */}
        <Dialog
          open={Boolean(membersTargetGroup)}
          onOpenChange={(open) => {
            if (!open) setMembersTargetGroup(null)
          }}
        >
          <DialogContent className="max-w-lg bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Manage group members
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Add or remove recipient addresses for{" "}
                <span className="font-mono text-slate-700">{membersTargetGroup?.groupEmail}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-700">Member address</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={groupMemberInput}
                    onChange={(e) => setGroupMemberInput(e.target.value)}
                    placeholder={`user@${selectedOrg.domain}`}
                    className="h-9 text-xs font-mono border-slate-200 rounded-lg"
                  />
                  <Button
                    size="sm"
                    disabled={
                      isUpdatingGroupMembers ||
                      !groupMemberInput.trim() ||
                      !groupMemberInput.includes("@")
                    }
                    onClick={() => {
                      if (!membersTargetGroup) return
                      const clean = groupMemberInput.toLowerCase().trim()
                      const next = Array.from(
                        new Set([...membersTargetGroup.memberEmails, clean])
                      )
                      handleUpdateGroupMembersList(next)
                    }}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0"
                  >
                    Add member
                  </Button>
                </div>

                {activeUsers.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-xs text-slate-400 mr-1">Directory:</span>
                    {activeUsers
                      .filter(
                        (u) => !membersTargetGroup?.memberEmails.includes(u.primaryEmail)
                      )
                      .slice(0, 5)
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          disabled={isUpdatingGroupMembers}
                          onClick={() => {
                            if (!membersTargetGroup) return
                            handleUpdateGroupMembersList([
                              ...membersTargetGroup.memberEmails,
                              u.primaryEmail,
                            ])
                          }}
                          className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200/70 text-slate-600 transition-colors"
                        >
                          + {u.primaryEmail}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {membersTargetGroup?.memberEmails.length === 0 ? (
                  <div className="p-6 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No members assigned to this group
                  </div>
                ) : (
                  membersTargetGroup?.memberEmails.map((member) => (
                    <div
                      key={member}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200/80 bg-slate-50/40"
                    >
                      <span className="text-xs font-mono text-slate-800">{member}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isUpdatingGroupMembers}
                        onClick={() => {
                          if (!membersTargetGroup) return
                          handleUpdateGroupMembersList(
                            membersTargetGroup.memberEmails.filter((m) => m !== member)
                          )
                        }}
                        className="h-7 w-7 text-slate-400 hover:text-destructive hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMembersTargetGroup(null)}
                className="h-8 px-4 text-xs font-medium rounded-lg"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 10. Delete group confirmation */}
        <AlertDialog
          open={Boolean(deletingGroup)}
          onOpenChange={(open) => {
            if (!open) setDeletingGroup(null)
          }}
        >
          <AlertDialogContent className="bg-white border border-slate-200 rounded-xl max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
                Delete group
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                Permanently remove the group{" "}
                <span className="font-mono text-slate-800">{deletingGroup?.groupEmail}</span>.
                Member accounts will not be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs font-medium rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleConfirmDeleteGroup()
                }}
                disabled={isDeletingGroup}
                className="h-9 text-xs font-medium bg-destructive text-white hover:bg-destructive/90 rounded-lg"
              >
                {isDeletingGroup && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Delete group
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 11. Deactivate email service confirmation */}
        <AlertDialog
          open={isDeactivateConfirmOpen}
          onOpenChange={setIsDeactivateConfirmOpen}
        >
          <AlertDialogContent className="bg-white border border-slate-200 rounded-xl max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
                Deactivate email service
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                Deactivate email service for{" "}
                <span className="font-mono text-slate-800">{selectedOrg.domain}</span>? Existing
                directory records will remain saved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs font-medium rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDeactivateService()
                }}
                disabled={isDeactivating}
                className="h-9 text-xs font-medium bg-destructive text-white hover:bg-destructive/90 rounded-lg"
              >
                {isDeactivating && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Deactivate service
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardShell>
  )
}
