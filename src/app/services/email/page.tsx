"use client"

import Link from "next/link"

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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Mail,
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
  Filter,
  Upload,
  Download,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldOff,
  ArrowUpRight,
  ChevronDown,
  Inbox,
  Settings2,
  ShieldCheck,
} from "lucide-react"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import { useUser } from "@/firebase"
import { useActiveOrg } from "@/hooks/use-active-org"
import { emailSlugToTab, emailTabToSlug } from "@/lib/org-routes"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyOrgState } from "@/components/services/empty-org-state"
import { EmailDomainRecords } from "@/components/services/email-domain-records"

const EmailGovernancePanel = dynamic(
  () => import("@/components/services/email-governance-panel").then((m) => m.EmailGovernancePanel),
  { ssr: false }
)
const StepUpMfaDialog = dynamic(
  () => import("@/components/security/step-up-mfa-dialog").then((m) => m.StepUpMfaDialog),
  { ssr: false }
)
import {
  getOrganizationSecurityPolicy,
  setOrganizationEnforceMfa,
} from "@/app/actions/email-governance"
import { TablePagination } from "@/components/ui/table-pagination"
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
  resetMailUserMfa,
  manageMailUserAlias,
  toggleMailUserSuspend,
  deleteMailUserAccount,
  recoverMailUserAccount,
  listMailGroups,
  createMailGroup,
  updateMailGroup,
  deleteMailGroup,
  bulkCreateMailUsers,
  type MailRequiredDnsRecord,
  type MailOrgUnit,
  type MailUserRecord,
  type MailGroupRecord,
  type BulkImportUserRow,
} from "@/app/actions/email-service"

function getDaysRemaining(recoverableUntil: string | null): number {
  if (!recoverableUntil) return 14
  const diff = new Date(recoverableUntil).getTime() - Date.now()
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

const EMAIL_SECTIONS = [
  { value: "users", label: "Email accounts", icon: Mail },
  { value: "groups", label: "Mailing groups", icon: Users },
  { value: "shared", label: "Shared inboxes", icon: Inbox },
  { value: "suspended", label: "Paused & deleted", icon: Ban },
  { value: "governance", label: "Security & compliance", icon: ShieldCheck },
  { value: "settings", label: "Settings", icon: Settings2 },
] as const

function SendingLimit({ label, sent, limit }: { label: string; sent: number; limit: number }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium text-zinc-900">{label}</p>
      <p className="text-sm tabular-nums text-zinc-600">
        {sent.toLocaleString()} of {limit.toLocaleString()} sent
      </p>
      {limit > 0 && <progress className="block h-2 w-full accent-zinc-800" aria-label={label} max={limit} value={Math.min(sent, limit)} />}
      <p className="text-sm text-zinc-600">{Math.max(0, limit - sent).toLocaleString()} sends remaining</p>
    </div>
  )
}

