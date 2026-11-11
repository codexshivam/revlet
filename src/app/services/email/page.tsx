"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
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
  Mail,
  Users,
  FolderTree,
  ShieldAlert,
  Settings,
  Plus,
  MoreVertical,
  Search,
  KeyRound,
  UserPen,
  AtSign,
  Ban,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  Building2,
  UserPlus,
  UsersRound,
  Sparkles,
  Clock,
  X,
  Edit2,
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

  // --- DIALOG STATES ---
  // 1. Organizational Units Modal
  const [isOuModalOpen, setIsOuModalOpen] = useState(false)
  const [newOuName, setNewOuName] = useState("")
  const [newOuDescription, setNewOuDescription] = useState("")
  const [isSavingOu, setIsSavingOu] = useState(false)

  // 2. Create User Modal
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({
    firstName: "",
    lastName: "",
    emailPrefix: "",
    password: "",
    orgUnitPath: "/",
  })
  const [isCreatingUser, setIsCreatingUser] = useState(false)

  // 3. Update User Account Name / OU Modal
  const [editingUser, setEditingUser] = useState<MailUserRecord | null>(null)
  const [editUserForm, setEditUserForm] = useState({
    firstName: "",
    lastName: "",
    orgUnitPath: "/",
  })
  const [isUpdatingUser, setIsUpdatingUser] = useState(false)

  // 4. Reset Password Modal
  const [passwordTargetUser, setPasswordTargetUser] = useState<MailUserRecord | null>(null)
  const [newPasswordValue, setNewPasswordValue] = useState("")
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  // 5. Manage User Aliases Modal (Add / Update / Remove)
  const [aliasTargetUser, setAliasTargetUser] = useState<MailUserRecord | null>(null)
  const [newAliasPrefix, setNewAliasPrefix] = useState("")
  const [editingAliasOriginal, setEditingAliasOriginal] = useState<string | null>(null)
  const [editingAliasPrefix, setEditingAliasPrefix] = useState("")
  const [isMutatingAlias, setIsMutatingAlias] = useState(false)

  // 6. Confirm Delete User Modal (14-day recovery)
  const [deletingUser, setDeletingUser] = useState<MailUserRecord | null>(null)
  const [isDeletingUser, setIsDeletingUser] = useState(false)

  // 7. Create Group Modal
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false)
  const [createGroupForm, setCreateGroupForm] = useState({
    name: "",
    emailPrefix: "",
    orgUnitPath: "/",
    memberEmails: [] as string[],
  })
  const [newGroupMemberInput, setNewGroupMemberInput] = useState("")
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)

  // 8. Update Group Name / OU Modal
  const [editingGroup, setEditingGroup] = useState<MailGroupRecord | null>(null)
  const [editGroupForm, setEditGroupForm] = useState({
    name: "",
    orgUnitPath: "/",
  })
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false)

  // 9. Manage Group Members Modal
  const [membersTargetGroup, setMembersTargetGroup] = useState<MailGroupRecord | null>(null)
  const [groupMemberInput, setGroupMemberInput] = useState("")
  const [isUpdatingGroupMembers, setIsUpdatingGroupMembers] = useState(false)

  // 10. Confirm Delete Group Modal
  const [deletingGroup, setDeletingGroup] = useState<MailGroupRecord | null>(null)
  const [isDeletingGroup, setIsDeletingGroup] = useState(false)

  // 11. Catch-All Saving state
  const [isUpdatingCatchAll, setIsUpdatingCatchAll] = useState(false)

  // 12. Confirm Deactivate Service Modal
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false)

  // Ensure body pointer-events is never stuck after closing dropdowns + dialogs
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
          title: "Failed to load Email Service",
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

  // --- SERVICE ACTIVATION / DEACTIVATION / DNS SYNC ---

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
          title: "Email Service Activated",
          description: `Email Service is now active and required DNS records were automatically added to ${selectedOrg?.domain}.`,
        })
      } else if (res.data?.dnsWarning) {
        toast({
          title: "Email Service Activated",
          description: `Email Service is active. Please review required DNS records in the Settings tab (${res.data.dnsWarning}).`,
        })
      } else {
        toast({
          title: "Email Service Activated",
          description: `Email Service is now active for ${selectedOrg?.domain}. Review the required DNS records in Settings.`,
        })
      }

      await loadAllMailData(true)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Activation Failed",
        description: err.message || "Could not activate Email Service.",
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
        title: "Email Service Disabled",
        description: "Email Service has been deactivated for this organization.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Deactivation Failed",
        description: err.message || "Could not disable Email Service.",
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
        title: "DNS Records Synchronized",
        description:
          res.data?.addedCount && res.data.addedCount > 0
            ? `Added ${res.data.addedCount} missing DNS record(s) to ${selectedOrg?.domain}.`
            : `All required DNS records are already configured on ${selectedOrg?.domain}.`,
      })
      await loadAllMailData(true)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "DNS Sync Failed",
        description: err.message || "Could not synchronize DNS records.",
      })
    } finally {
      setIsSyncingDns(false)
    }
  }

  // --- CATCH-ALL HANDLERS ---

  const handleCatchAllToggle = async (enabled: boolean) => {
    if (!user || !selectedOrgId) return
    const activeUsersList = users.filter((u) => u.status === "active")
    if (enabled && activeUsersList.length === 0) {
      toast({
        variant: "destructive",
        title: "No Active Email Accounts",
        description: "Create at least one active email user before enabling Domain Catch-All Routing.",
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
        title: nextUserId ? "Catch-All Routing Updated" : "Catch-All Routing Disabled",
        description: nextUserId
          ? `Unmatched emails to @${selectedOrg?.domain} will route to ${res.data?.catchAllEmail}.`
          : `Unmatched emails to @${selectedOrg?.domain} will be rejected.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to Update Catch-All",
        description: err.message || "Could not update catch-all routing.",
      })
    } finally {
      setIsUpdatingCatchAll(false)
    }
  }

  // --- ORGANIZATIONAL UNIT HANDLERS ---

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
        title: "Organizational Unit Created",
        description: `"${res.data.path}" is now available in Users and Groups.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could Not Create Organizational Unit",
        description: err.message || "Failed to create Organizational Unit.",
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
        title: "Organizational Unit Removed",
        description: `"${ou.path}" was deleted and assigned members were moved to "/".`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to Remove Organizational Unit",
        description: err.message || "Could not delete Organizational Unit.",
      })
    } finally {
      setIsSavingOu(false)
    }
  }

  // --- USER DIRECTORY HANDLERS ---

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
        title: "Email Account Created",
        description: `${res.data.primaryEmail} is ready for signing in to Revlet Mail.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could Not Create Email Account",
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
        title: "Account Updated",
        description: "Account name and organizational unit have been updated.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
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
        title: "Password Reset",
        description: `Sign-in password for ${passwordTargetUser.primaryEmail} has been updated.`,
      })
      setPasswordTargetUser(null)
      setNewPasswordValue("")
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Password Reset Failed",
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
            ? "Email Alias Added"
            : action === "update"
            ? "Email Alias Updated"
            : "Email Alias Removed",
        description: `Aliases updated for ${aliasTargetUser.primaryEmail}.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Alias Operation Failed",
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
        title: suspend ? "Account Suspended" : "Account Reactivated",
        description: suspend
          ? `${targetUser.primaryEmail} has been suspended and moved to the Suspended Accounts tab.`
          : `${targetUser.primaryEmail} is now active again.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Action Failed",
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
        title: "Email Account Deleted (14-Day Recovery)",
        description: `${deletingUser.primaryEmail} can be recovered from the Suspended Accounts tab for the next 14 days.`,
      })
      setDeletingUser(null)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Deletion Failed",
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
        title: "Email Account Recovered",
        description: `${targetUser.primaryEmail} has been restored to active status.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Recovery Failed",
        description: err.message || "Could not recover email account.",
      })
    }
  }

  // --- GROUPS HANDLERS ---

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
        title: "Group Created",
        description: `${res.data.groupEmail} is now active.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could Not Create Group",
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
        title: "Group Updated",
        description: "Group name and organizational unit have been saved.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
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
        title: "Group Members Updated",
        description: `Updated recipient list for ${membersTargetGroup.groupEmail}.`,
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to Update Group Members",
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
        title: "Group Deleted",
        description: `${deletingGroup.groupEmail} has been permanently removed.`,
      })
      setDeletingGroup(null)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to Delete Group",
        description: err.message || "Could not delete group.",
      })
    } finally {
      setIsDeletingGroup(false)
    }
  }

  // --- FILTERED VIEWS ---

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

  // --- RENDER LOADING / NO ORG ---

  if (authLoading || isLoadingOrgs || isLoadingState) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs font-medium text-slate-500">Loading Email Service Admin Center...</p>
        </div>
      </DashboardShell>
    )
  }

  if (orgs.length === 0 || !selectedOrg) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 text-center max-w-sm mx-auto gap-4">
          <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-slate-300" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-headline font-bold text-slate-900">No Organization Selected</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Register or select an organization first to manage custom domain email accounts and routing.
            </p>
          </div>
        </div>
      </DashboardShell>
    )
  }

  // --- RENDER PRE-ACTIVATION OPT-IN STATE ---

  if (!serviceActive) {
    return (
      <DashboardShell>
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">
                  Email Service
                </h1>
                <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-semibold px-2.5 py-0.5 shadow-none hover:bg-slate-100">
                  Not Activated
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Custom domain mailboxes, aliases, groups, and organizational directory for{" "}
                <span className="font-semibold text-slate-700">{selectedOrg.domain}</span>
              </p>
            </div>
          </div>

          <Card className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden max-w-3xl">
            <div className="h-1.5 w-full bg-primary" />
            <CardContent className="p-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-headline font-bold text-slate-900">
                    Activate Revlet Mail Service for {selectedOrg.domain}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Provision full email accounts with sign-in credentials for Revlet Mail, manage send-as email aliases, organize accounts by Organizational Units, configure distribution groups, and control domain-wide catch-all routing.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <div className="text-xs font-bold text-slate-800">User & Alias Directory</div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Create email accounts, reset passwords, and attach multiple send-as aliases per user.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <div className="text-xs font-bold text-slate-800">Organizational Units & Groups</div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Structure users and mailing groups into clean organizational units with 14-day account recovery.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                  <div className="text-xs font-bold text-slate-800">Included Sending Quota</div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Includes 1,000 outbound emails per month and 100 outbound emails per day for your organization.
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "p-4 rounded-xl border flex items-start gap-3",
                  dnsServiceActive
                    ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                    : "bg-amber-50/60 border-amber-200 text-amber-900"
                )}
              >
                {dnsServiceActive ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs space-y-0.5">
                  <div className="font-bold">
                    {dnsServiceActive
                      ? "Automatic DNS Configuration Ready"
                      : "Manual DNS Setup Available"}
                  </div>
                  <p className="text-[11px] opacity-90 leading-relaxed">
                    {dnsServiceActive
                      ? `DNS Management is active on ${selectedOrg.domain}. All required MX, SPF, DKIM, and DMARC records will be added to your domain automatically the moment you activate Email Service.`
                      : `DNS Management is not currently linked to ${selectedOrg.domain}. You can still activate Email Service now and view the required DNS records in the Settings tab.`}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <Button
                  onClick={handleActivateService}
                  disabled={isActivating}
                  className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-10 px-6 rounded-lg text-xs shadow-sm"
                >
                  {isActivating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Activating Email Service...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Activate Email Service
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

  // --- RENDER ACTIVE EMAIL SERVICE ADMIN CENTER ---

  const verifiedDnsCount = requiredDnsRecords.filter((r) => r.verified).length

  return (
    <DashboardShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* PAGE HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">
                Email Service
              </h1>
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2.5 py-0.5 shadow-none hover:bg-emerald-50">
                Active · {selectedOrg.domain}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] font-medium px-2.5 py-0.5 border-slate-200 text-slate-600 bg-white"
              >
                Quota: {monthlySentCount.toLocaleString()} / {monthlyOutboundLimit.toLocaleString()} mo ·{" "}
                {dailySentCount.toLocaleString()} / {dailyOutboundLimit.toLocaleString()} day
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Administer user accounts, email aliases, organizational units, distribution groups, and domain settings.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAllMailData(true)}
              disabled={isRefreshing}
              className="h-9 px-3.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 rounded-lg"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isRefreshing && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOuModalOpen(true)}
              className="h-9 px-3.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 rounded-lg"
            >
              <FolderTree className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
              Organizational Units ({orgUnits.length + 1})
            </Button>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-100/80 border border-slate-200/80 p-1 rounded-xl h-auto flex flex-wrap gap-1 w-fit">
            <TabsTrigger
              value="users"
              className="rounded-lg px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              <Users className="w-3.5 h-3.5 mr-2" />
              Users Directory
              <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                {activeUsers.length}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="groups"
              className="rounded-lg px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              <UsersRound className="w-3.5 h-3.5 mr-2" />
              Groups
              <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                {groups.length}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="suspended"
              className="rounded-lg px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-2" />
              Suspended Accounts
              <span className="ml-2 text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                {suspendedUsers.length + deletedUsers.length}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="settings"
              className="rounded-lg px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
            >
              <Settings className="w-3.5 h-3.5 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* =====================================================================
              TAB 1: USERS DIRECTORY
          ===================================================================== */}
          <TabsContent value="users" className="space-y-4 mt-0">
            {/* OU Filter Pills + Search + Create User */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedUserOu("ALL")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                    selectedUserOu === "ALL"
                      ? "bg-primary text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  )}
                >
                  All Units ({activeUsers.length})
                </button>
                {allOuOptions.map((ouPath) => {
                  const count = activeUsers.filter((u) => u.orgUnitPath === ouPath).length
                  return (
                    <button
                      key={ouPath}
                      type="button"
                      onClick={() => setSelectedUserOu(ouPath)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        selectedUserOu === ouPath
                          ? "bg-primary text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                      )}
                    >
                      {ouPath === "/" ? "/ (Root)" : ouPath} ({count})
                    </button>
                  )
                })}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOuModalOpen(true)}
                  className="h-7 px-2.5 text-xs font-semibold text-primary hover:bg-primary/5 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  New OU
                </Button>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search users or aliases..."
                    className="h-9 pl-8 text-xs border-slate-200 bg-slate-50/50 focus-visible:bg-white rounded-lg"
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
                  className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs shadow-sm shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-2" />
                  Add User
                </Button>
              </div>
            </div>

            {/* Users Table */}
            <Card className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {filteredActiveUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
                      <Users className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-headline font-bold text-slate-900">
                        {activeUsers.length === 0
                          ? "No Email Accounts Created Yet"
                          : "No Matching Email Accounts"}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-sm">
                        {activeUsers.length === 0
                          ? `Create your first user account on @${selectedOrg.domain} with sign-in credentials for Revlet Mail.`
                          : "Try adjusting your Organizational Unit filter or search query."}
                      </p>
                    </div>
                    {activeUsers.length === 0 && (
                      <Button
                        size="sm"
                        onClick={() => setIsCreateUserOpen(true)}
                        className="mt-1 bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-8 px-4 rounded-lg text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Create First Email Account
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 border-b border-slate-200">
                        <TableHead className="text-xs font-semibold py-3.5 pl-6 text-slate-600">
                          Account Name
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                          Primary Email
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                          Email Aliases
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                          Organizational Unit
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3.5 text-right pr-6 text-slate-600">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveUsers.map((u) => (
                        <TableRow
                          key={u.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                        >
                          <TableCell className="pl-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                                {(u.firstName?.[0] || u.primaryEmail?.[0] || "U").toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-900">
                                  {u.displayName}
                                </span>
                                <span className="text-[11px] text-slate-400">Active account</span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-4">
                            <span className="text-xs font-mono font-semibold text-slate-700">
                              {u.primaryEmail}
                            </span>
                          </TableCell>

                          <TableCell className="py-4">
                            {u.aliases.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setAliasTargetUser(u)
                                  setNewAliasPrefix("")
                                  setEditingAliasOriginal(null)
                                }}
                                className="text-[11px] text-slate-400 hover:text-primary font-medium transition-colors"
                              >
                                + Add alias
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {u.aliases.map((alias) => (
                                  <Badge
                                    key={alias}
                                    variant="outline"
                                    className="text-[10px] font-mono font-medium px-2 py-0.5 bg-slate-50 border-slate-200 text-slate-700"
                                  >
                                    {alias}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="py-4">
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono font-medium px-2 py-0.5 bg-slate-50 border-slate-200 text-slate-600"
                            >
                              {u.orgUnitPath}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right pr-6 py-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 border-slate-200 bg-white hover:bg-slate-50 rounded-lg shadow-none"
                                >
                                  <MoreVertical className="w-4 h-4 text-slate-600" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-56 bg-white border border-slate-200 shadow-md rounded-xl p-1"
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
                                  className="gap-2.5 py-2 text-xs cursor-pointer rounded-lg"
                                >
                                  <UserPen className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Update account name</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onSelect={() => {
                                    setPasswordTargetUser(u)
                                    setNewPasswordValue("")
                                  }}
                                  className="gap-2.5 py-2 text-xs cursor-pointer rounded-lg"
                                >
                                  <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Reset password</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onSelect={() => {
                                    setAliasTargetUser(u)
                                    setNewAliasPrefix("")
                                    setEditingAliasOriginal(null)
                                    setEditingAliasPrefix("")
                                  }}
                                  className="gap-2.5 py-2 text-xs cursor-pointer rounded-lg"
                                >
                                  <AtSign className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Manage email aliases ({u.aliases.length})</span>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onSelect={() => handleSuspendOrReactivateUser(u, true)}
                                  className="gap-2.5 py-2 text-xs text-amber-700 focus:text-amber-800 cursor-pointer rounded-lg"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Suspend account</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onSelect={() => setDeletingUser(u)}
                                  className="gap-2.5 py-2 text-xs text-destructive focus:text-destructive cursor-pointer rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* =====================================================================
              TAB 2: GROUPS (Same Styling & Approach as Users Directory Tab)
          ===================================================================== */}
          <TabsContent value="groups" className="space-y-4 mt-0">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedGroupOu("ALL")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                    selectedGroupOu === "ALL"
                      ? "bg-primary text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  )}
                >
                  All Units ({groups.length})
                </button>
                {allOuOptions.map((ouPath) => {
                  const count = groups.filter((g) => g.orgUnitPath === ouPath).length
                  return (
                    <button
                      key={ouPath}
                      type="button"
                      onClick={() => setSelectedGroupOu(ouPath)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        selectedGroupOu === ouPath
                          ? "bg-primary text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                      )}
                    >
                      {ouPath === "/" ? "/ (Root)" : ouPath} ({count})
                    </button>
                  )
                })}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOuModalOpen(true)}
                  className="h-7 px-2.5 text-xs font-semibold text-primary hover:bg-primary/5 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  New OU
                </Button>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    placeholder="Search groups or members..."
                    className="h-9 pl-8 text-xs border-slate-200 bg-slate-50/50 focus-visible:bg-white rounded-lg"
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
                  className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs shadow-sm shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  Create Group
                </Button>
              </div>
            </div>

            <Card className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {filteredGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center">
                      <UsersRound className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-headline font-bold text-slate-900">
                        {groups.length === 0 ? "No Groups Created Yet" : "No Matching Groups"}
                      </h3>
                      <p className="text-xs text-slate-500 max-w-sm">
                        {groups.length === 0
                          ? `Create shared group addresses (such as support@${selectedOrg.domain} or faculty@${selectedOrg.domain}) that deliver incoming mail to multiple recipients.`
                          : "Try adjusting your Organizational Unit filter or search query."}
                      </p>
                    </div>
                    {groups.length === 0 && (
                      <Button
                        size="sm"
                        onClick={() => setIsCreateGroupOpen(true)}
                        className="mt-1 bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-8 px-4 rounded-lg text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Create First Group
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 border-b border-slate-200">
                        <TableHead className="text-xs font-semibold py-3.5 pl-6 text-slate-600">
                          Group Name
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                          Group Email
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                          Members
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                          Organizational Unit
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3.5 text-right pr-6 text-slate-600">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGroups.map((g) => (
                        <TableRow
                          key={g.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
                        >
                          <TableCell className="pl-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                                {(g.name?.[0] || "G").toUpperCase()}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-900">{g.name}</span>
                                <span className="text-[11px] text-slate-400">
                                  Distribution group
                                </span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-4">
                            <span className="text-xs font-mono font-semibold text-slate-700">
                              {g.groupEmail}
                            </span>
                          </TableCell>

                          <TableCell className="py-4">
                            {g.memberEmails.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMembersTargetGroup(g)
                                  setGroupMemberInput("")
                                }}
                                className="text-[11px] text-slate-400 hover:text-primary font-medium transition-colors"
                              >
                                + Add members
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {g.memberEmails.slice(0, 3).map((member) => (
                                  <Badge
                                    key={member}
                                    variant="outline"
                                    className="text-[10px] font-mono font-medium px-2 py-0.5 bg-slate-50 border-slate-200 text-slate-700"
                                  >
                                    {member}
                                  </Badge>
                                ))}
                                {g.memberEmails.length > 3 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 border-slate-200 text-slate-600"
                                  >
                                    +{g.memberEmails.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="py-4">
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono font-medium px-2 py-0.5 bg-slate-50 border-slate-200 text-slate-600"
                            >
                              {g.orgUnitPath}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right pr-6 py-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 border-slate-200 bg-white hover:bg-slate-50 rounded-lg shadow-none"
                                >
                                  <MoreVertical className="w-4 h-4 text-slate-600" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-56 bg-white border border-slate-200 shadow-md rounded-xl p-1"
                              >
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setEditingGroup(g)
                                    setEditGroupForm({
                                      name: g.name,
                                      orgUnitPath: g.orgUnitPath || "/",
                                    })
                                  }}
                                  className="gap-2.5 py-2 text-xs cursor-pointer rounded-lg"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Update group name</span>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onSelect={() => {
                                    setMembersTargetGroup(g)
                                    setGroupMemberInput("")
                                  }}
                                  className="gap-2.5 py-2 text-xs cursor-pointer rounded-lg"
                                >
                                  <Users className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Manage members ({g.memberEmails.length})</span>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onSelect={() => setDeletingGroup(g)}
                                  className="gap-2.5 py-2 text-xs text-destructive focus:text-destructive cursor-pointer rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* =====================================================================
              TAB 3: SUSPENDED ACCOUNTS & 14-DAY DELETED RECOVERY
          ===================================================================== */}
          <TabsContent value="suspended" className="space-y-6 mt-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="space-y-0.5">
                <h2 className="text-sm font-headline font-bold text-slate-900">
                  Suspended & Recently Deleted Accounts
                </h2>
                <p className="text-xs text-slate-500">
                  Suspended accounts cannot sign in or send mail. Deleted accounts remain recoverable for 14 days before permanent removal.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={suspendedSearchQuery}
                  onChange={(e) => setSuspendedSearchQuery(e.target.value)}
                  placeholder="Filter accounts..."
                  className="h-9 pl-8 text-xs border-slate-200 bg-slate-50/50 focus-visible:bg-white rounded-lg"
                />
              </div>
            </div>

            {/* Section A: Suspended Accounts */}
            <Card className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <CardHeader className="border-b border-slate-100 py-4 px-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <CardTitle className="text-sm font-headline font-bold text-slate-900">
                      Suspended Accounts ({filteredSuspendedUsers.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Reactivate a suspended account at any time or move it to 14-day deletion recovery.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredSuspendedUsers.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No suspended email accounts.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 border-b border-slate-200">
                        <TableHead className="text-xs font-semibold py-3 pl-6 text-slate-600">
                          Account Name
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3 text-slate-600">
                          Primary Email
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3 text-slate-600">
                          Organizational Unit
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3 text-right pr-6 text-slate-600">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSuspendedUsers.map((u) => (
                        <TableRow key={u.id} className="border-b border-slate-100 last:border-0">
                          <TableCell className="pl-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs flex items-center justify-center">
                                {(u.firstName?.[0] || "S").toUpperCase()}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-900">
                                  {u.displayName}
                                </div>
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 h-4 font-medium hover:bg-amber-50">
                                  Suspended
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-4 text-xs font-mono font-semibold text-slate-700">
                            {u.primaryEmail}
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono bg-slate-50 border-slate-200 text-slate-600"
                            >
                              {u.orgUnitPath}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-6 py-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 border-slate-200 bg-white hover:bg-slate-50 rounded-lg shadow-none"
                                >
                                  <MoreVertical className="w-4 h-4 text-slate-600" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-52 bg-white border border-slate-200 shadow-md rounded-xl p-1"
                              >
                                <DropdownMenuItem
                                  onSelect={() => handleSuspendOrReactivateUser(u, false)}
                                  className="gap-2.5 py-2 text-xs text-emerald-700 focus:text-emerald-800 cursor-pointer rounded-lg"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Reactivate account</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setDeletingUser(u)}
                                  className="gap-2.5 py-2 text-xs text-destructive focus:text-destructive cursor-pointer rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
              </CardContent>
            </Card>

            {/* Section B: Deleted Accounts (14-Day Recovery Window) */}
            <Card className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <CardHeader className="border-b border-slate-100 py-4 px-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <CardTitle className="text-sm font-headline font-bold text-slate-900">
                      Deleted Accounts — 14-Day Recovery ({filteredDeletedUsers.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Deleted email accounts can be restored within 14 days of deletion. After 14 days, accounts are purged permanently.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredDeletedUsers.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No deleted accounts pending 14-day recovery.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 border-b border-slate-200">
                        <TableHead className="text-xs font-semibold py-3 pl-6 text-slate-600">
                          Account Name
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3 text-slate-600">
                          Primary Email
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3 text-slate-600">
                          Recovery Window
                        </TableHead>
                        <TableHead className="text-xs font-semibold py-3 text-right pr-6 text-slate-600">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeletedUsers.map((u) => {
                        const daysLeft = getDaysRemaining(u.recoverableUntil)
                        return (
                          <TableRow key={u.id} className="border-b border-slate-100 last:border-0">
                            <TableCell className="pl-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center">
                                  {(u.firstName?.[0] || "D").toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-900">
                                    {u.displayName}
                                  </div>
                                  <span className="text-[11px] text-slate-400">
                                    OU: {u.orgUnitPath}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-4 text-xs font-mono font-semibold text-slate-700">
                              {u.primaryEmail}
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold px-2 py-0.5 hover:bg-rose-50">
                                <Clock className="w-3 h-3 mr-1" />
                                {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right pr-6 py-4">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRecoverDeletedUser(u)}
                                className="h-8 px-3 text-xs font-semibold border-slate-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 rounded-lg"
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                Recover Account
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* =====================================================================
              TAB 4: SETTINGS (Domain Catch-All Routing + Required DNS Records)
          ===================================================================== */}
          <TabsContent value="settings" className="space-y-6 mt-0">
            {/* Section 1: Domain Catch-All Routing */}
            <Card className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <CardHeader className="border-b border-slate-100 py-5 px-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-headline font-bold text-slate-900">
                      Domain Catch-All Routing
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Route incoming messages addressed to any unmatched{" "}
                      <span className="font-mono font-semibold text-slate-700">
                        @{selectedOrg.domain}
                      </span>{" "}
                      recipient to a designated fallback email account.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600">
                      {catchAllUserId ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={Boolean(catchAllUserId)}
                      disabled={isUpdatingCatchAll}
                      onCheckedChange={handleCatchAllToggle}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="space-y-2 flex-1 max-w-md">
                    <Label className="text-xs font-semibold text-slate-700">
                      Designated Catch-All Account
                    </Label>
                    <Select
                      value={catchAllUserId || "NONE"}
                      disabled={isUpdatingCatchAll || activeUsers.length === 0}
                      onValueChange={(val) =>
                        handleCatchAllTargetChange(val === "NONE" ? null : val)
                      }
                    >
                      <SelectTrigger className="h-10 text-xs border-slate-200 bg-white rounded-lg">
                        <SelectValue placeholder="Select an active email account..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200">
                        <SelectItem value="NONE" className="text-xs">
                          Disabled (Reject unmatched addresses)
                        </SelectItem>
                        {activeUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id} className="text-xs">
                            {u.displayName} ({u.primaryEmail})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-500">
                      {catchAllEmail
                        ? `All unmatched @${selectedOrg.domain} emails are currently delivered to ${catchAllEmail}.`
                        : `Unmatched @${selectedOrg.domain} emails are rejected when Catch-All Routing is disabled.`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Required DNS Records */}
            <Card className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <CardHeader className="border-b border-slate-100 py-5 px-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <CardTitle className="text-base font-headline font-bold text-slate-900">
                        Required DNS Records
                      </CardTitle>
                      <Badge
                        className={cn(
                          "text-[10px] font-semibold px-2 py-0.5 border shadow-none",
                          verifiedDnsCount === requiredDnsRecords.length &&
                            requiredDnsRecords.length > 0
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50"
                        )}
                      >
                        {verifiedDnsCount} / {requiredDnsRecords.length} Verified
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-slate-500">
                      Required domain records for inbound mail delivery, sender policy authorization, and cryptographic signing on{" "}
                      <span className="font-mono font-semibold text-slate-700">
                        {selectedOrg.domain}
                      </span>
                      .
                    </CardDescription>
                  </div>

                  {dnsServiceActive && (
                    <Button
                      size="sm"
                      onClick={handleSyncDnsRecords}
                      disabled={isSyncingDns}
                      className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs shadow-sm shrink-0"
                    >
                      {isSyncingDns ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          Syncing DNS Records...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-2" />
                          Sync Required DNS Records
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 border-b border-slate-200">
                      <TableHead className="text-xs font-semibold py-3.5 pl-6 text-slate-600">
                        Purpose
                      </TableHead>
                      <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                        Type
                      </TableHead>
                      <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                        Host / Name
                      </TableHead>
                      <TableHead className="text-xs font-semibold py-3.5 text-slate-600">
                        Value / Points To
                      </TableHead>
                      <TableHead className="text-xs font-semibold py-3.5 text-right pr-6 text-slate-600">
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requiredDnsRecords.map((rec) => (
                      <TableRow key={rec.id} className="border-b border-slate-100 last:border-0">
                        <TableCell className="pl-6 py-4 text-xs font-semibold text-slate-800">
                          {rec.purpose}
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-50 border-slate-200 text-slate-700"
                          >
                            {rec.type}
                            {rec.priority !== undefined ? ` (${rec.priority})` : ""}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2 max-w-[220px]">
                            <span className="text-xs font-mono text-slate-700 truncate">
                              {rec.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rec.name, `${rec.id}-name`)}
                              className="text-slate-400 hover:text-slate-700 shrink-0"
                              title="Copy Host"
                            >
                              {copiedKey === `${rec.id}-name` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2 max-w-[280px]">
                            <span className="text-xs font-mono text-slate-700 truncate">
                              {rec.content}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rec.content, `${rec.id}-content`)}
                              className="text-slate-400 hover:text-slate-700 shrink-0"
                              title="Copy Value"
                            >
                              {copiedKey === `${rec.id}-content` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-4">
                          {rec.verified ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 hover:bg-emerald-50">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold px-2 py-0.5 hover:bg-amber-50">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              {dnsServiceActive ? "Pending Sync" : "Add at Registrar"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Section 3: Service Status Control */}
            <Card className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-headline font-bold text-slate-900">
                    Deactivate Email Service
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pause Email Service for {selectedOrg.domain}. Existing accounts, aliases, and groups will remain saved in your directory.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDeactivateConfirmOpen(true)}
                  className="h-9 px-4 text-xs font-semibold text-destructive border-slate-200 hover:bg-rose-50 hover:text-destructive rounded-lg shrink-0"
                >
                  Deactivate Service
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* =========================================================================
            PROGRAMMATIC DIALOGS
        ========================================================================= */}

        {/* 1. ORGANIZATIONAL UNITS DIALOG */}
        <Dialog open={isOuModalOpen} onOpenChange={setIsOuModalOpen}>
          <DialogContent className="max-w-lg bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-bold text-lg text-slate-900">
                Organizational Units
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create and manage Organizational Units to organize email accounts and groups.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-5">
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Unit Name</Label>
                    <Input
                      value={newOuName}
                      onChange={(e) => setNewOuName(e.target.value)}
                      placeholder="e.g. Faculty or Admissions"
                      className="h-9 text-xs bg-white border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Description (Optional)
                    </Label>
                    <Input
                      value={newOuDescription}
                      onChange={(e) => setNewOuDescription(e.target.value)}
                      placeholder="Optional note"
                      className="h-9 text-xs bg-white border-slate-200"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleCreateOu}
                    disabled={isSavingOu || !newOuName.trim()}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-8 px-4 rounded-lg text-xs"
                  >
                    {isSavingOu ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Create Organizational Unit
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                  <div>
                    <div className="text-xs font-mono font-bold text-slate-800">/ (Root)</div>
                    <div className="text-[11px] text-slate-400">
                      Default organization-wide root unit
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500">
                    System Default
                  </Badge>
                </div>

                {orgUnits.map((ou) => (
                  <div
                    key={ou.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white"
                  >
                    <div>
                      <div className="text-xs font-mono font-bold text-slate-800">{ou.path}</div>
                      {ou.description && (
                        <div className="text-[11px] text-slate-500">{ou.description}</div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isSavingOu}
                      onClick={() => handleDeleteOu(ou)}
                      className="h-7 w-7 text-slate-400 hover:text-destructive hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
                className="h-8 px-4 text-xs font-semibold rounded-lg"
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 2. CREATE USER DIALOG */}
        <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-bold text-lg text-slate-900">
                Create Email Account
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create an email address and password for signing in to Revlet Mail.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">First Name</Label>
                  <Input
                    value={createUserForm.firstName}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    placeholder="Alex"
                    className="h-9 text-xs border-slate-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">Last Name</Label>
                  <Input
                    value={createUserForm.lastName}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    placeholder="Morgan"
                    className="h-9 text-xs border-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Email Address</Label>
                <div className="flex items-center">
                  <Input
                    value={createUserForm.emailPrefix}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, emailPrefix: e.target.value }))
                    }
                    placeholder="alex"
                    className="h-9 text-xs font-mono border-slate-200 rounded-r-none"
                  />
                  <div className="h-9 px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md flex items-center text-xs font-mono text-slate-600">
                    @{selectedOrg.domain}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">
                  Revlet Mail Sign-In Password
                </Label>
                <Input
                  type="password"
                  value={createUserForm.password}
                  onChange={(e) =>
                    setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder="Minimum 8 characters"
                  className="h-9 text-xs border-slate-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Organizational Unit</Label>
                <Select
                  value={createUserForm.orgUnitPath}
                  onValueChange={(val) =>
                    setCreateUserForm((prev) => ({ ...prev, orgUnitPath: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {allOuOptions.map((ouPath) => (
                      <SelectItem key={ouPath} value={ouPath} className="text-xs">
                        {ouPath === "/" ? "/ (Root)" : ouPath}
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
                className="h-9 px-4 text-xs font-semibold rounded-lg"
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
                className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs"
              >
                {isCreatingUser && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Create Email Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 3. UPDATE USER ACCOUNT NAME / OU DIALOG */}
        <Dialog
          open={Boolean(editingUser)}
          onOpenChange={(open) => {
            if (!open) setEditingUser(null)
          }}
        >
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-bold text-lg text-slate-900">
                Update Account Name
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update display name and organizational unit for{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {editingUser?.primaryEmail}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">First Name</Label>
                  <Input
                    value={editUserForm.firstName}
                    onChange={(e) =>
                      setEditUserForm((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    className="h-9 text-xs border-slate-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">Last Name</Label>
                  <Input
                    value={editUserForm.lastName}
                    onChange={(e) =>
                      setEditUserForm((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    className="h-9 text-xs border-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Organizational Unit</Label>
                <Select
                  value={editUserForm.orgUnitPath}
                  onValueChange={(val) =>
                    setEditUserForm((prev) => ({ ...prev, orgUnitPath: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {allOuOptions.map((ouPath) => (
                      <SelectItem key={ouPath} value={ouPath} className="text-xs">
                        {ouPath === "/" ? "/ (Root)" : ouPath}
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
                className="h-9 px-4 text-xs font-semibold rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateUserAccount}
                disabled={isUpdatingUser || !editUserForm.firstName.trim()}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs"
              >
                {isUpdatingUser && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 4. RESET USER PASSWORD DIALOG */}
        <Dialog
          open={Boolean(passwordTargetUser)}
          onOpenChange={(open) => {
            if (!open) setPasswordTargetUser(null)
          }}
        >
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-bold text-lg text-slate-900">
                Reset Password
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Set a new Revlet Mail sign-in password for{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {passwordTargetUser?.primaryEmail}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">New Password</Label>
                <Input
                  type="password"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="h-9 text-xs border-slate-200"
                />
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPasswordTargetUser(null)}
                className="h-9 px-4 text-xs font-semibold rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleResetUserPassword}
                disabled={isResettingPassword || newPasswordValue.length < 8}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs"
              >
                {isResettingPassword && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Update Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 5. MANAGE USER EMAIL ALIASES DIALOG (ADD / UPDATE / REMOVE) */}
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
              <DialogTitle className="font-headline font-bold text-lg text-slate-900">
                Manage Email Aliases
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Add, update, or remove email aliases for{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {aliasTargetUser?.primaryEmail}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-5">
              {/* Add new alias */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-700">Add New Email Alias</Label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center flex-1">
                    <Input
                      value={newAliasPrefix}
                      onChange={(e) => setNewAliasPrefix(e.target.value)}
                      placeholder="alias-name"
                      className="h-9 text-xs font-mono border-slate-200 rounded-r-none"
                    />
                    <div className="h-9 px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md flex items-center text-xs font-mono text-slate-600">
                      @{selectedOrg.domain}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={isMutatingAlias || !newAliasPrefix.trim()}
                    onClick={() =>
                      handleAliasAction("add", { aliasPrefix: newAliasPrefix.trim() })
                    }
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Alias
                  </Button>
                </div>
              </div>

              {/* Existing aliases list */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {aliasTargetUser?.aliases.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No email aliases configured for this user.
                  </div>
                ) : (
                  aliasTargetUser?.aliases.map((alias) => {
                    const isEditingThis = editingAliasOriginal === alias
                    return (
                      <div
                        key={alias}
                        className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50/60"
                      >
                        {isEditingThis ? (
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex items-center flex-1">
                              <Input
                                value={editingAliasPrefix}
                                onChange={(e) => setEditingAliasPrefix(e.target.value)}
                                className="h-8 text-xs font-mono bg-white border-slate-200 rounded-r-none"
                              />
                              <div className="h-8 px-2.5 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md flex items-center text-xs font-mono text-slate-600">
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
                              className="h-8 px-3 text-xs font-semibold bg-primary !text-white text-white rounded-lg"
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
                            <span className="text-xs font-mono font-semibold text-slate-800">
                              {alias}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isMutatingAlias}
                                onClick={() => {
                                  setEditingAliasOriginal(alias)
                                  setEditingAliasPrefix(alias.split("@")[0] || "")
                                }}
                                className="h-7 w-7 text-slate-500 hover:text-slate-800 rounded-lg"
                                title="Update alias"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
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
                                <Trash2 className="w-3.5 h-3.5" />
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
                className="h-8 px-4 text-xs font-semibold rounded-lg"
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 6. DELETE USER CONFIRMATION (14-DAY RECOVERY) */}
        <AlertDialog
          open={Boolean(deletingUser)}
          onOpenChange={(open) => {
            if (!open) setDeletingUser(null)
          }}
        >
          <AlertDialogContent className="bg-white border border-slate-200 rounded-xl max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline font-bold text-slate-900">
                Delete Email Account?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                <span className="font-mono font-semibold text-slate-800">
                  {deletingUser?.primaryEmail}
                </span>{" "}
                will be moved to Deleted Accounts and will remain available to be recovered for{" "}
                <span className="font-semibold text-slate-800">14 days</span> before permanent deletion.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs font-semibold rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleConfirmDeleteUser()
                }}
                disabled={isDeletingUser}
                className="h-9 text-xs font-semibold bg-destructive text-white hover:bg-destructive/90 rounded-lg"
              >
                {isDeletingUser && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Delete Email Account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 7. CREATE GROUP DIALOG */}
        <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-bold text-lg text-slate-900">
                Create Group
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create a shared group email address that forwards incoming messages to its members.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Group Name</Label>
                <Input
                  value={createGroupForm.name}
                  onChange={(e) =>
                    setCreateGroupForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Admissions Team"
                  className="h-9 text-xs border-slate-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Group Email Address</Label>
                <div className="flex items-center">
                  <Input
                    value={createGroupForm.emailPrefix}
                    onChange={(e) =>
                      setCreateGroupForm((prev) => ({ ...prev, emailPrefix: e.target.value }))
                    }
                    placeholder="admissions"
                    className="h-9 text-xs font-mono border-slate-200 rounded-r-none"
                  />
                  <div className="h-9 px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md flex items-center text-xs font-mono text-slate-600">
                    @{selectedOrg.domain}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Organizational Unit</Label>
                <Select
                  value={createGroupForm.orgUnitPath}
                  onValueChange={(val) =>
                    setCreateGroupForm((prev) => ({ ...prev, orgUnitPath: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {allOuOptions.map((ouPath) => (
                      <SelectItem key={ouPath} value={ouPath} className="text-xs">
                        {ouPath === "/" ? "/ (Root)" : ouPath}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-700">
                  Initial Member Emails (Optional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={newGroupMemberInput}
                    onChange={(e) => setNewGroupMemberInput(e.target.value)}
                    placeholder={`member@${selectedOrg.domain}`}
                    className="h-9 text-xs font-mono border-slate-200"
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
                    className="h-9 px-3 text-xs font-semibold border-slate-200"
                  >
                    Add
                  </Button>
                </div>
                {createGroupForm.memberEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {createGroupForm.memberEmails.map((m) => (
                      <Badge
                        key={m}
                        variant="outline"
                        className="text-[10px] font-mono px-2 py-0.5 bg-slate-50 border-slate-200 text-slate-700 flex items-center gap-1"
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
                          <X className="w-3 h-3 text-slate-400 hover:text-slate-700" />
                        </button>
                      </Badge>
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
                className="h-9 px-4 text-xs font-semibold rounded-lg"
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
                className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs"
              >
                {isCreatingGroup && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Create Group
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 8. UPDATE GROUP NAME / OU DIALOG */}
        <Dialog
          open={Boolean(editingGroup)}
          onOpenChange={(open) => {
            if (!open) setEditingGroup(null)
          }}
        >
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-bold text-lg text-slate-900">
                Update Group Name
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update group display name and organizational unit for{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {editingGroup?.groupEmail}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Group Name</Label>
                <Input
                  value={editGroupForm.name}
                  onChange={(e) =>
                    setEditGroupForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="h-9 text-xs border-slate-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Organizational Unit</Label>
                <Select
                  value={editGroupForm.orgUnitPath}
                  onValueChange={(val) =>
                    setEditGroupForm((prev) => ({ ...prev, orgUnitPath: val }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs border-slate-200 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {allOuOptions.map((ouPath) => (
                      <SelectItem key={ouPath} value={ouPath} className="text-xs">
                        {ouPath === "/" ? "/ (Root)" : ouPath}
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
                className="h-9 px-4 text-xs font-semibold rounded-lg"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateGroupDetails}
                disabled={isUpdatingGroup || !editGroupForm.name.trim()}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs"
              >
                {isUpdatingGroup && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 9. MANAGE GROUP MEMBERS DIALOG */}
        <Dialog
          open={Boolean(membersTargetGroup)}
          onOpenChange={(open) => {
            if (!open) setMembersTargetGroup(null)
          }}
        >
          <DialogContent className="max-w-lg bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-bold text-lg text-slate-900">
                Manage Group Members
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Add or remove recipient email addresses for{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {membersTargetGroup?.groupEmail}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-700">Add Member Address</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={groupMemberInput}
                    onChange={(e) => setGroupMemberInput(e.target.value)}
                    placeholder={`user@${selectedOrg.domain}`}
                    className="h-9 text-xs font-mono border-slate-200"
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
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-semibold h-9 px-4 rounded-lg text-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Member
                  </Button>
                </div>

                {activeUsers.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-400 mr-1">Quick add:</span>
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
                          className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-primary/10 hover:text-primary text-slate-600 transition-colors"
                        >
                          + {u.primaryEmail}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {membersTargetGroup?.memberEmails.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No members in this group yet.
                  </div>
                ) : (
                  membersTargetGroup?.memberEmails.map((member) => (
                    <div
                      key={member}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/60"
                    >
                      <span className="text-xs font-mono font-semibold text-slate-800">
                        {member}
                      </span>
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
                        <Trash2 className="w-3.5 h-3.5" />
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
                className="h-8 px-4 text-xs font-semibold rounded-lg"
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 10. DELETE GROUP CONFIRMATION */}
        <AlertDialog
          open={Boolean(deletingGroup)}
          onOpenChange={(open) => {
            if (!open) setDeletingGroup(null)
          }}
        >
          <AlertDialogContent className="bg-white border border-slate-200 rounded-xl max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline font-bold text-slate-900">
                Delete Group?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                This will permanently remove the group{" "}
                <span className="font-mono font-semibold text-slate-800">
                  {deletingGroup?.groupEmail}
                </span>
                . Individual member accounts will not be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs font-semibold rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleConfirmDeleteGroup()
                }}
                disabled={isDeletingGroup}
                className="h-9 text-xs font-semibold bg-destructive text-white hover:bg-destructive/90 rounded-lg"
              >
                {isDeletingGroup && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Delete Group
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 11. DEACTIVATE EMAIL SERVICE CONFIRMATION */}
        <AlertDialog
          open={isDeactivateConfirmOpen}
          onOpenChange={setIsDeactivateConfirmOpen}
        >
          <AlertDialogContent className="bg-white border border-slate-200 rounded-xl max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline font-bold text-slate-900">
                Deactivate Email Service?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to deactivate Email Service for{" "}
                <span className="font-mono font-semibold text-slate-800">
                  {selectedOrg.domain}
                </span>
                ? You can re-activate it at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-xs font-semibold rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDeactivateService()
                }}
                disabled={isDeactivating}
                className="h-9 text-xs font-semibold bg-destructive text-white hover:bg-destructive/90 rounded-lg"
              >
                {isDeactivating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Deactivate Email Service
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardShell>
  )
}