export default function EmailServiceAdminPage() {
  const { user, loading: authLoading } = useUser()
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()

  // Core service state
  const [isLoadingQuota, setIsLoadingQuota] = useState(true)
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(true)
  const [hasLoadedDirectory, setHasLoadedDirectory] = useState(false)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null)
  const [credentialStepUp, setCredentialStepUp] = useState<{
    type: "password" | "mfa"
    orgId: string
  } | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const loadRequestSeqRef = useRef(0)
  const [isActivating, setIsActivating] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [deactivationChallengeOrg, setDeactivationChallengeOrg] = useState<string | null>(null)
  const lifecycleOrgRef = useRef(selectedOrgId)
  lifecycleOrgRef.current = selectedOrgId
  const [setupError, setSetupError] = useState<string | null>(null)
  const [lifecycleAccess, setLifecycleAccess] = useState<{
    orgId: string
    canManage: boolean
    canCreateAccounts: boolean
    canDeactivate: boolean
    canInvite: boolean
  } | null>(null)
  const canCreateAccounts = lifecycleAccess?.orgId === selectedOrgId && lifecycleAccess?.canCreateAccounts
  const canManageMailService = lifecycleAccess?.orgId === selectedOrgId && lifecycleAccess?.canManage
  const canDeactivateMailService = lifecycleAccess?.orgId === selectedOrgId && lifecycleAccess?.canDeactivate
  useEffect(() => {
    setSetupError(null)
    setDirectoryError(null)
    setGroupLoadError(null)
    setPendingSecurityPolicy(null)
    setDeactivationChallengeOrg(null)
    setCredentialStepUp(null)
    setRequiredDnsRecords([])
  }, [selectedOrgId])
  const [isSyncingDns, setIsSyncingDns] = useState(false)

  const [serviceState, setServiceState] = useState<{ orgId: string; active: boolean } | null>(null)
  const isEffectiveServiceActive = serviceState?.orgId === selectedOrgId
    ? serviceState.active
    : Boolean(selectedOrg?.mailServiceActive)

  const [dnsServiceActive, setDnsServiceActive] = useState<boolean>(() => Boolean(selectedOrg?.cloudflareZoneId))
  const [monthlyOutboundLimit, setMonthlyOutboundLimit] = useState<number>(() => selectedOrg?.mailMonthlyLimit ?? 1000)
  const [dailyOutboundLimit, setDailyOutboundLimit] = useState<number>(() => selectedOrg?.mailDailyLimit ?? 100)
  const [monthlySentCount, setMonthlySentCount] = useState<number>(() => selectedOrg?.mailMonthlySent ?? 0)
  const [dailySentCount, setDailySentCount] = useState<number>(() => selectedOrg?.mailDailySent ?? 0)
  const [catchAllUserId, setCatchAllUserId] = useState<string | null>(() => selectedOrg?.mailCatchAllUserId ?? null)
  const [catchAllEmail, setCatchAllEmail] = useState<string | null>(() => selectedOrg?.mailCatchAllEmail ?? null)
  const [requiredDnsRecords, setRequiredDnsRecords] = useState<MailRequiredDnsRecord[]>([])

  useEffect(() => {
    if (selectedOrg) {
      setDnsServiceActive(Boolean(selectedOrg.cloudflareZoneId))
      setMonthlyOutboundLimit(selectedOrg.mailMonthlyLimit ?? 1000)
      setDailyOutboundLimit(selectedOrg.mailDailyLimit ?? 100)
      setMonthlySentCount(selectedOrg.mailMonthlySent ?? 0)
      setDailySentCount(selectedOrg.mailDailySent ?? 0)
      setCatchAllUserId(selectedOrg.mailCatchAllUserId ?? null)
      setCatchAllEmail(selectedOrg.mailCatchAllEmail ?? null)
    }
  }, [selectedOrg])

  const coreDnsRecords = useMemo(
    () => requiredDnsRecords.filter((r) => r.required !== false && r.id !== "txt-spf" && r.id !== "txt-dmarc"),
    [requiredDnsRecords]
  )
  const verifiedCoreDnsCount = useMemo(
    () => coreDnsRecords.filter((r) => r.verified).length,
    [coreDnsRecords]
  )
  const areCoreRecordsVerified =
    coreDnsRecords.length > 0 && verifiedCoreDnsCount === coreDnsRecords.length

  // Directory collections
  const [orgUnits, setOrgUnits] = useState<MailOrgUnit[]>([])
  const [users, setUsers] = useState<MailUserRecord[]>([])
  const [groups, setGroups] = useState<MailGroupRecord[]>([])

  const emailPathname = usePathname()
  const emailSearchParams = useSearchParams()
  const legacySection = emailPathname.match(/^\/orgs\/[^/]+\/email\/([^/]+)/)?.[1]
  const requestedTab = emailSlugToTab(legacySection || emailSearchParams.get("tab"))
  const activeTab = requestedTab === "routing" || requestedTab === "domains" ? "settings" : requestedTab || "users"

  useEffect(() => {
    const sectionTitle = EMAIL_SECTIONS.find((section) => section.value === activeTab)?.label
    document.title = isEffectiveServiceActive && sectionTitle
      ? `${sectionTitle} · Email Service | Revlet Platform`
      : "Email Service | Revlet Platform"
  }, [activeTab, isEffectiveServiceActive])

  const [securityPolicy, setSecurityPolicy] = useState<{ orgId: string; enforceMfa: boolean } | null>(null)
  const [isUpdatingEnforceMfa, setIsUpdatingEnforceMfa] = useState(false)
  const [pendingSecurityPolicy, setPendingSecurityPolicy] = useState<{ orgId: string; enforceMfa: boolean } | null>(null)

  useEffect(() => {
    if (!user || !selectedOrgId) return
    let cancelled = false
    user.getIdToken()
      .then((token) => getOrganizationSecurityPolicy(token, selectedOrgId))
      .then((res) => {
        if (!cancelled && res.success && typeof res.enforceMfa === "boolean") {
          setSecurityPolicy({ orgId: selectedOrgId, enforceMfa: res.enforceMfa })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user, selectedOrgId])

  const handleToggleEnforceMfa = async (nextVal: boolean, stepUpToken?: string) => {
    if (!user || !selectedOrgId) return
    setIsUpdatingEnforceMfa(true)
    try {
      const idToken = await user.getIdToken()
      const res = await setOrganizationEnforceMfa(idToken, selectedOrgId, nextVal, stepUpToken)
      if (lifecycleOrgRef.current !== selectedOrgId) return
      if (!res.success && typeof res.error === "string" && res.error.includes("MFA_STEP_UP_REQUIRED")) {
        setPendingSecurityPolicy({ orgId: selectedOrgId, enforceMfa: nextVal })
        return
      }
      if (!res.success) {
        toast({ variant: "destructive", title: "Policy update failed", description: res.error })
        return
      }
      setSecurityPolicy({ orgId: selectedOrgId, enforceMfa: Boolean(res.enforceMfa) })
      toast({
        title: res.enforceMfa ? "MFA Enforced" : "MFA Enforcement Disabled",
        description: res.enforceMfa
          ? "All organization users must verify or enroll MFA on sign-in."
          : "MFA is now optional for users who have not enrolled.",
      })
    } finally {
      setIsUpdatingEnforceMfa(false)
    }
  }

  const setActiveTab = (nextTab: string) => {
    if (nextTab === activeTab) return
    const url = new URL(window.location.href)
    url.pathname = "/services/email"
    url.searchParams.set("tab", emailTabToSlug(nextTab))
    window.history.pushState(null, "", url.pathname + url.search + url.hash)
  }
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
  const [showCreatePassword, setShowCreatePassword] = useState(false)
  const [createdMailboxHandoff, setCreatedMailboxHandoff] = useState<{
    displayName: string
    email: string
    password: string
  } | null>(null)
  const [showHandoffPassword, setShowHandoffPassword] = useState(true)

  const generateStrongPassword = () => {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    const lower = "abcdefghijkmnopqrstuvwxyz"
    const digits = "23456789"
    const symbols = "!@#$%&*"
    const all = upper + lower + digits + symbols
    const randomIndex = (max: number) => {
      if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
        const limit = Math.floor(0x100000000 / max) * max
        const arr = new Uint32Array(1)
        let value = limit
        while (value >= limit) {
          window.crypto.getRandomValues(arr)
          value = arr[0]
        }
        return value % max
      }
      return Math.floor(Math.random() * max)
    }
    const pick = (pool: string) => pool[randomIndex(pool.length)]
    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
    while (chars.length < 14) chars.push(pick(all))
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1)
      ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    setCreateUserForm((prev) => ({ ...prev, password: chars.join("") }))
    setShowCreatePassword(true)
  }

  const handleCopyLoginDetails = (handoff: {
    displayName: string
    email: string
    password: string
  }) => {
    const text = [
      `RevletMail Login Details for ${handoff.displayName}`,
      `Webmail: https://mail.revlet.me/login`,
      `Email: ${handoff.email}`,
      `Temporary Password: ${handoff.password}`,
    ].join("\n")
    copyToClipboard(text, "handoff-login-details")
  }
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
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [copiedResetPassword, setCopiedResetPassword] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [mfaResetTargetUser, setMfaResetTargetUser] = useState<MailUserRecord | null>(null)
  const [isResettingMfa, setIsResettingMfa] = useState(false)

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
  const [showGroupMemberSuggestions, setShowGroupMemberSuggestions] = useState(false)
  const [isUpdatingGroupMembers, setIsUpdatingGroupMembers] = useState(false)

  const [deletingGroup, setDeletingGroup] = useState<MailGroupRecord | null>(null)
  const [isDeletingGroup, setIsDeletingGroup] = useState(false)

  const [isUpdatingCatchAll, setIsUpdatingCatchAll] = useState(false)
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false)
  const [mailPurgeScheduledAt, setMailPurgeScheduledAt] = useState<string | null>(null)

  // Bulk Import Users state
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [bulkCsvText, setBulkCsvText] = useState("")
  const [bulkImportErrors, setBulkImportErrors] = useState<string[]>([])
  const [isBulkImporting, setIsBulkImporting] = useState(false)

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
      isDeactivateConfirmOpen ||
      isBulkImportOpen
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
    isBulkImportOpen,
  ])

  // Reset directory and DNS state immediately when switching organizations so stale or empty states never flash
  useEffect(() => {
    if (!selectedOrgId) return
    loadRequestSeqRef.current += 1
    setUsers([])
    setOrgUnits([])
    setGroups([])
    setRequiredDnsRecords([])
    setMailPurgeScheduledAt(null)
    setSelectedUserOu("ALL")
    setSelectedGroupOu("ALL")
    setHasLoadedDirectory(false)
    setIsLoadingDirectory(true)
    setIsLoadingQuota(true)
  }, [selectedOrgId])

  const loadAllMailData = useCallback(
    async (silent = false) => {
      if (authLoading || isLoadingOrgs) {
        return
      }
      if (!user || !selectedOrgId) {
        loadRequestSeqRef.current += 1
        setHasLoadedDirectory(false)
        setIsLoadingQuota(false)
        setIsLoadingDirectory(false)
        return
      }
      const requestSeq = ++loadRequestSeqRef.current
      if (!silent) {
        setIsLoadingDirectory(true)
      } else {
        setIsRefreshing(true)
      }

      try {
        const idToken = await user.getIdToken()
        if (loadRequestSeqRef.current !== requestSeq) {
          return
        }

        // Fetch directory collections (Users, OrgUnits, Groups) immediately in parallel
        setDirectoryError(null)
        setGroupLoadError(null)
        const dirPromise = Promise.all([
          listMailOrgUnits(idToken, selectedOrgId),
          listMailUsers(idToken, selectedOrgId),
          listMailGroups(idToken, selectedOrgId),
        ])
          .then(([ousRes, usersRes, groupsRes]) => {
            if (loadRequestSeqRef.current !== requestSeq) {
              return
            }
            const failures: string[] = []
            if (ousRes.success && ousRes.data) {
              setOrgUnits(ousRes.data)
            } else if (!ousRes.success) {
              failures.push(ousRes.error || "Could not load organizational units.")
            }
            if (usersRes.success && usersRes.data) {
              setUsers(usersRes.data)
            } else if (!usersRes.success) {
              failures.push(usersRes.error || "Could not load email accounts.")
            }
            if (groupsRes.success && groupsRes.data) {
              setGroups(groupsRes.data)
            } else if (!groupsRes.success) {
              setGroupLoadError(groupsRes.error || "Could not load mailing groups.")
            }
            setDirectoryError(failures.length > 0 ? failures[0] : null)
            setHasLoadedDirectory(true)
          })
          .catch((err: any) => {
            if (loadRequestSeqRef.current !== requestSeq) {
              return
            }
            console.error("Failed to load mail directory:", err)
            setDirectoryError(err?.message || "Could not load email directory.")
            setGroupLoadError("Could not load mailing groups.")
            setHasLoadedDirectory(true)
          })
          .finally(() => {
            if (loadRequestSeqRef.current === requestSeq) {
              setIsLoadingDirectory(false)
            }
          })

        // Fetch DNS status and quota state in parallel
        const statePromise = getMailServiceState(idToken, selectedOrgId)
          .then((stateRes) => {
            if (loadRequestSeqRef.current !== requestSeq) {
              return
            }
            if (stateRes.success && stateRes.data) {
              setLifecycleAccess({
                orgId: selectedOrgId,
                canManage: stateRes.data.canManageMailService,
                canCreateAccounts: stateRes.data.canCreateMailAccounts,
                canDeactivate: stateRes.data.canDeactivateMailService,
                canInvite: stateRes.data.canInviteTeamMembers,
              })
              setServiceState({ orgId: selectedOrgId, active: stateRes.data.mailServiceActive })
              setDnsServiceActive(stateRes.data.dnsServiceActive)
              setMonthlyOutboundLimit(stateRes.data.monthlyOutboundLimit)
              setDailyOutboundLimit(stateRes.data.dailyOutboundLimit)
              setMonthlySentCount(stateRes.data.monthlySentCount)
              setDailySentCount(stateRes.data.dailySentCount)
              setCatchAllUserId(stateRes.data.catchAllUserId)
              setCatchAllEmail(stateRes.data.catchAllEmail)
              setMailPurgeScheduledAt(stateRes.data.mailPurgeScheduledAt || null)
              setRequiredDnsRecords(stateRes.data.requiredDnsRecords)
            } else {
              setLifecycleAccess(null)
              setSetupError(stateRes.error || "Could not load Email Service setup.")
            }
          })
          .catch((err) => {
            if (loadRequestSeqRef.current !== requestSeq) {
              return
            }
            setLifecycleAccess(null)
            setSetupError("Could not load Email Service settings. Try again.")
            console.error("Failed to load mail state:", err)
          })
          .finally(() => {
            if (loadRequestSeqRef.current === requestSeq) {
              setIsLoadingQuota(false)
            }
          })

        await Promise.all([dirPromise, statePromise])
      } catch (err: any) {
        if (loadRequestSeqRef.current === requestSeq) {
          setSetupError("Could not load Email Service settings. Try again.")
          setDirectoryError("Could not load your email directory. Try again.")
          setGroupLoadError("Could not load mailing groups. Try again.")
          setHasLoadedDirectory(true)
          setIsLoadingDirectory(false)
          setIsLoadingQuota(false)
          toast({
            variant: "destructive",
            title: "Failed to load email service",
            description: err.message || "Could not retrieve organization mail configuration.",
          })
        }
      } finally {
        if (loadRequestSeqRef.current === requestSeq) {
          setIsRefreshing(false)
        }
      }
    },
    [user, selectedOrgId, authLoading, isLoadingOrgs]
  )

  const parsedBulkRows = useMemo<BulkImportUserRow[]>(() => {
    const parseCsvLine = (line: string): string[] => {
      const cells: string[] = []
      let current = ""
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuotes) {
          if (ch === '"') {
            if (line[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = false
            }
          } else {
            current += ch
          }
        } else if (ch === '"') {
          inQuotes = true
        } else if (ch === ",") {
          cells.push(current.trim())
          current = ""
        } else {
          current += ch
        }
      }
      cells.push(current.trim())
      return cells
    }

    const lines = bulkCsvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return []

    const firstCols = parseCsvLine(lines[0]).map((c) => c.toLowerCase())
    const startIdx = firstCols.some((c) => c.includes("emailprefix")) ? 1 : 0
    const rows: BulkImportUserRow[] = []
    for (let i = startIdx; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i])
      if (cols.length < 4) continue
      rows.push({
        firstName: cols[0] || "",
        lastName: cols[1] || "",
        emailPrefix: (cols[2] || "").replace(/@.*$/, "").toLowerCase(),
        password: cols[3] || "",
        orgUnitPath: cols[4] || "/",
      })
    }
    return rows
  }, [bulkCsvText])

  const handleDownloadCsvTemplate = () => {
    const csvContent = [
      "firstName,lastName,emailPrefix,password,orgUnitPath",
      "Alex,Morgan,alex,TempPass123!,/",
      "Jordan,Lee,jordan,TempPass456!,/",
    ].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "revlet-email-users-template.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleExportUsersCsv = () => {
    if (!selectedOrg) return
    const header = "firstName,lastName,primaryEmail,orgUnitPath,aliases,status"
    const escapeCsv = (value: string) => {
      const text = String(value || "")
      const safeText = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text
      return `"${safeText.replace(/"/g, '""')}"`
    }
    const lines = users.map((u) =>
      [
        escapeCsv(u.firstName),
        escapeCsv(u.lastName),
        escapeCsv(u.primaryEmail),
        escapeCsv(u.orgUnitPath),
        escapeCsv((u.aliases || []).join(";")),
        escapeCsv(u.status),
      ].join(",")
    )
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${selectedOrg.domain || "organization"}-email-users.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast({
      title: "Users exported",
      description: `Exported ${users.length} email account${users.length === 1 ? "" : "s"} to CSV.`,
    })
  }

  const handleBulkCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setBulkCsvText(String(reader.result || ""))
      setBulkImportErrors([])
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !selectedOrgId) return
    if (parsedBulkRows.length === 0) {
      toast({
        variant: "destructive",
        title: "No valid rows found",
        description: "Upload or paste CSV rows using the template format with a password column.",
      })
      return
    }
    setIsBulkImporting(true)
    setBulkImportErrors([])
    try {
      const idToken = await user.getIdToken()
      const res = await bulkCreateMailUsers(idToken, selectedOrgId, parsedBulkRows)
      if (!res.success || !res.data) {
        throw new Error(res.error || "Bulk import failed.")
      }
      if (res.data.createdUsers.length > 0) {
        setUsers((prev) =>
          [...prev, ...res.data!.createdUsers].sort((a, b) =>
            a.displayName.localeCompare(b.displayName)
          )
        )
      }
      if (res.data.errors.length > 0) {
        setBulkImportErrors(res.data.errors)
      }
      toast({
        title: "Bulk import completed",
        description: `Created ${res.data.createdCount} account(s)${
          res.data.skippedCount > 0 ? `, skipped ${res.data.skippedCount}` : ""
        }.`,
      })
      if (res.data.errors.length === 0) {
        setIsBulkImportOpen(false)
        setBulkCsvText("")
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err.message || "Could not import email accounts.",
      })
    } finally {
      setIsBulkImporting(false)
    }
  }

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
    if (!user || !selectedOrgId || !canManageMailService || isActivating || isSyncingDns) return
    setIsActivating(true)
    setSetupError(null)
    try {
      const res = await activateMailService(await user.getIdToken(), selectedOrgId)
      if (lifecycleOrgRef.current !== selectedOrgId) return
      if (!res.success) throw new Error(res.error)

      setServiceState({ orgId: selectedOrgId, active: true })
      window.dispatchEvent(new Event("revlet-orgs-refresh"))
      toast({
        title: "Email Service activated",
        description: `Mail is active for ${selectedOrg?.domain}.`,
      })
      await loadAllMailData(true)
    } catch (err: any) {
      if (lifecycleOrgRef.current === selectedOrgId) {
        setSetupError(err.message || "Could not activate Email Service.")
      }
    } finally {
      setIsActivating(false)
    }
  }

  const handleDeactivateService = async (stepUpToken?: string) => {
    if (!user || !selectedOrgId || !canDeactivateMailService) return
    setIsDeactivating(true)
    try {
      const idToken = await user.getIdToken()
      const res = await deactivateMailService(idToken, selectedOrgId, stepUpToken)
      if (lifecycleOrgRef.current !== selectedOrgId) return
      if (!res.success && res.error?.includes("MFA_STEP_UP_REQUIRED")) {
        setIsDeactivateConfirmOpen(false)
        setDeactivationChallengeOrg(selectedOrgId)
        return
      }
      if (!res.success) throw new Error(res.error)

      setServiceState({ orgId: selectedOrgId, active: false })
      setIsDeactivateConfirmOpen(false)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("revlet-orgs-refresh"))
      }
      toast({
        title: "Email Service deactivated",
        description: "Email Service has been paused for this organization.",
      })
      await loadAllMailData(true)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Deactivation failed",
        description: err.message || "Could not deactivate Email Service.",
      })
    } finally {
      setIsDeactivating(false)
    }
  }

  const handleSyncDnsRecords = async () => {
    if (!user || !selectedOrgId || !canManageMailService || isSyncingDns || isActivating) return
    setIsSyncingDns(true)
    setSetupError(null)
    try {
      const idToken = await user.getIdToken()
      const res = await syncMailDnsRecords(idToken, selectedOrgId)
      if (lifecycleOrgRef.current !== selectedOrgId) return
      if (!res.success) throw new Error(res.error)

      if (!dnsServiceActive) {
        toast({
          title: "DNS verification complete",
          description: `${res.data?.verifiedCount ?? 0} of ${res.data?.totalCount ?? requiredDnsRecords.length} required DNS records verified on ${selectedOrg?.domain}.`,
        })
      } else {
        toast({
          title: "DNS records checked at provider",
          description:
            res.data?.addedCount && res.data.addedCount > 0
              ? `Added ${res.data.addedCount} required record(s). Public DNS may take time to reflect the changes.`
              : `All required DNS records are present on ${selectedOrg?.domain}.`,
        })
      }
      await loadAllMailData(true)
    } catch (err: any) {
      if (lifecycleOrgRef.current !== selectedOrgId) return
      setSetupError(err.message || "Could not check DNS records.")
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
      const submittedPassword = createUserForm.password
      const idToken = await user.getIdToken()
      const res = await createMailUser(idToken, selectedOrgId, createUserForm)
      if (!res.success || !res.data) throw new Error(res.error)

      setUsers((prev) =>
        [...prev, res.data!].sort((a, b) => a.displayName.localeCompare(b.displayName))
      )
      setIsCreateUserOpen(false)
      setShowCreatePassword(false)
      setCreateUserForm({
        firstName: "",
        lastName: "",
        emailPrefix: "",
        password: "",
        orgUnitPath: "/",
      })
      setShowHandoffPassword(true)
      setCreatedMailboxHandoff({
        displayName: res.data.displayName,
        email: res.data.primaryEmail,
        password: submittedPassword,
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

  const handleResetUserPassword = async (stepUpToken?: string) => {
    if (!user || !selectedOrgId || !passwordTargetUser) return
    setIsResettingPassword(true)
    try {
      const idToken = await user.getIdToken()
      const res = await resetMailUserPassword(
        idToken,
        selectedOrgId,
        passwordTargetUser.id,
        newPasswordValue,
        stepUpToken
      )
      if (!res.success) {
        if (res.error?.includes("MFA_STEP_UP_REQUIRED")) {
          setCredentialStepUp({ type: "password", orgId: selectedOrgId })
          return
        }
        throw new Error(res.error)
      }

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

  const handleResetUserMfa = async (stepUpToken?: string) => {
    if (!user || !selectedOrgId || !mfaResetTargetUser) return
    setIsResettingMfa(true)
    try {
      const idToken = await user.getIdToken()
      const res = await resetMailUserMfa(
        idToken,
        selectedOrgId,
        mfaResetTargetUser.id,
        stepUpToken
      )
      if (!res.success) {
        if (res.error?.includes("MFA_STEP_UP_REQUIRED")) {
          setCredentialStepUp({ type: "mfa", orgId: selectedOrgId })
          return
        }
        throw new Error(res.error)
      }

      toast({
        title: "MFA settings removed",
        description: `All 2-Step Verification factors cleared for ${mfaResetTargetUser.primaryEmail}.`,
      })
      setMfaResetTargetUser(null)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Failed to remove MFA settings",
        description: err.message || "Could not remove MFA settings.",
      })
    } finally {
      setIsResettingMfa(false)
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

  const openCreateAccount = () => {
    setCreateUserForm({
      firstName: "",
      lastName: "",
      emailPrefix: "",
      password: "",
      orgUnitPath: selectedUserOu === "ALL" ? "/" : selectedUserOu,
    })
    setShowCreatePassword(false)
    setIsCreateUserOpen(true)
  }

  const openCreateGroup = () => {
    setCreateGroupForm({
      name: "",
      emailPrefix: "",
      orgUnitPath: selectedGroupOu === "ALL" ? "/" : selectedGroupOu,
      memberEmails: [],
    })
    setNewGroupMemberInput("")
    setIsCreateGroupOpen(true)
  }

  const [usersPage, setUsersPage] = useState(1)
  const [usersPageSize, setUsersPageSize] = useState(25)
  const [groupsPage, setGroupsPage] = useState(1)
  const [groupsPageSize, setGroupsPageSize] = useState(25)
  const [suspendedPage, setSuspendedPage] = useState(1)
  const [suspendedPageSize, setSuspendedPageSize] = useState(25)
  const [deletedPage, setDeletedPage] = useState(1)
  const [deletedPageSize, setDeletedPageSize] = useState(25)

  useEffect(() => {
    setUsersPage(1)
  }, [userSearchQuery, selectedUserOu, selectedOrg?.id])

  useEffect(() => {
    setGroupsPage(1)
  }, [groupSearchQuery, selectedGroupOu, selectedOrg?.id])

  useEffect(() => {
    setSuspendedPage(1)
    setDeletedPage(1)
  }, [suspendedSearchQuery, selectedOrg?.id])

  const paginatedActiveUsers = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredActiveUsers.length / usersPageSize))
    const safePage = Math.min(usersPage, totalPages)
    return filteredActiveUsers.slice((safePage - 1) * usersPageSize, safePage * usersPageSize)
  }, [filteredActiveUsers, usersPage, usersPageSize])

  const paginatedGroups = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredGroups.length / groupsPageSize))
    const safePage = Math.min(groupsPage, totalPages)
    return filteredGroups.slice((safePage - 1) * groupsPageSize, safePage * groupsPageSize)
  }, [filteredGroups, groupsPage, groupsPageSize])

  const paginatedSuspendedUsers = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredSuspendedUsers.length / suspendedPageSize))
    const safePage = Math.min(suspendedPage, totalPages)
    return filteredSuspendedUsers.slice((safePage - 1) * suspendedPageSize, safePage * suspendedPageSize)
  }, [filteredSuspendedUsers, suspendedPage, suspendedPageSize])

  const paginatedDeletedUsers = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredDeletedUsers.length / deletedPageSize))
    const safePage = Math.min(deletedPage, totalPages)
    return filteredDeletedUsers.slice((safePage - 1) * deletedPageSize, safePage * deletedPageSize)
  }, [filteredDeletedUsers, deletedPage, deletedPageSize])

  if (authLoading || (isLoadingOrgs && orgs.length === 0)) {
    return (
      <DashboardShell>
        <div className="space-y-5" aria-busy="true">
          <PageHeader title="Email Service" description={<span role="status">Loading your workspace…</span>} />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-52 w-full rounded-xl" />
        </div>
      </DashboardShell>
    )
  }

  if (orgs.length === 0 || !selectedOrg) {
    return (
      <DashboardShell>
        <EmptyOrgState
          icon={<Mail className="w-6 h-6" />}
          title="No Organization Selected"
          description="Register or select an organization on Account Home to configure domain email accounts and routing."
        />
      </DashboardShell>
    )
  }

  const missingDnsRecords = coreDnsRecords.filter((r) => !r.verified)
  const purgeDateLabel = mailPurgeScheduledAt
    ? new Date(mailPurgeScheduledAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null

  const setupBusy = isLoadingQuota || isSyncingDns || isActivating || isRefreshing
  const hasDomainRecords = coreDnsRecords.length > 0
  const domainStatus = isLoadingQuota
    ? "Checking domain…"
    : !lifecycleAccess || lifecycleAccess.orgId !== selectedOrgId
      ? "Domain status unavailable"
      : areCoreRecordsVerified
        ? "Domain verified"
        : hasDomainRecords
          ? "Domain needs attention"
          : "Domain setup needed"

  if (!isEffectiveServiceActive) {
    const setupTitle = areCoreRecordsVerified
      ? "Turn on email"
      : dnsServiceActive
        ? "Connect your domain"
        : hasDomainRecords
          ? "Add records at your domain provider"
          : "Prepare your domain records"

    return (
      <DashboardShell>
        <div className="space-y-5">
          <PageHeader title="Email Service" description={<span className="break-all text-sm">{selectedOrg.domain}</span>} />

          {purgeDateLabel && (
            <div role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-semibold">Email is paused. Deletion is scheduled for {purgeDateLabel}.</p>
                <p>Turn email back on before that date to keep your mailboxes and messages.</p>
              </div>
            </div>
          )}

          <section aria-labelledby="mail-setup-heading" aria-busy={setupBusy} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="bg-zinc-950 p-5 text-white sm:p-8">
              <h2 id="mail-setup-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">Set up email for your domain</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-300">
                Connect <span className="break-all font-medium text-white">{selectedOrg.domain}</span> to RevletMail so your team can send and receive email at their work addresses.
              </p>
            </div>
            <ol aria-label="Setup progress" className="grid gap-px border-b border-zinc-200 bg-zinc-200 text-sm sm:grid-cols-3">
              {["Connect your domain", "Turn on email", "Create email accounts"].map((step, index) => (
                <li key={step} aria-current={index === (areCoreRecordsVerified ? 1 : 0) ? "step" : undefined} className="flex items-center gap-2.5 bg-zinc-50 px-5 py-3.5 text-zinc-600 aria-[current=step]:bg-white aria-[current=step]:font-semibold aria-[current=step]:text-zinc-950">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-xs tabular-nums">
                    {index === 0 && areCoreRecordsVerified ? <Check className="size-3.5" aria-label="Complete" /> : index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="space-y-5 p-5 sm:p-8">
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-zinc-950">{setupTitle}</h3>
                <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
                  {areCoreRecordsVerified
                    ? "Your domain is verified. Turn on email to start creating addresses for your team."
                    : dnsServiceActive
                      ? "Revlet can add the settings needed to receive and send email. If you already use another email provider, review the move in DNS Management first."
                      : hasDomainRecords
                        ? "Open the DNS settings at the company that manages your domain. Add each record shown below, then return here to check them. If someone else manages your domain, share these records with them."
                        : "Revlet will create the settings you need to add at your domain provider. Keep this page open while you make those changes."}
                </p>
              </div>
              {hasDomainRecords && !areCoreRecordsVerified && (
                <p role="status" className="text-sm text-zinc-600">
                  {verifiedCoreDnsCount} of {coreDnsRecords.length} required records verified. Changes can take time to appear.
                </p>
              )}
              {setupError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{setupError}</p>}
              {!isLoadingQuota && lifecycleAccess?.orgId === selectedOrgId && !canManageMailService && (
                <p className="text-sm text-zinc-600">Ask an email administrator for this workspace to finish setup.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={areCoreRecordsVerified ? handleActivateService : handleSyncDnsRecords} disabled={!canManageMailService || setupBusy} className="min-h-11 w-full bg-zinc-950 text-white hover:bg-zinc-800 sm:w-auto">
                  {setupBusy && <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  {isActivating ? "Turning on email…" : isSyncingDns ? "Checking domain…" : isLoadingQuota
                    ? "Loading setup…" : areCoreRecordsVerified ? "Turn on email" : dnsServiceActive
                      ? "Add required records" : hasDomainRecords ? "Check my records" : "Prepare records"}
                </Button>
                {dnsServiceActive && !areCoreRecordsVerified && (
                  <Button variant="outline" asChild className="min-h-11 w-full sm:w-auto">
                    <Link href="/services/dns">Open DNS Management</Link>
                  </Button>
                )}
                {!isLoadingQuota && !lifecycleAccess && (
                  <Button variant="outline" className="min-h-11" onClick={() => loadAllMailData(true)} disabled={setupBusy}>Try again</Button>
                )}
              </div>
              <EmailDomainRecords key={selectedOrgId} records={coreDnsRecords} domain={selectedOrg.domain} defaultOpen={!dnsServiceActive && !areCoreRecordsVerified} />
            </div>
          </section>
        </div>
      </DashboardShell>
    )
  }

  // Active Email Service Admin Center
  return (
    <DashboardShell>
      <div className="space-y-6 animate-in fade-in duration-300">
        <PageHeader
          title="Email Service"
          description={<span className="break-all text-sm">{selectedOrg.domain}</span>}
          actions={
            <>
              {lifecycleAccess?.orgId === selectedOrgId && lifecycleAccess.canInvite && (
                <Button asChild variant="outline" className="min-h-11">
                  <Link href={`/management/team?inviteOrg=${encodeURIComponent(selectedOrgId)}&preset=email-viewer`}>
                    Invite to manage email
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" className="min-h-11">
                <a href="https://mail.revlet.me" target="_blank" rel="noreferrer">
                  Open RevletMail <ArrowUpRight className="ml-1.5 size-4" aria-label="Opens in a new tab" />
                </a>
              </Button>
            </>
          }
        />

        {activeTab !== "settings" && (missingDnsRecords.length > 0 || setupError) && !isLoadingQuota && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{setupError ? "We couldn’t check your email settings." : "Your domain needs attention. Sending or receiving email may be affected."}</p>
            </div>
            <Button variant="outline" className="min-h-11 bg-white" onClick={() => setActiveTab("settings")}>Review settings</Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} activationMode="manual" className="space-y-4">
          <TabsList aria-label="Email service sections" className="grid h-auto w-full grid-cols-2 justify-start gap-1 rounded-xl bg-zinc-100 p-1 min-[420px]:grid-cols-3 xl:flex xl:flex-wrap">
            {EMAIL_SECTIONS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="min-h-11 justify-start gap-2 whitespace-normal px-2 text-left text-sm font-medium text-zinc-600 data-[state=active]:text-zinc-950 sm:px-3">
                <Icon className="size-4 shrink-0" aria-hidden="true" />{label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* =====================================================================
              TAB 1: USERS DIRECTORY
          ===================================================================== */}
          <TabsContent value="users" className="mt-0">
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-zinc-950">Email accounts</h2>
                  <p className="text-sm text-zinc-600">Give each person their own address and inbox.</p>
                </div>
                {canCreateAccounts && (
                  <Button className="min-h-11 w-full sm:w-auto" onClick={openCreateAccount}>
                    <Plus className="mr-2 size-4" aria-hidden="true" /> Add email account
                  </Button>
                )}
              </div>
              <div className="p-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="relative flex-1 sm:max-w-xs">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      strokeWidth={1.5}
                    />
                    <Input
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      aria-label="Search email accounts"
                      placeholder="Search accounts"
                      className="min-h-11 pl-9 text-base sm:text-sm border-slate-200 bg-white rounded-lg"
                    />
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "min-h-11 px-3 text-sm font-medium rounded-lg shrink-0 gap-1.5",
                          selectedUserOu !== "ALL"
                            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                        aria-label="Filter accounts by department"
                      >
                        <Filter className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span className="hidden sm:inline">
                          {selectedUserOu === "ALL" ? "Department" : selectedUserOu === "/" ? "General" : selectedUserOu.slice(1)}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 bg-white border border-slate-200 shadow-md rounded-xl p-1">
                      <DropdownMenuItem
                        onSelect={() => setSelectedUserOu("ALL")}
                        className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
                      >
                        <Check className={cn("w-3.5 h-3.5", selectedUserOu === "ALL" ? "opacity-100" : "opacity-0")} />
                        <span className="flex-1">All departments</span>
                        <span className="font-mono text-[11px] opacity-70">{activeUsers.length}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {allOuOptions.map((ouPath) => {
                        const count = activeUsers.filter((u) => u.orgUnitPath === ouPath).length
                        return (
                          <DropdownMenuItem
                            key={ouPath}
                            onSelect={() => setSelectedUserOu(ouPath)}
                            className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
                          >
                            <Check className={cn("w-3.5 h-3.5", selectedUserOu === ouPath ? "opacity-100" : "opacity-0")} />
                            <span className="font-mono flex-1 truncate">{ouPath === "/" ? "General" : ouPath.slice(1)}</span>
                            <span className="font-mono text-[11px] opacity-70">{count}</span>
                          </DropdownMenuItem>
                        )
                      })}
                      {canManageMailService && <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setIsOuModalOpen(true)}
                        className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Manage departments</span>
                      </DropdownMenuItem>
                      </>}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {selectedUserOu !== "ALL" && (
                    <button
                      type="button"
                      onClick={() => setSelectedUserOu("ALL")}
                      className="inline-flex items-center gap-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md shrink-0"
                      title="Clear filter"
                    >
                      <span>{selectedUserOu === "/" ? "General" : selectedUserOu.slice(1)}</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {canCreateAccounts && <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBulkImportErrors([])
                      setIsBulkImportOpen(true)
                    }}
                    className="min-h-11 px-3 text-sm font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5 text-slate-400" strokeWidth={1.5} />
                    Import accounts
                  </Button>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportUsersCsv}
                    disabled={users.length === 0}
                    className="min-h-11 px-3 text-sm font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5 text-slate-400" strokeWidth={1.5} />
                    Export accounts
                  </Button>
                </div>
              </div>

              {/* Users table */}
              {directoryError && (
                <div className="mx-6 my-4 rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-sm text-red-800">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" strokeWidth={1.75} />
                    <span>{directoryError}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-red-200 bg-white text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => loadAllMailData(false)}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} />
                    Retry
                  </Button>
                </div>
              )}
              {isLoadingDirectory || !hasLoadedDirectory ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                      <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                        Account Name
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Primary Address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Aliases
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Department
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 2, 3, 4, 5].map((idx) => (
                      <TableRow key={idx} className="border-b border-slate-100 last:border-0">
                        <TableCell className="pl-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-full" />
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-28" />
                              <Skeleton className="h-3 w-40" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5">
                          <Skeleton className="h-4 w-36" />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="text-right pr-6 py-3.5">
                          <Skeleton className="h-8 w-8 rounded-md ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : filteredActiveUsers.length === 0 ? (
                <div className="py-16 px-4 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-900">
                    {activeUsers.length === 0
                      ? "No email accounts yet"
                      : "No matching accounts"}
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {activeUsers.length === 0
                      ? `Accounts created here can sign in to RevletMail with an @${selectedOrg.domain} address.`
                      : "Try another search or clear the department filter."}
                  </p>
                  {activeUsers.length === 0 && canCreateAccounts && !directoryError && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        onClick={openCreateAccount}
                        className="bg-primary hover:bg-primary/95 !text-white text-white font-medium min-h-11 px-4 rounded-lg text-sm"
                      >
                        <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                        Add email account
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                          <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                            Account Name
                          </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Primary Address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Aliases
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Department
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedActiveUsers.map((u) => (
                      <TableRow
                        key={u.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                      >
                        <TableCell className="pl-6 py-3.5">
                          <span className="text-xs font-medium text-slate-900">
                            {u.displayName}
                          </span>
                        </TableCell>

                        <TableCell className="py-3.5">
                          <span className="text-xs font-mono text-slate-700">
                            {u.primaryEmail}
                          </span>
                        </TableCell>

                        <TableCell className="py-3.5">
                          {(u.aliases || []).length === 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAliasTargetUser(u)
                                setNewAliasPrefix("")
                                setEditingAliasOriginal(null)
                                setEditingAliasPrefix("")
                              }}
                              className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            >
                              0 Aliases
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAliasTargetUser(u)
                                setNewAliasPrefix("")
                                setEditingAliasOriginal(null)
                                setEditingAliasPrefix("")
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition-colors cursor-pointer"
                            >
                              <span className="font-mono tabular-nums font-semibold">{(u.aliases || []).length}</span>
                              <span>{(u.aliases || []).length === 1 ? "Alias" : "Aliases"}</span>
                            </button>
                          )}
                        </TableCell>

                        <TableCell className="py-3.5">
                          <span className="text-xs font-mono text-slate-500">
                            {u.orgUnitPath}
                          </span>
                        </TableCell>

                        <TableCell className="text-right pr-6 py-3.5">
                          {canManageMailService && <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Email item actions"
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
                                className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-400 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                              >
                                <UserPen className="w-4 h-4" strokeWidth={1.5} />
                                <span>Update Account Name</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => {
                                  setPasswordTargetUser(u)
                                  setNewPasswordValue("")
                                }}
                                className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-400 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                              >
                                <KeyRound className="w-4 h-4" strokeWidth={1.5} />
                                <span>Reset Password</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => setMfaResetTargetUser(u)}
                                className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-rose-600 focus:text-white data-[highlighted]:bg-rose-600 data-[highlighted]:text-white [&>svg]:text-slate-400 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                              >
                                <ShieldOff className="w-4 h-4" strokeWidth={1.5} />
                                <span>Remove MFA Settings</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => {
                                  setAliasTargetUser(u)
                                  setNewAliasPrefix("")
                                  setEditingAliasOriginal(null)
                                  setEditingAliasPrefix("")
                                }}
                                className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-400 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                              >
                                <AtSign className="w-4 h-4" strokeWidth={1.5} />
                                <span className="flex-1">Manage Email Aliases</span>
                                <span className="font-mono text-slate-400 group-focus:text-white/80 group-data-[highlighted]:text-white/80 tabular-nums">
                                  {u.aliases.length}
                                </span>
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                onSelect={() => handleSuspendOrReactivateUser(u, true)}
                                className="group gap-2 py-2 text-xs text-amber-700 focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white cursor-pointer rounded-md"
                              >
                                <Ban className="w-4 h-4" strokeWidth={1.5} />
                                <span>Suspend Account</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => setDeletingUser(u)}
                                className="group gap-2 py-2 text-xs text-destructive focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white cursor-pointer rounded-md"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                <span>Delete Email Account</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {paginatedActiveUsers.map((u) => (
                      <div key={u.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {u.displayName}
                            </div>
                            <div className="text-xs font-mono text-slate-600 truncate mt-0.5">
                              {u.primaryEmail}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                            {u.orgUnitPath}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAliasTargetUser(u)
                              setNewAliasPrefix("")
                              setEditingAliasOriginal(null)
                              setEditingAliasPrefix("")
                            }}
                            className="h-8 px-2.5 text-xs font-medium border-slate-200 text-slate-700 rounded-lg"
                          >
                            <AtSign className="w-3.5 h-3.5 mr-1 text-slate-500" strokeWidth={1.5} />
                            Aliases ({(u.aliases || []).length})
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPasswordTargetUser(u)
                              setNewPasswordValue("")
                            }}
                            className="h-8 px-2.5 text-xs font-medium border-slate-200 text-slate-700 rounded-lg"
                          >
                            <KeyRound className="w-3.5 h-3.5 mr-1 text-slate-500" strokeWidth={1.5} />
                            Reset Password
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label="More account actions"
                                className="h-8 w-8 ml-auto border-slate-200 text-slate-600 rounded-lg"
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
                                className="gap-2 py-2 text-xs cursor-pointer rounded-md"
                              >
                                <UserPen className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                                <span>Update Account Name</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setMfaResetTargetUser(u)}
                                className="gap-2 py-2 text-xs cursor-pointer rounded-md"
                              >
                                <ShieldOff className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                                <span>Remove MFA Settings</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => handleSuspendOrReactivateUser(u, true)}
                                className="gap-2 py-2 text-xs text-amber-700 cursor-pointer rounded-md"
                              >
                                <Ban className="w-4 h-4" strokeWidth={1.5} />
                                <span>Suspend Account</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setDeletingUser(u)}
                                className="gap-2 py-2 text-xs text-destructive cursor-pointer rounded-md"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                <span>Delete Email Account</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <TablePagination
                totalItems={filteredActiveUsers.length}
                currentPage={usersPage}
                pageSize={usersPageSize}
                onPageChange={setUsersPage}
                onPageSizeChange={setUsersPageSize}
                itemLabel="users"
              />
            </div>
          </TabsContent>

          {/* =====================================================================
              TAB 2: GROUPS (Same Styling & Approach as Users Directory Tab)
          ===================================================================== */}
          <TabsContent value="groups" className="mt-0">
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-zinc-950">Mailing groups</h2>
                  <p className="text-sm text-zinc-600">Messages to a group address go to each member’s own inbox.</p>
                </div>
                {canManageMailService && (
                  <Button className="min-h-11 w-full sm:w-auto" onClick={openCreateGroup}>
                    <Plus className="mr-2 size-4" aria-hidden="true" /> Create mailing group
                  </Button>
                )}
              </div>
              <div className="p-4 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40">
                <Select value={selectedGroupOu} onValueChange={setSelectedGroupOu}>
                  <SelectTrigger aria-label="Filter mailing groups by department" className="min-h-11 w-full text-sm lg:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All departments</SelectItem>
                    {allOuOptions.map((path) => (
                      <SelectItem key={path} value={path}>{path === "/" ? "General" : path.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      strokeWidth={1.5}
                    />
                    <Input
                      value={groupSearchQuery}
                      onChange={(e) => setGroupSearchQuery(e.target.value)}
                      aria-label="Search mailing groups"
                      placeholder="Search groups"
                      className="min-h-11 pl-9 text-base sm:text-sm border-slate-200 bg-white rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {isLoadingDirectory || !hasLoadedDirectory ? (
                <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading mailing groups">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : groupLoadError ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-red-800">
                  <p>{groupLoadError}</p>
                  <Button variant="outline" onClick={() => loadAllMailData(false)}>Try again</Button>
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="py-16 px-4 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-900">
                    {groups.length === 0 ? "No mailing groups yet" : "No matching mailing groups"}
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {groups.length === 0
                      ? `Create shared addresses on @${selectedOrg.domain} that deliver incoming messages to multiple members`
                      : "Try another search or clear the department filter."}
                  </p>
                  {groups.length === 0 && canManageMailService && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        onClick={openCreateGroup}
                        className="bg-primary hover:bg-primary/95 !text-white text-white font-medium min-h-11 px-4 rounded-lg text-sm"
                      >
                        <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                        Create mailing group
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Groups Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                          <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                            Group Name
                          </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Group Address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Members
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Department
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedGroups.map((g) => (
                      <TableRow
                        key={g.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors"
                      >
                        <TableCell className="pl-6 py-3.5">
                          <span className="text-xs font-medium text-slate-900">{g.name}</span>
                        </TableCell>

                        <TableCell className="py-3.5">
                          <span className="text-xs font-mono text-slate-700">
                            {g.groupEmail}
                          </span>
                        </TableCell>

                        <TableCell className="py-3.5">
                          <button
                            type="button"
                            onClick={() => {
                              setMembersTargetGroup(g)
                              setGroupMemberInput("")
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition-colors cursor-pointer"
                          >
                            <span className="font-mono tabular-nums font-semibold">{g.memberEmails.length}</span>
                            <span>{g.memberEmails.length === 1 ? "Member" : "Members"}</span>
                          </button>
                        </TableCell>

                        <TableCell className="py-3.5">
                          <span className="text-xs font-mono text-slate-500">
                            {g.orgUnitPath}
                          </span>
                        </TableCell>

                        <TableCell className="text-right pr-6 py-3.5">
                          {canManageMailService && <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Email item actions"
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
                                className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-400 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                              >
                                <Edit2 className="w-4 h-4" strokeWidth={1.5} />
                                <span>Update Group Name</span>
                              </DropdownMenuItem>

                              <DropdownMenuItem
                                onSelect={() => {
                                  setMembersTargetGroup(g)
                                  setGroupMemberInput("")
                                }}
                                className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-400 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                              >
                                <Users className="w-4 h-4" strokeWidth={1.5} />
                                <span className="flex-1">Manage Members</span>
                                <span className="font-mono text-slate-400 group-focus:text-white/80 group-data-[highlighted]:text-white/80 tabular-nums">
                                  {g.memberEmails.length}
                                </span>
                              </DropdownMenuItem>

                              <DropdownMenuSeparator />

                              <DropdownMenuItem
                                onSelect={() => setDeletingGroup(g)}
                                className="group gap-2 py-2 text-xs text-destructive focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white cursor-pointer rounded-md"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                <span>Delete Group</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                  </div>

                  {/* Mobile Groups Card View */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {paginatedGroups.map((g) => (
                      <div key={g.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {g.name}
                            </div>
                            <div className="text-xs font-mono text-slate-600 truncate mt-0.5">
                              {g.groupEmail}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                            {g.orgUnitPath}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setMembersTargetGroup(g)
                              setGroupMemberInput("")
                            }}
                            className="h-8 px-2.5 text-xs font-medium border-slate-200 text-slate-700 rounded-lg"
                          >
                            <Users className="w-3.5 h-3.5 mr-1 text-slate-500" strokeWidth={1.5} />
                            Members ({g.memberEmails.length})
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canManageMailService}
                            onClick={() => {
                              setEditingGroup(g)
                              setEditGroupForm({
                                name: g.name,
                                orgUnitPath: g.orgUnitPath || "/",
                              })
                            }}
                            className="h-8 px-2.5 text-xs font-medium border-slate-200 text-slate-700 rounded-lg"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1 text-slate-500" strokeWidth={1.5} />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Delete group"
                            disabled={!canManageMailService}
                            onClick={() => setDeletingGroup(g)}
                            className="h-8 w-8 ml-auto border-red-200 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <TablePagination
                totalItems={filteredGroups.length}
                currentPage={groupsPage}
                pageSize={groupsPageSize}
                onPageChange={setGroupsPage}
                onPageSizeChange={setGroupsPageSize}
                itemLabel="groups"
              />
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
                    Paused accounts
                    <span className="ml-2 font-mono text-slate-400 tabular-nums">
                      {filteredSuspendedUsers.length}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500">
                    People with paused accounts can sign in again after an administrator restores access.
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
                    aria-label="Search paused and deleted accounts"
                    placeholder="Search paused and deleted accounts"
                    className="h-9 pl-9 text-xs border-slate-200 bg-white rounded-lg"
                  />
                </div>
              </div>

              {isLoadingDirectory ? <Skeleton className="m-4 h-12" /> : filteredSuspendedUsers.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No paused accounts
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                          <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                            Account Name
                          </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Primary Address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Department
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedSuspendedUsers.map((u) => (
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
                          {canManageMailService && <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Email item actions"
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
                                className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:text-slate-400 [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white"
                              >
                                <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                                <span>Reactivate Account</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setDeletingUser(u)}
                                className="group gap-2 py-2 text-xs text-destructive focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white [&>svg]:focus:text-white [&>svg]:data-[highlighted]:text-white cursor-pointer rounded-md"
                              >
                                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                                <span>Delete Email Account</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                  </div>

                  {/* Mobile Paused accounts Card View */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {paginatedSuspendedUsers.map((u) => (
                      <div key={u.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                              <span className="text-sm font-semibold text-slate-900 truncate">
                                {u.displayName}
                              </span>
                            </div>
                            <div className="text-xs font-mono text-slate-600 truncate mt-0.5">
                              {u.primaryEmail}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                            {u.orgUnitPath}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canManageMailService}
                            onClick={() => handleSuspendOrReactivateUser(u, false)}
                            className="h-8 px-2.5 text-xs font-medium border-slate-200 text-slate-700 rounded-lg"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1 text-slate-500" strokeWidth={1.5} />
                            Reactivate
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canManageMailService}
                            onClick={() => setDeletingUser(u)}
                            className="h-8 px-2.5 ml-auto text-xs font-medium border-red-200 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <TablePagination
                totalItems={filteredSuspendedUsers.length}
                currentPage={suspendedPage}
                pageSize={suspendedPageSize}
                onPageChange={setSuspendedPage}
                onPageSizeChange={setSuspendedPageSize}
                itemLabel="suspended accounts"
              />
            </div>

            {/* Deleted accounts — 14-day recovery */}
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-200/80 bg-slate-50/40 space-y-0.5">
                <h2 className="text-xs font-medium text-slate-900">
                  Deleted Accounts (14-Day Recovery)
                  <span className="ml-2 font-mono text-slate-400 tabular-nums">
                    {filteredDeletedUsers.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Accounts can be restored for 14 days after deletion before permanent removal
                </p>
              </div>

              {isLoadingDirectory ? <Skeleton className="m-4 h-12" /> : filteredDeletedUsers.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No deleted accounts in the 14-day recovery window
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-white hover:bg-white border-b border-slate-200/80">
                          <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                            Account Name
                          </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Primary Address
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-slate-500">
                        Recovery Window
                      </TableHead>
                      <TableHead className="text-xs font-medium py-3 text-right pr-6 text-slate-500">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDeletedUsers.map((u) => {
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
                            {daysLeft} {daysLeft === 1 ? "Day" : "Days"} Remaining
                          </TableCell>
                          <TableCell className="text-right pr-6 py-3.5">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canManageMailService}
                            onClick={() => handleRecoverDeletedUser(u)}
                              className="h-8 px-3 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                            >
                              Recover Account
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                  </div>

                  {/* Mobile Deleted Accounts Card View */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {paginatedDeletedUsers.map((u) => {
                      const daysLeft = getDaysRemaining(u.recoverableUntil)
                      return (
                        <div key={u.id} className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" />
                                <span className="text-sm font-semibold text-slate-900 truncate">
                                  {u.displayName}
                                </span>
                              </div>
                              <div className="text-xs font-mono text-slate-600 truncate mt-0.5">
                                {u.primaryEmail}
                              </div>
                            </div>
                            <span className="text-[11px] font-mono text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded shrink-0 tabular-nums">
                              {daysLeft}d left
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canManageMailService}
                            onClick={() => handleRecoverDeletedUser(u)}
                            className="h-8 px-3 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg w-full"
                          >
                            Recover Account
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              <TablePagination
                totalItems={filteredDeletedUsers.length}
                currentPage={deletedPage}
                pageSize={deletedPageSize}
                onPageChange={setDeletedPage}
                onPageSizeChange={setDeletedPageSize}
                itemLabel="deleted accounts"
              />
            </div>
          </TabsContent>

          {/* =====================================================================
              TAB 4: SETTINGS (Domain Catch-All Routing + Required DNS Records)
          ===================================================================== */}
          <TabsContent value="settings" className="mt-0 space-y-4">
            <section aria-labelledby="email-domain-heading" className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 id="email-domain-heading" className="text-base font-semibold text-zinc-950">Domain connection</h2>
                  <p className="text-sm leading-relaxed text-zinc-600">{domainStatus}</p>
                  {hasDomainRecords && !areCoreRecordsVerified && !isLoadingQuota && (
                    <p className="text-sm text-zinc-600">{verifiedCoreDnsCount} of {coreDnsRecords.length} required records verified</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => loadAllMailData(true)} disabled={setupBusy}>
                    <RefreshCw className={cn("mr-2 size-4", isRefreshing && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                    {isRefreshing ? "Refreshing…" : "Refresh status"}
                  </Button>
                  {canManageMailService && (
                    <Button className="min-h-11" onClick={handleSyncDnsRecords} disabled={setupBusy}>
                      {isSyncingDns ? "Checking domain…" : dnsServiceActive ? "Add required records" : hasDomainRecords ? "Check my records" : "Prepare records"}
                    </Button>
                  )}
                </div>
              </div>
              {setupError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{setupError}</p>}
              <EmailDomainRecords key={selectedOrgId} records={requiredDnsRecords} domain={selectedOrg.domain} />
            </section>

            <section aria-labelledby="email-limits-heading" aria-busy={isLoadingQuota} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
              <h2 id="email-limits-heading" className="text-base font-semibold text-zinc-950">Sending limits</h2>
              <p className="mt-1 text-sm text-zinc-600">These limits are shared by the whole workspace. An email sent to three recipients uses three sends.</p>
              {isLoadingQuota ? <Skeleton className="mt-4 h-16" /> : lifecycleAccess?.orgId === selectedOrgId ? (
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <SendingLimit label="Last 24 hours" sent={dailySentCount} limit={dailyOutboundLimit} />
                  <SendingLimit label="This calendar month (UTC)" sent={monthlySentCount} limit={monthlyOutboundLimit} />
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-600">Sending limits are unavailable. Refresh status to try again.</p>
              )}
            </section>

            <details className="group rounded-xl border border-zinc-200 bg-white">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 sm:px-6 [&::-webkit-details-marker]:hidden">
                Advanced email settings
                <ChevronDown className="size-4 shrink-0 text-zinc-500 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="divide-y divide-zinc-100 border-t border-zinc-200">
                <section className="space-y-3 p-4 sm:p-6">
                  <h3 className="text-sm font-semibold text-zinc-950">Mail sent to unknown addresses</h3>
                  <p className="text-sm text-zinc-600">
                    {catchAllEmail
                      ? `Messages to unknown @${selectedOrg.domain} addresses go to ${catchAllEmail}.`
                      : `Messages to unknown @${selectedOrg.domain} addresses are rejected.`}
                  </p>
                  <Select
                    value={catchAllUserId || "NONE"}
                    disabled={!canManageMailService || isUpdatingCatchAll || isLoadingDirectory || !hasLoadedDirectory}
                    onValueChange={(value) => handleCatchAllTargetChange(value === "NONE" ? null : value)}
                  >
                    <SelectTrigger aria-label="Where to send mail for unknown addresses" className="min-h-11 w-full max-w-md text-left text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Reject these messages</SelectItem>
                      {catchAllUserId && !activeUsers.some((account) => account.id === catchAllUserId) && (
                        <SelectItem value={catchAllUserId} disabled>{catchAllEmail || "Current mailbox unavailable"}</SelectItem>
                      )}
                      {activeUsers.map((account) => (
                        <SelectItem key={account.id} value={account.id}>{account.displayName} ({account.primaryEmail})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>
                {securityPolicy?.orgId === selectedOrgId && (
                  <section className="flex items-start justify-between gap-4 p-4 sm:p-6">
                    <div className="space-y-1">
                      <h3 id="email-two-step-label" className="text-sm font-semibold text-zinc-950">Require two-step verification</h3>
                      <p className="text-sm text-zinc-600">Require an extra sign-in check for people in this workspace.</p>
                    </div>
                    <Switch
                      aria-labelledby="email-two-step-label"
                      checked={securityPolicy.enforceMfa}
                      disabled={isUpdatingEnforceMfa}
                      onCheckedChange={(checked) => handleToggleEnforceMfa(checked)}
                    />
                  </section>
                )}
                <section className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-zinc-950">Turn off email</h3>
                    <p className="text-sm text-zinc-600">Pause email for this domain and schedule permanent deletion in 14 days.</p>
                  </div>
                  <Button variant="outline" onClick={() => setIsDeactivateConfirmOpen(true)} disabled={!canDeactivateMailService} className="min-h-11 text-destructive hover:text-destructive">
                    Deactivate email
                  </Button>
                </section>
              </div>
            </details>
          </TabsContent>

          <TabsContent value="shared" className="mt-0">
            {selectedOrgId && (
              <EmailGovernancePanel key={selectedOrgId} orgId={selectedOrgId} domain={selectedOrg?.domain || ""} mode="shared" />
            )}
          </TabsContent>

          <TabsContent value="governance" className="mt-0">
            {selectedOrgId && (
              <EmailGovernancePanel key={selectedOrgId} orgId={selectedOrgId} domain={selectedOrg?.domain || ""} mode="quarantine" />
            )}
          </TabsContent>
        </Tabs>

        <StepUpMfaDialog
          open={Boolean(deactivationChallengeOrg)}
          onOpenChange={(open) => { if (!open) setDeactivationChallengeOrg(null) }}
          actionLabel="Deactivate Email Service"
          onVerified={async (token) => {
            if (deactivationChallengeOrg && lifecycleOrgRef.current === deactivationChallengeOrg) {
              await handleDeactivateService(token)
            }
            setDeactivationChallengeOrg(null)
          }}
        />

        <StepUpMfaDialog
          open={Boolean(credentialStepUp)}
          onOpenChange={(open) => { if (!open) setCredentialStepUp(null) }}
          actionLabel={
            credentialStepUp?.type === "mfa"
              ? "Reset Mailbox 2-Step Verification"
              : "Reset Mailbox Password"
          }
          onVerified={async (freshToken) => {
            const pending = credentialStepUp
            setCredentialStepUp(null)
            if (!pending || lifecycleOrgRef.current !== pending.orgId) return
            if (pending.type === "password") {
              await handleResetUserPassword(freshToken)
            } else {
              await handleResetUserMfa(freshToken)
            }
          }}
        />

        <StepUpMfaDialog
          open={pendingSecurityPolicy?.orgId === selectedOrgId}
          onOpenChange={(open) => { if (!open) setPendingSecurityPolicy(null) }}
          actionLabel="Update two-step verification requirements"
          onVerified={async (freshToken) => {
            const pending = pendingSecurityPolicy
            setPendingSecurityPolicy(null)
            if (pending && lifecycleOrgRef.current === pending.orgId) {
              await handleToggleEnforceMfa(pending.enforceMfa, freshToken)
            }
          }}
        />

        {/* =========================================================================
            DIALOGS
        ========================================================================= */}

        {/* 1. Organizational units dialog */}
        <Dialog open={isOuModalOpen} onOpenChange={setIsOuModalOpen}>
          <DialogContent className="max-w-lg bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Departments
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Organize email accounts and mailing groups by department.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-3 bg-slate-50/70 p-4 rounded-lg border border-slate-200/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Department name</Label>
                    <Input
                      value={newOuName}
                      onChange={(e) => setNewOuName(e.target.value)}
                      placeholder="Faculty"
                      className="h-9 text-xs bg-white border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Description (Optional)
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
                    Create department
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200/80 bg-white">
                  <div>
                    <div className="text-xs font-mono font-medium text-slate-800">General</div>
                    <div className="text-xs text-slate-400">Default department for new accounts</div>
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
          <DialogContent className="max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-0">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Add email account
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                This person will use the new address and password to sign in to RevletMail.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="createUserForm-firstName" className="text-sm font-medium text-slate-700">First name</Label>
                  <Input
                    id="createUserForm-firstName"
                    value={createUserForm.firstName}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    placeholder="Alex"
                    className="min-h-11 text-base sm:text-sm border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="createUserForm-lastName" className="text-sm font-medium text-slate-700">Last name</Label>
                  <Input
                    id="createUserForm-lastName"
                    value={createUserForm.lastName}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    placeholder="Morgan"
                    className="min-h-11 text-base sm:text-sm border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="createUserForm-emailPrefix" className="text-sm font-medium text-slate-700">Email address</Label>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-0">
                  <Input
                    id="createUserForm-emailPrefix"
                    value={createUserForm.emailPrefix}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, emailPrefix: e.target.value }))
                    }
                    placeholder="alex"
                    className="min-h-11 text-base sm:text-sm font-mono border-slate-200 rounded-lg sm:rounded-r-none"
                  />
                  <div className="min-h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-l-none sm:border-l-0 flex items-center text-xs font-mono text-slate-500">
                    @{selectedOrg.domain}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="createUserForm-password" className="text-sm font-medium text-slate-700">Password</Label>
                  <button
                    type="button"
                    onClick={generateStrongPassword}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" strokeWidth={1.75} />
                    <span>Generate password</span>
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showCreatePassword ? "text" : "password"}
                    id="createUserForm-password"
                    autoComplete="new-password"
                    aria-describedby="mailbox-password-rules"
                    value={createUserForm.password}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))
                    }
                    className="min-h-11 pr-9 text-base sm:text-sm font-mono border-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                    aria-label={showCreatePassword ? "Hide password" : "Show password"}
                  >
                    {showCreatePassword ? (
                      <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                    ) : (
                      <Eye className="w-4 h-4" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
                <p id="mailbox-password-rules" className="text-sm text-zinc-600">Use 8–128 characters, including a letter and a number or symbol.</p>
              </div>

              {orgUnits.length > 0 && (
                <details className="rounded-lg border border-zinc-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-700">Department (optional)</summary>
                  <Select
                    value={createUserForm.orgUnitPath}
                    onValueChange={(val) =>
                      setCreateUserForm((prev) => ({ ...prev, orgUnitPath: val }))
                    }
                  >
                    <SelectTrigger aria-label="Department" className="mt-3 min-h-11 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      {allOuOptions.map((ouPath) => (
                        <SelectItem key={ouPath} value={ouPath} className="text-xs font-mono">
                          {ouPath === "/" ? "General" : ouPath.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </details>
              )}
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
                Create email account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 2b. Post-creation Mailbox Handoff dialog */}
        <Dialog
          open={Boolean(createdMailboxHandoff)}
          onOpenChange={(open) => {
            if (!open) setCreatedMailboxHandoff(null)
          }}
        >
          <DialogContent className="w-[94vw] sm:w-full max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-5 sm:p-6 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                    Mailbox Ready for Handoff
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 truncate">
                    Share these credentials with {createdMailboxHandoff?.displayName}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {createdMailboxHandoff && (
              <div className="p-5 sm:p-6 space-y-3 text-xs">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 divide-y divide-slate-200/70">
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium shrink-0">Webmail URL</span>
                    <span className="font-mono text-slate-900 truncate">
                      https://mail.revlet.me/login
                    </span>
                  </div>
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium shrink-0">Email</span>
                    <span className="font-mono font-semibold text-slate-950 truncate">
                      {createdMailboxHandoff.email}
                    </span>
                  </div>
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium shrink-0">Temp Password</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-slate-950 truncate">
                        {showHandoffPassword
                          ? createdMailboxHandoff.password
                          : "•".repeat(Math.min(createdMailboxHandoff.password.length, 12))}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowHandoffPassword((v) => !v)}
                        className="text-slate-400 hover:text-slate-700 shrink-0"
                        aria-label={showHandoffPassword ? "Hide password" : "Show password"}
                      >
                        {showHandoffPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  The user can sign in immediately and change their password under RevletMail Settings.
                </p>
              </div>
            )}

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreatedMailboxHandoff(null)}
                className="h-9 px-4 text-xs font-medium rounded-lg w-full sm:w-auto"
              >
                Done
              </Button>
              {createdMailboxHandoff && (
                <Button
                  size="sm"
                  onClick={() => handleCopyLoginDetails(createdMailboxHandoff)}
                  className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs w-full sm:w-auto"
                >
                  {copiedKey === "handoff-login-details" ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} />
                      Copied Login Details
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.75} />
                      Copy Login Details
                    </>
                  )}
                </Button>
              )}
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
                Update Account Name
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update name and organizational unit for{" "}
                <span className="font-mono text-slate-700">{editingUser?.primaryEmail}</span>
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
                    className="h-9 text-xs border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">Last Name</Label>
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
                <Label className="text-xs font-medium text-slate-700">Organizational Unit</Label>
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
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 4. Reset user password dialog */}
        <Dialog
          open={Boolean(passwordTargetUser)}
          onOpenChange={(open) => {
            if (!open) {
              setPasswordTargetUser(null)
              setNewPasswordValue("")
              setShowResetPassword(false)
              setCopiedResetPassword(false)
            }
          }}
        >
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Reset Password
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Set a new sign-in password for{" "}
                <span className="font-mono text-slate-700">{passwordTargetUser?.primaryEmail}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium text-slate-700">New Password</Label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"
                        const bytes = new Uint8Array(14)
                        crypto.getRandomValues(bytes)
                        const generated = Array.from(bytes, (b) => chars[b % chars.length]).join("")
                        setNewPasswordValue(generated)
                        setShowResetPassword(true)
                      }}
                      className="h-6 px-2 text-[11px] text-slate-600 hover:text-slate-900 gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Generate
                    </Button>
                    {newPasswordValue && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(newPasswordValue)
                          setCopiedResetPassword(true)
                          setTimeout(() => setCopiedResetPassword(false), 1800)
                        }}
                        className="h-6 px-2 text-[11px] text-slate-600 hover:text-slate-900 gap-1"
                      >
                        {copiedResetPassword ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {copiedResetPassword ? "Copied" : "Copy"}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <Input
                    type={showResetPassword ? "text" : "password"}
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                    placeholder="8+ chars, letter & number/symbol"
                    className="h-9 text-xs border-slate-200 rounded-lg pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label={showResetPassword ? "Hide password" : "Show password"}
                  >
                    {showResetPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="pt-1 space-y-1 text-[11px]">
                  <div className={cn("flex items-center gap-1.5", newPasswordValue.length >= 8 && newPasswordValue.length <= 128 ? "text-emerald-600" : "text-slate-400")}>
                    <Check className="w-3 h-3" />
                    <span>8–128 characters</span>
                  </div>
                  <div className={cn("flex items-center gap-1.5", /[A-Za-z]/.test(newPasswordValue) && /[\d\W_]/.test(newPasswordValue) ? "text-emerald-600" : "text-slate-400")}>
                    <Check className="w-3 h-3" />
                    <span>At least one letter and one number or symbol</span>
                  </div>
                </div>
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
                onClick={() => handleResetUserPassword()}
                disabled={
                  isResettingPassword ||
                  newPasswordValue.length < 8 ||
                  newPasswordValue.length > 128 ||
                  !/[A-Za-z]/.test(newPasswordValue) ||
                  !/[\d\W_]/.test(newPasswordValue)
                }
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
              >
                {isResettingPassword && (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
                )}
                Update Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 4b. Remove user MFA settings confirmation dialog */}
        <AlertDialog
          open={Boolean(mfaResetTargetUser)}
          onOpenChange={(open) => {
            if (!open && !isResettingMfa) setMfaResetTargetUser(null)
          }}
        >
          <AlertDialogContent className="max-w-md bg-white rounded-xl border border-slate-200">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
                Reset two-step verification?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-600 leading-relaxed">
                This will remove all enrolled 2-Step Verification methods (Authenticator App, Passkeys, Secondary Recovery Email, and Backup Codes) for{" "}
                <span className="font-mono font-semibold text-slate-800">{mfaResetTargetUser?.primaryEmail}</span>.
                The user can re-enroll MFA from RevletMail Settings.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel
                disabled={isResettingMfa}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  void handleResetUserMfa()
                }}
                disabled={isResettingMfa}
                className="bg-rose-600 hover:bg-rose-700 text-white h-9 px-4 text-xs font-medium rounded-lg"
              >
                {isResettingMfa && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Remove MFA Settings
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                Manage Email Aliases
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Add, update, or remove aliases for{" "}
                <span className="font-mono text-slate-700">{aliasTargetUser?.primaryEmail}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">New Alias</Label>
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
                    disabled={!canManageMailService || isMutatingAlias || !newAliasPrefix.trim()}
                    onClick={() =>
                      handleAliasAction("add", { aliasPrefix: newAliasPrefix.trim() })
                    }
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0"
                  >
                    Add Alias
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
                              disabled={!canManageMailService || isMutatingAlias || !editingAliasPrefix.trim()}
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
                                disabled={!canManageMailService || isMutatingAlias}
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
                                disabled={!canManageMailService || isMutatingAlias}
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
                Delete Email Account
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
                Delete Account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 7. Create group dialog */}
        <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
          <DialogContent className="max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-0">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Create mailing group
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Email sent to this address is forwarded to each member. The group has no inbox or sign-in.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="createGroupForm-name" className="text-sm font-medium text-slate-700">Group name</Label>
                <Input
                  id="createGroupForm-name"
                    value={createGroupForm.name}
                  onChange={(e) =>
                    setCreateGroupForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Admissions"
                  className="min-h-11 text-base sm:text-sm border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="createGroupForm-emailPrefix" className="text-sm font-medium text-slate-700">Group address</Label>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-0">
                  <Input
                    id="createGroupForm-emailPrefix"
                    value={createGroupForm.emailPrefix}
                    onChange={(e) =>
                      setCreateGroupForm((prev) => ({ ...prev, emailPrefix: e.target.value }))
                    }
                    placeholder="admissions"
                    className="min-h-11 text-base sm:text-sm font-mono border-slate-200 rounded-lg sm:rounded-r-none"
                  />
                  <div className="min-h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg sm:rounded-l-none sm:border-l-0 flex items-center text-xs font-mono text-slate-500">
                    @{selectedOrg.domain}
                  </div>
                </div>
              </div>

              {orgUnits.length > 0 && (
                <details className="rounded-lg border border-zinc-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-700">Department (optional)</summary>
                  <Select
                    value={createGroupForm.orgUnitPath}
                    onValueChange={(val) =>
                      setCreateGroupForm((prev) => ({ ...prev, orgUnitPath: val }))
                    }
                  >
                    <SelectTrigger aria-label="Department" className="mt-3 min-h-11 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      {allOuOptions.map((ouPath) => (
                        <SelectItem key={ouPath} value={ouPath} className="text-xs font-mono">
                          {ouPath === "/" ? "General" : ouPath.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </details>
              )}

              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-700">
                  Members (Optional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={newGroupMemberInput}
                    onChange={(e) => setNewGroupMemberInput(e.target.value)}
                    placeholder="member@example.com"
                    className="min-h-11 text-base sm:text-sm font-mono border-slate-200 rounded-lg"
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
                    className="min-h-11 px-3 text-xs font-medium border-slate-200 rounded-lg"
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
                Create mailing group
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
                Update Group Name
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update name and organizational unit for{" "}
                <span className="font-mono text-slate-700">{editingGroup?.groupEmail}</span>
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
                  className="h-9 text-xs border-slate-200 rounded-lg"
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
                Save Changes
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
                Manage Group Members
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Add or remove recipient addresses for{" "}
                <span className="font-mono text-slate-700">{membersTargetGroup?.groupEmail}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              {canManageMailService && <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-700">Member Address</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={groupMemberInput}
                      onFocus={() => setShowGroupMemberSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowGroupMemberSuggestions(false), 150)}
                      onChange={(e) => {
                        setGroupMemberInput(e.target.value)
                        setShowGroupMemberSuggestions(true)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && groupMemberInput.trim().includes("@") && membersTargetGroup) {
                          e.preventDefault()
                          const clean = groupMemberInput.toLowerCase().trim()
                          const next = Array.from(new Set([...membersTargetGroup.memberEmails, clean]))
                          handleUpdateGroupMembersList(next)
                          setShowGroupMemberSuggestions(false)
                        }
                      }}
                      placeholder="Search directory user or enter email..."
                      className="h-9 text-xs font-mono border-slate-200 rounded-lg w-full"
                    />
                    {showGroupMemberSuggestions && (() => {
                      const q = groupMemberInput.trim().toLowerCase()
                      const existing = new Set((membersTargetGroup?.memberEmails || []).map((m) => m.toLowerCase()))
                      const matches = activeUsers
                        .filter((u) => !existing.has(u.primaryEmail.toLowerCase()))
                        .filter(
                          (u) =>
                            !q ||
                            u.primaryEmail.toLowerCase().includes(q) ||
                            (u.displayName || "").toLowerCase().includes(q)
                        )
                        .slice(0, 6)
                      if (matches.length === 0) return null
                      return (
                        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
                          {matches.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault()
                                if (!membersTargetGroup) return
                                const next = Array.from(
                                  new Set([...membersTargetGroup.memberEmails, u.primaryEmail.toLowerCase()])
                                )
                                handleUpdateGroupMembersList(next)
                                setShowGroupMemberSuggestions(false)
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between gap-2"
                            >
                              <span className="text-xs font-medium text-slate-800 truncate">
                                {u.displayName || u.firstName || u.primaryEmail.split("@")[0]}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500 truncate">
                                {u.primaryEmail}
                              </span>
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  <Button
                    size="sm"
                    disabled={
                      isUpdatingGroupMembers ||
                      !groupMemberInput.trim() ||
                      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(groupMemberInput.trim())
                    }
                    onClick={() => {
                      if (!membersTargetGroup) return
                      const clean = groupMemberInput.toLowerCase().trim()
                      const next = Array.from(
                        new Set([...membersTargetGroup.memberEmails, clean])
                      )
                      handleUpdateGroupMembersList(next)
                      setShowGroupMemberSuggestions(false)
                    }}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0"
                  >
                    Add Member
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
                          disabled={!canManageMailService || isUpdatingGroupMembers}
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
              </div>}

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
                        disabled={!canManageMailService || isUpdatingGroupMembers}
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
                Delete Group
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
                Delete Group
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
                Deactivate Email Service
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
                Deactivating Email Service for{" "}
                <span className="font-mono text-slate-800">{selectedOrg.domain}</span> will immediately pause mail delivery and schedule all mailboxes, aliases, groups, and stored email data for permanent deletion after 14 days. You can reactivate within 14 days to cancel deletion.
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
                Deactivate Service
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 12. Bulk Import Users Dialog */}
        <Dialog open={isBulkImportOpen} onOpenChange={setIsBulkImportOpen}>
          <DialogContent className="sm:max-w-xl bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Bulk Import Email Accounts
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Upload or paste a CSV file with columns:{" "}
                <span className="font-mono text-slate-700">
                  firstName,lastName,emailPrefix,password,orgUnitPath
                </span>
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleBulkImportSubmit} className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-slate-800">CSV Template</p>
                  <p className="text-[11px] text-slate-500">
                    Includes required <span className="font-mono">password</span> field (min 8 chars, letter + number/symbol).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadCsvTemplate}
                  className="h-8 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 rounded-lg shrink-0"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                  Download Template
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bulk-csv-file" className="text-xs font-medium text-slate-700">
                  Upload CSV File
                </Label>
                <Input
                  id="bulk-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleBulkCsvFileUpload}
                  className="h-9 text-xs border-slate-200 bg-white rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bulk-csv-text" className="text-xs font-medium text-slate-700">
                    CSV Data
                  </Label>
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {parsedBulkRows.length} {parsedBulkRows.length === 1 ? "account" : "accounts"} detected
                  </span>
                </div>
                <textarea
                  id="bulk-csv-text"
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  placeholder={"firstName,lastName,emailPrefix,password,orgUnitPath\nAlex,Morgan,alex,TempPass123!,/"}
                  className="w-full min-h-[140px] rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {bulkImportErrors.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 space-y-1 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-rose-900">
                    Skipped Rows ({bulkImportErrors.length})
                  </p>
                  {bulkImportErrors.map((err, idx) => (
                    <p key={idx} className="text-[11px] text-rose-800 font-mono">
                      {err}
                    </p>
                  ))}
                </div>
              )}

              <DialogFooter className="pt-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBulkImportOpen(false)}
                  className="h-9 text-xs font-medium rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isBulkImporting || parsedBulkRows.length === 0}
                  className="h-9 px-4 bg-primary hover:bg-primary/95 text-white text-xs font-medium rounded-lg"
                >
                  {isBulkImporting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  {isBulkImporting ? "Importing..." : `Import ${parsedBulkRows.length || ""} Accounts`}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
