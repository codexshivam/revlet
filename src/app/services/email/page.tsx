"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card } from "@/components/ui/card"
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
} from "lucide-react"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { toast } from "@/hooks/use-toast"
import { useUser } from "@/firebase"
import { useActiveOrg } from "@/hooks/use-active-org"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyOrgState } from "@/components/services/empty-org-state"
import { ServiceActivationCard } from "@/components/services/service-activation-card"
import { EmailGovernancePanel } from "@/components/services/email-governance-panel"
import { StepUpMfaDialog } from "@/components/security/step-up-mfa-dialog"
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

export default function EmailServiceAdminPage() {
  const { user, loading: authLoading } = useUser()
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()

  // Core service state
  const [isLoadingQuota, setIsLoadingQuota] = useState(false)
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(true)
  const [hasLoadedDirectory, setHasLoadedDirectory] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const loadRequestSeqRef = useRef(0)
  const [isActivating, setIsActivating] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [isSyncingDns, setIsSyncingDns] = useState(false)

  const [serviceActive, setServiceActive] = useState<boolean>(() => Boolean(selectedOrg?.mailServiceActive))
  const isEffectiveServiceActive = Boolean(selectedOrg?.mailServiceActive ?? serviceActive)

  const [dnsServiceActive, setDnsServiceActive] = useState<boolean>(() => Boolean(selectedOrg?.cloudflareZoneId))
  const [monthlyOutboundLimit, setMonthlyOutboundLimit] = useState<number>(() => selectedOrg?.mailMonthlyLimit ?? 1000)
  const [dailyOutboundLimit, setDailyOutboundLimit] = useState<number>(() => selectedOrg?.mailDailyLimit ?? 100)
  const [monthlySentCount, setMonthlySentCount] = useState<number>(() => selectedOrg?.mailMonthlySent ?? 0)
  const [dailySentCount, setDailySentCount] = useState<number>(() => selectedOrg?.mailDailySent ?? 0)
  const [catchAllUserId, setCatchAllUserId] = useState<string | null>(() => selectedOrg?.mailCatchAllUserId ?? null)
  const [catchAllEmail, setCatchAllEmail] = useState<string | null>(() => selectedOrg?.mailCatchAllEmail ?? null)
  const [requiredDnsRecords, setRequiredDnsRecords] = useState<MailRequiredDnsRecord[]>([])
  const [hasScannedDns, setHasScannedDns] = useState(false)

  useEffect(() => {
    if (selectedOrg) {
      setServiceActive(Boolean(selectedOrg.mailServiceActive))
      setDnsServiceActive(Boolean(selectedOrg.cloudflareZoneId))
      setMonthlyOutboundLimit(selectedOrg.mailMonthlyLimit ?? 1000)
      setDailyOutboundLimit(selectedOrg.mailDailyLimit ?? 100)
      setMonthlySentCount(selectedOrg.mailMonthlySent ?? 0)
      setDailySentCount(selectedOrg.mailDailySent ?? 0)
      setCatchAllUserId(selectedOrg.mailCatchAllUserId ?? null)
      setCatchAllEmail(selectedOrg.mailCatchAllEmail ?? null)
    }
  }, [selectedOrg])

  // Pre-computed fallback DNS records for immediate display before network resolution
  const fallbackDnsRecords = useMemo<MailRequiredDnsRecord[]>(() => {
    const domain = (selectedOrg?.domain || "revlet.me").toLowerCase().trim()
    const baseRecords: MailRequiredDnsRecord[] = [
      {
        id: "mx-primary",
        purpose: "Inbound Mail Routing (MX)",
        type: "MX",
        name: domain,
        content: "mx.revlet.me",
        priority: 10,
        ttl: "Auto",
        verified: false,
      },
      {
        id: "txt-spf",
        purpose: "Sender Policy Authorization (SPF)",
        type: "TXT",
        name: domain,
        content: "v=spf1 mx include:_spf.mx.revlet.me include:amazonses.com ~all",
        ttl: "Auto",
        verified: false,
      },
      {
        id: "txt-dmarc",
        purpose: "Domain Authentication Policy (DMARC)",
        type: "TXT",
        name: `_dmarc.${domain}`,
        content: "v=DMARC1; p=quarantine; pct=100;",
        ttl: "Auto",
        verified: false,
      },
    ]

    if (
      selectedOrg?.mailDkimMode === "easydkim" &&
      selectedOrg?.mailDkimTokens &&
      Array.isArray(selectedOrg.mailDkimTokens) &&
      selectedOrg.mailDkimTokens.length === 3
    ) {
      return [
        ...baseRecords,
        ...selectedOrg.mailDkimTokens.map((tok, idx) => ({
          id: `cname-dkim-${idx + 1}`,
          purpose: `Domain Signing Key #${idx + 1} (DKIM)`,
          type: "CNAME" as const,
          name: `${tok}._domainkey.${domain}`,
          content: `${tok}.dkim.amazonses.com`,
          ttl: "Auto",
          verified: false,
        })),
      ]
    }

    const selector = selectedOrg?.mailDkimSelector || "revlet"
    const publicKey = selectedOrg?.mailDkimPublicKey || ""
    return [
      ...baseRecords,
      {
        id: "txt-dkim-1",
        purpose: "Outbound Mail Signing (DKIM)",
        type: "TXT",
        name: `${selector}._domainkey.${domain}`,
        content: publicKey ? `v=DKIM1; k=rsa; p=${publicKey}` : "v=DKIM1; k=rsa; p=...",
        ttl: "Auto",
        verified: false,
      },
    ]
  }, [
    selectedOrg?.domain,
    selectedOrg?.mailDkimMode,
    selectedOrg?.mailDkimSelector,
    selectedOrg?.mailDkimPublicKey,
    selectedOrg?.mailDkimTokens,
  ])

  const displayDnsRecords = requiredDnsRecords.length > 0 ? requiredDnsRecords : fallbackDnsRecords
  const coreDnsRecords = useMemo(
    () => displayDnsRecords.filter((r) => r.id !== "txt-spf" && r.id !== "txt-dmarc"),
    [displayDnsRecords]
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

  // Active tab & filters (synced with ?tab= URL parameter)
  const [activeTab, setActiveTabState] = useState("users")
  const [enforceMfa, setEnforceMfa] = useState(false)
  const [isUpdatingEnforceMfa, setIsUpdatingEnforceMfa] = useState(false)
  const [mfaStepUpOpen, setMfaStepUpOpen] = useState(false)
  const [pendingEnforceValue, setPendingEnforceValue] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user || !selectedOrgId) return
    user.getIdToken().then((idToken) => {
      getOrganizationSecurityPolicy(idToken, selectedOrgId).then((res) => {
        if (res.success && typeof res.enforceMfa === "boolean") {
          setEnforceMfa(res.enforceMfa)
        }
      })
    }).catch(() => {})
  }, [user, selectedOrgId])

  const handleToggleEnforceMfa = async (nextVal: boolean, stepUpToken?: string) => {
    if (!user || !selectedOrgId) return
    setIsUpdatingEnforceMfa(true)
    try {
      const idToken = await user.getIdToken()
      const res = await setOrganizationEnforceMfa(idToken, selectedOrgId, nextVal, stepUpToken)
      if (!res.success && typeof res.error === "string" && res.error.includes("MFA_STEP_UP_REQUIRED")) {
        setPendingEnforceValue(nextVal)
        setMfaStepUpOpen(true)
        return
      }
      if (!res.success) {
        toast({ variant: "destructive", title: "Policy update failed", description: res.error })
        return
      }
      setEnforceMfa(Boolean(res.enforceMfa))
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

  useEffect(() => {
    if (typeof window === "undefined") return
    const tabParam = new URLSearchParams(window.location.search).get("tab")
    if (tabParam && ["users", "groups", "shared", "suspended", "governance", "settings"].includes(tabParam)) {
      setActiveTabState(tabParam)
    }
  }, [])

  const setActiveTab = (nextTab: string) => {
    setActiveTabState(nextTab)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", nextTab)
      window.history.replaceState({}, "", url.toString())
    }
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
    setHasScannedDns(false)
    setMailPurgeScheduledAt(null)
    setSelectedUserOu("ALL")
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
        const dirPromise = Promise.all([
          listMailOrgUnits(idToken, selectedOrgId),
          listMailUsers(idToken, selectedOrgId),
          listMailGroups(idToken, selectedOrgId),
        ])
          .then(([ousRes, usersRes, groupsRes]) => {
            if (loadRequestSeqRef.current !== requestSeq) {
              return
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
            setHasLoadedDirectory(true)
          })
          .catch((err) => {
            if (loadRequestSeqRef.current !== requestSeq) {
              return
            }
            console.error("Failed to load mail directory:", err)
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
              setServiceActive(stateRes.data.mailServiceActive)
              setDnsServiceActive(stateRes.data.dnsServiceActive)
              setMonthlyOutboundLimit(stateRes.data.monthlyOutboundLimit)
              setDailyOutboundLimit(stateRes.data.dailyOutboundLimit)
              setMonthlySentCount(stateRes.data.monthlySentCount)
              setDailySentCount(stateRes.data.dailySentCount)
              setCatchAllUserId(stateRes.data.catchAllUserId)
              setCatchAllEmail(stateRes.data.catchAllEmail)
              setMailPurgeScheduledAt(stateRes.data.mailPurgeScheduledAt || null)
              setRequiredDnsRecords(stateRes.data.requiredDnsRecords)
            }
          })
          .catch((err) => {
            if (loadRequestSeqRef.current !== requestSeq) {
              return
            }
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
    const lines = bulkCsvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return []

    const startIdx = lines[0].toLowerCase().includes("emailprefix") ? 1 : 0
    const rows: BulkImportUserRow[] = []
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
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
    const escapeCsv = (val: string) => `"${String(val || "").replace(/"/g, '""')}"`
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

  const handleCopyAllRecords = () => {
    if (!selectedOrg?.domain) return
    const recordsToCopy = serviceActive ? displayDnsRecords : coreDnsRecords

    const text = recordsToCopy
      .map((r, i) => {
        const prio = (r as any).priority !== undefined ? ` (Priority ${(r as any).priority})` : ""
        return `${i + 1}. [${r.type}${prio}] ${r.purpose}\n   Host: ${r.name}\n   Target / Value: ${r.content}`
      })
      .join("\n\n")

    const full =
      `Required DNS Records for ${selectedOrg.domain}:\n\n` +
      text +
      `\n\nAdd these records at your DNS provider to activate Email Service.`

    navigator.clipboard.writeText(full)
    setCopiedKey("all-records")
    setTimeout(() => setCopiedKey(null), 2000)
    toast({
      title: "All DNS records copied",
      description: serviceActive
        ? "Copied all MX, DKIM, SPF, and DMARC records to clipboard."
        : "Copied required Inbound (MX) and Outbound (DKIM) records to clipboard.",
    })
  }

  // Service activation / deactivation / DNS sync
  const handleActivateService = async () => {
    if (!user || !selectedOrgId) return
    setIsActivating(true)
    try {
      const idToken = await user.getIdToken()

      // If DNS is external, attempt a live sync first to advise user on status
      if (!dnsServiceActive) {
        try {
          await syncMailDnsRecords(idToken, selectedOrgId)
        } catch {
          // Proceed with activation
        }
      }

      const res = await activateMailService(idToken, selectedOrgId)
      if (!res.success) {
        throw new Error(res.error)
      }

      setServiceActive(true)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("revlet-orgs-refresh"))
      }

      if (res.data?.dnsProvisionedAutomatically) {
        toast({
          title: "Email Service activated & configured",
          description: `Safety snapshot created and required MX, SPF, DMARC, and DKIM records auto-injected into ${selectedOrg?.domain}.`,
        })
      } else if (res.data?.dnsWarning) {
        toast({
          title: "Email Service activated",
          description: `Email Service is active. Review DNS records in Settings (${res.data.dnsWarning}).`,
        })
      } else {
        toast({
          title: "Email Service activated",
          description: `Email Service is now active for ${selectedOrg?.domain}. Ensure MX & DKIM records are published in your DNS manager.`,
        })
      }

      await loadAllMailData(true)
      setHasScannedDns(true)
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Activation failed",
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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("revlet-orgs-refresh"))
      }
      toast({
        title: "Email Service deactivated",
        description: "Email Service has been paused for this organization.",
      })
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
    if (!user || !selectedOrgId) return
    setIsSyncingDns(true)
    try {
      const idToken = await user.getIdToken()
      const res = await syncMailDnsRecords(idToken, selectedOrgId)
      if (!res.success) throw new Error(res.error)

      if (!dnsServiceActive) {
        toast({
          title: "DNS verification complete",
          description: `${res.data?.verifiedCount ?? 0} of ${res.data?.totalCount ?? requiredDnsRecords.length} required DNS records verified on ${selectedOrg?.domain}.`,
        })
      } else {
        toast({
          title: "DNS records synchronized",
          description:
            res.data?.addedCount && res.data.addedCount > 0
              ? `Added ${res.data.addedCount} missing DNS record(s) to ${selectedOrg?.domain}.`
              : `All required DNS records are present on ${selectedOrg?.domain}.`,
        })
      }
      await loadAllMailData(true)
      setHasScannedDns(true)
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
        <div className="flex flex-col items-center justify-center min-h-[50vh] bg-white px-6">
          <img
            src="/logo-4k.png"
            alt="Revlet"
            className="h-20 sm:h-24 w-auto max-w-[82vw] object-contain select-none"
          />
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

  const verifiedDnsCount = displayDnsRecords.filter((r) => r.verified).length
  const isMxVerified = displayDnsRecords.find((r) => r.type === "MX")?.verified
  const missingDnsRecords = requiredDnsRecords.filter((r) => !r.verified)
  const purgeDateLabel = mailPurgeScheduledAt
    ? new Date(mailPurgeScheduledAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null

  // Pre-activation screen: matches DNS Management layout & style
  if (!isEffectiveServiceActive) {
    return (
      <DashboardShell>
        <div className="space-y-6 animate-in fade-in duration-200">
          <PageHeader title="Email Service" />

          {mailPurgeScheduledAt && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-950">
                    Email Service Deactivated — Permanent Deletion Scheduled for {purgeDateLabel}
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    All mailboxes, aliases, groups, and stored email data for{" "}
                    <span className="font-mono font-semibold">{selectedOrg.domain}</span> will be permanently deleted from our servers after the 14-day retention period. Reactivate Email Service to cancel deletion and preserve your data.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="w-full space-y-6">
            {/* Widget 1: Email Service Activation Widget (65% Blue Features / 35% Activation) */}
            <ServiceActivationCard
              domain={selectedOrg.domain}
              domainIcon={<Mail className="w-3.5 h-3.5 text-white" />}
              title="RevletMail Service"
              description="Dedicated business email hosting for your organization with automated deliverability and centralized directory control."
              features={[
                {
                  title: "Custom Business Email",
                  description:
                    "Build trust with professional addresses using your own domain name, like you@yourcompany.com.",
                },
                {
                  title: "Work From Anywhere",
                  description:
                    "Access your inbox, send replies, and stay connected across desktop and mobile webmail.",
                },
                {
                  title: "Team Groups & Aliases",
                  description:
                    "Create shared addresses like hello@ or support@ so inquiries always reach the right people.",
                },
                {
                  title: "Spam & Delivery Protection",
                  description:
                    "Built-in authentication and sending safeguards keep your messages landing in primary inboxes.",
                },
              ]}
              rightPanel={
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">Activation</h3>
                    <p className="text-xs text-slate-500">
                      Enable email hosting for {selectedOrg.domain}.
                    </p>
                  </div>

                  {dnsServiceActive ? (
                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-900">Managed by Revlet Platform</p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Required MX, SPF, DKIM, and DMARC records will be configured automatically without affecting existing website records.
                        </p>
                      </div>
                      <Button
                        onClick={handleActivateService}
                        disabled={isActivating}
                        className="w-full h-9 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none flex items-center justify-center gap-2"
                      >
                        {isActivating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {isActivating ? "Activating..." : "Activate"}
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-900">External DNS Setup</p>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {verifiedCoreDnsCount}/{coreDnsRecords.length} verified
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Add the required Inbound (MX) and Outbound (DKIM) DNS records below at your domain provider, then verify your domain to activate.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {areCoreRecordsVerified ? (
                          <Button
                            onClick={handleActivateService}
                            disabled={isActivating}
                            className="w-full h-9 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none flex items-center justify-center gap-2"
                          >
                            {isActivating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {isActivating ? "Activating..." : "Verify & Activate"}
                          </Button>
                        ) : (
                          <Button
                            onClick={handleSyncDnsRecords}
                            disabled={isSyncingDns}
                            className="w-full h-9 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none flex items-center justify-center gap-2"
                          >
                            {isSyncingDns && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {isSyncingDns ? "Verifying Domain..." : "Verify Domain"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              }
            />

            {/* Widget 2: Required DNS Records */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Required DNS Records
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mail routing and sender authentication records for {selectedOrg.domain}.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-slate-500 tabular-nums mr-1">
                    {verifiedCoreDnsCount} of {coreDnsRecords.length} verified
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyAllRecords}
                    className="h-8 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-none"
                  >
                    {copiedKey === "all-records" ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-slate-900" strokeWidth={1.5} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5 text-slate-400" strokeWidth={1.5} />
                        Copy All
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncDnsRecords}
                    disabled={isSyncingDns}
                    className="h-8 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-none"
                  >
                    <RefreshCw
                      className={cn("w-3.5 h-3.5 mr-1.5 text-slate-400", isSyncingDns && "animate-spin")}
                      strokeWidth={1.5}
                    />
                    {isSyncingDns ? "Checking..." : "Verify DNS"}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200/80">
                      <TableHead className="text-xs font-medium py-2.5 pl-5 text-slate-500 w-[80px]">
                        Type
                      </TableHead>
                      <TableHead className="text-xs font-medium py-2.5 text-slate-500 min-w-[200px]">
                        Host / Name
                      </TableHead>
                      <TableHead className="text-xs font-medium py-2.5 text-slate-500 min-w-[260px]">
                        Target / Value
                      </TableHead>
                      <TableHead className="text-xs font-medium py-2.5 text-slate-500 w-[80px]">
                        Priority
                      </TableHead>
                      <TableHead className="text-xs font-medium py-2.5 text-right pr-5 text-slate-500 w-[90px]">
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingQuota || isSyncingDns ? (
                      [...Array(2)].map((_, idx) => (
                        <TableRow key={idx} className="border-b border-slate-100 last:border-0">
                          <TableCell className="pl-5 py-3">
                            <Skeleton className="h-5 w-12 bg-slate-100" />
                          </TableCell>
                          <TableCell className="py-3">
                            <Skeleton className="h-3.5 w-44 bg-slate-100" />
                          </TableCell>
                          <TableCell className="py-3">
                            <Skeleton className="h-3.5 w-56 bg-slate-100" />
                          </TableCell>
                          <TableCell className="py-3">
                            <Skeleton className="h-3.5 w-10 bg-slate-100" />
                          </TableCell>
                          <TableCell className="text-right pr-5 py-3">
                            <Skeleton className="h-3.5 w-16 ml-auto bg-slate-100" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      coreDnsRecords.map((rec) => (
                      <TableRow key={rec.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
                        <TableCell className="pl-5 py-3">
                          <span className="font-mono text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60">
                            {rec.type}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-slate-700 break-all select-all">
                              {rec.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rec.name, `${rec.id}-pre-name`)}
                              className="text-slate-400 hover:text-slate-700 shrink-0 p-1 rounded transition-colors cursor-pointer"
                              title="Copy host"
                            >
                              {copiedKey === `${rec.id}-pre-name` ? (
                                <Check className="w-3.5 h-3.5 text-slate-900" strokeWidth={1.5} />
                              ) : (
                                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                              )}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-slate-700 break-all select-all">
                              {rec.content}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rec.content, `${rec.id}-pre-val`)}
                              className="text-slate-400 hover:text-slate-700 shrink-0 p-1 rounded transition-colors cursor-pointer"
                              title="Copy value"
                            >
                              {copiedKey === `${rec.id}-pre-val` ? (
                                <Check className="w-3.5 h-3.5 text-slate-900" strokeWidth={1.5} />
                              ) : (
                                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                              )}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 font-mono text-xs text-slate-600 tabular-nums">
                          {rec.priority !== undefined ? rec.priority : "—"}
                        </TableCell>
                        <TableCell className="text-right pr-5 py-3">
                          <span className="inline-flex items-center justify-end gap-1.5 font-mono text-xs text-slate-600">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                rec.verified ? "bg-slate-900" : "bg-amber-500"
                              )}
                            />
                            <span>{rec.verified ? "Verified" : dnsServiceActive ? "Auto-apply" : "Pending"}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
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
        <PageHeader
          title="Email Service"
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadAllMailData(true)}
                disabled={isRefreshing}
                className="h-9 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors"
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5 mr-2 text-slate-400", isRefreshing && "animate-spin")}
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
                Organizational Units
                <span className="ml-2 font-mono text-slate-400 tabular-nums">
                  {orgUnits.length + 1}
                </span>
              </Button>
            </>
          }
        />

        {/* Missing DNS Records Warning Banner */}
        {!isLoadingQuota && hasScannedDns && missingDnsRecords.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-amber-950">
                    Missing DNS Records ({missingDnsRecords.length} of {requiredDnsRecords.length} unverified)
                  </p>
                  <p className="text-xs text-amber-800">
                    Mail delivery and authentication may fail for {selectedOrg.domain} until these records are published.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {dnsServiceActive ? (
                  <Button
                    size="sm"
                    onClick={handleSyncDnsRecords}
                    disabled={isSyncingDns}
                    className="h-8 px-3 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none"
                  >
                    {isSyncingDns && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Add Missing Records
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSyncDnsRecords}
                    disabled={isSyncingDns}
                    className="h-8 px-3 border-amber-300 bg-white hover:bg-amber-50 text-amber-900 text-xs font-medium rounded-lg shadow-none"
                  >
                    {isSyncingDns && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Verify DNS
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
              {missingDnsRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-white/90 border border-amber-200/80 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-semibold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                        {rec.type}
                      </span>
                      <span className="font-medium text-slate-800 truncate">{rec.purpose}</span>
                    </div>
                    <p className="font-mono text-[11px] text-slate-500 truncate mt-0.5">
                      {rec.name} → {rec.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(rec.content, `warn-${rec.id}`)}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded shrink-0"
                    title="Copy value"
                  >
                    {copiedKey === `warn-${rec.id}` ? (
                      <Check className="w-3.5 h-3.5 text-slate-900" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Moment: Live domain routing & outbound quota ledger strip */}
        <div className="rounded-xl border border-slate-200/80 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Active Mailboxes</div>
            {isLoadingDirectory || !hasLoadedDirectory || isLoadingOrgs || authLoading ? (
              <div className="space-y-1.5 pt-1">
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-medium text-slate-900 tabular-nums">
                  {activeUsers.length}
                </div>
                <div className="text-xs font-mono text-slate-400 tabular-nums">
                  {groups.length} {groups.length === 1 ? "Group" : "Groups"} · {orgUnits.length + 1} Units
                </div>
              </>
            )}
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Monthly Outbound Quota</div>
            {isLoadingQuota ? (
              <div className="space-y-1.5 pt-1">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3.5 w-36" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-medium text-slate-900 tabular-nums">
                  {monthlySentCount.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-slate-400">
                    / {monthlyOutboundLimit.toLocaleString()}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 tabular-nums">
                  {(monthlyOutboundLimit - monthlySentCount).toLocaleString()} Remaining This Month
                </div>
              </>
            )}
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Daily Outbound Limit</div>
            {isLoadingQuota ? (
              <div className="space-y-1.5 pt-1">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ) : (
              <>
                <div className="text-2xl font-medium text-slate-900 tabular-nums">
                  {dailySentCount.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-slate-400">
                    / {dailyOutboundLimit.toLocaleString()}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 tabular-nums">
                  24-Hour Rolling Window
                </div>
              </>
            )}
          </div>

          <div className="p-4 sm:p-5 space-y-1">
            <div className="text-xs text-slate-500">Domain Routing Status</div>
            {isLoadingQuota ? (
              <div className="space-y-1.5 pt-1">
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-base font-medium text-slate-900 tabular-nums">
                    {verifiedDnsCount} of {requiredDnsRecords.length} DNS Verified
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 truncate">
                  {catchAllEmail ? `Catch-All → ${catchAllEmail}` : "Catch-All Disabled"}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Navigation tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="border-b border-slate-200/80 overflow-x-auto scrollbar-none">
            <TabsList className="bg-transparent p-0 h-auto gap-4 sm:gap-6 rounded-none inline-flex min-w-max">
              <TabsTrigger
                value="users"
                className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
              >
                Users Directory
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
                value="shared"
                className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
              >
                Shared Mailboxes
              </TabsTrigger>

              <TabsTrigger
                value="suspended"
                className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
              >
                Suspended Accounts
                <span className="ml-2 font-mono text-slate-400 tabular-nums">
                  {suspendedUsers.length + deletedUsers.length}
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="governance"
                className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
              >
                Governance &amp; Security
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
                      placeholder="Search accounts..."
                      className="h-9 pl-9 text-xs border-slate-200 bg-white rounded-lg"
                    />
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-9 px-3 text-xs font-medium rounded-lg shrink-0 gap-1.5",
                          selectedUserOu !== "ALL"
                            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                        title="Filter by Organizational Unit"
                      >
                        <Filter className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span className="hidden sm:inline">
                          {selectedUserOu === "ALL" ? "Filter Unit" : selectedUserOu}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 bg-white border border-slate-200 shadow-md rounded-xl p-1">
                      <DropdownMenuItem
                        onSelect={() => setSelectedUserOu("ALL")}
                        className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
                      >
                        <Check className={cn("w-3.5 h-3.5", selectedUserOu === "ALL" ? "opacity-100" : "opacity-0")} />
                        <span className="flex-1">All Organizational Units</span>
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
                            <span className="font-mono flex-1 truncate">{ouPath}</span>
                            <span className="font-mono text-[11px] opacity-70">{count}</span>
                          </DropdownMenuItem>
                        )
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setIsOuModalOpen(true)}
                        className="group gap-2 py-2 text-xs cursor-pointer rounded-md focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Manage Units</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {selectedUserOu !== "ALL" && (
                    <button
                      type="button"
                      onClick={() => setSelectedUserOu("ALL")}
                      className="inline-flex items-center gap-1 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md shrink-0"
                      title="Clear filter"
                    >
                      <span>{selectedUserOu}</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBulkImportErrors([])
                      setIsBulkImportOpen(true)
                    }}
                    className="h-9 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5 text-slate-400" strokeWidth={1.5} />
                    Import
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportUsersCsv}
                    disabled={users.length === 0}
                    className="h-9 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5 text-slate-400" strokeWidth={1.5} />
                    Export
                  </Button>
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
                    Add User
                  </Button>
                </div>
              </div>

              {/* Users table */}
              {isLoadingDirectory || !hasLoadedDirectory || isLoadingOrgs || authLoading ? (
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
                        Organizational Unit
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
                      ? "No Email Accounts Provisioned"
                      : "No Matching Email Accounts"}
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
                        Add User
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
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
                        Organizational Unit
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
                          <DropdownMenu>
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
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                    <span>All Units</span>
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
                    <span>New Unit</span>
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
                      placeholder="Search groups..."
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
                    Create Group
                  </Button>
                </div>
              </div>

              {filteredGroups.length === 0 ? (
                <div className="py-16 px-4 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-900">
                    {groups.length === 0 ? "No Distribution Groups Created" : "No Matching Distribution Groups"}
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
                        Create Group
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
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
                        Organizational Unit
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
                          <DropdownMenu>
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
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                    Suspended Accounts
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
                    placeholder="Search suspended accounts..."
                    className="h-9 pl-9 text-xs border-slate-200 bg-white rounded-lg"
                  />
                </div>
              </div>

              {filteredSuspendedUsers.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No Suspended Email Accounts
                </div>
              ) : (
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
                        Organizational Unit
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
                          <DropdownMenu>
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
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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

              {filteredDeletedUsers.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No deleted accounts in the 14-day recovery window
                </div>
              ) : (
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
          <TabsContent value="settings" className="space-y-6 mt-0">
            {/* Domain catch-all routing */}
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="p-6 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-headline font-semibold text-slate-900">
                    Domain Catch-All Routing
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
                    Fallback Account
                  </Label>
                  <Select
                    value={catchAllUserId || "NONE"}
                    disabled={isUpdatingCatchAll || activeUsers.length === 0}
                    onValueChange={(val) =>
                      handleCatchAllTargetChange(val === "NONE" ? null : val)
                    }
                  >
                    <SelectTrigger className="h-9 text-xs border-slate-200 bg-white rounded-lg">
                      <SelectValue placeholder="Select an Active Email Account" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="NONE" className="text-xs">
                        Disabled (Reject Unmatched Recipients)
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

            {/* Authentication & Deliverability Records (SPF, DKIM, DMARC) */}
            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
              <div className="p-6 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-headline font-semibold text-slate-900">
                      Authentication & Deliverability (SPF, DKIM, DMARC)
                    </h2>
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 tabular-nums">
                      {verifiedDnsCount} of {requiredDnsRecords.length} Verified
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    DNS records for MX inbound routing, SPF authorization, 2048-bit DKIM cryptographic signing, and DMARC policy on{" "}
                    <span className="font-mono text-slate-700">{selectedOrg.domain}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyAllRecords}
                    className="h-9 px-3 text-xs font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-none"
                  >
                    {copiedKey === "all-records" ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-slate-900" strokeWidth={1.5} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5 text-slate-400" strokeWidth={1.5} />
                        Copy All
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSyncDnsRecords}
                    disabled={isSyncingDns}
                    className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs shrink-0 transition-colors"
                  >
                    {isSyncingDns ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" strokeWidth={1.5} />
                        {dnsServiceActive ? "Syncing Deliverability Records" : "Verifying Deliverability"}
                      </>
                    ) : dnsServiceActive ? (
                      "Sync Deliverability Records"
                    ) : (
                      "Verify Deliverability"
                    )}
                  </Button>
                </div>
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
                  {isLoadingQuota || isSyncingDns ? (
                    [...Array(5)].map((_, idx) => (
                      <TableRow key={idx} className="border-b border-slate-100 last:border-0">
                        <TableCell className="pl-6 py-3.5">
                          <Skeleton className="h-3.5 w-36 bg-slate-100" />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <Skeleton className="h-4 w-12 bg-slate-100" />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <Skeleton className="h-3.5 w-44 bg-slate-100" />
                        </TableCell>
                        <TableCell className="py-3.5">
                          <Skeleton className="h-3.5 w-56 bg-slate-100" />
                        </TableCell>
                        <TableCell className="text-right pr-6 py-3.5">
                          <Skeleton className="h-3.5 w-16 ml-auto bg-slate-100" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    requiredDnsRecords.map((rec) => (
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
                              <Check className="w-3.5 h-3.5 text-slate-900" strokeWidth={1.5} />
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
                              <Check className="w-3.5 h-3.5 text-slate-900" strokeWidth={1.5} />
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
                              rec.verified ? "bg-slate-900" : "bg-amber-500"
                            )}
                          />
                          {rec.verified
                            ? "Verified"
                            : dnsServiceActive
                            ? "Pending Sync"
                            : "Unverified"}
                        </span>
                      </TableCell>
                    </TableRow>
                  )))}
                </TableBody>
              </Table>
            </div>

            {/* Enforce MFA Policy */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-headline font-semibold text-slate-900">
                  Enforce Multi-Factor Authentication (MFA)
                </h3>
                <p className="text-xs text-slate-500">
                  Require all users in {selectedOrg.domain} to enroll and verify 2-Step Verification (Authenticator App, Passkey, or Secondary Email) on sign-in to Revlet and Revlet Mail.
                </p>
              </div>
              <Switch
                checked={enforceMfa}
                disabled={isUpdatingEnforceMfa}
                onCheckedChange={(checked) => handleToggleEnforceMfa(checked)}
              />
            </div>

            {/* Service deactivation */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-headline font-semibold text-slate-900">
                  Deactivate Email Service
                </h3>
                <p className="text-xs text-slate-500">
                  Pause Email Service for {selectedOrg.domain}. Accounts, aliases, and groups remain saved in your directory.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeactivateConfirmOpen(true)}
                className="h-9 px-4 text-xs font-medium text-destructive border-slate-200 hover:bg-rose-50 hover:text-destructive rounded-lg shrink-0 transition-colors"
              >
                Deactivate Service
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="shared" className="mt-0">
            {selectedOrgId && (
              <EmailGovernancePanel orgId={selectedOrgId} domain={selectedOrg?.domain || ""} mode="shared" />
            )}
          </TabsContent>

          <TabsContent value="governance" className="mt-0">
            {selectedOrgId && (
              <EmailGovernancePanel orgId={selectedOrgId} domain={selectedOrg?.domain || ""} mode="quarantine" />
            )}
          </TabsContent>
        </Tabs>

        <StepUpMfaDialog
          open={mfaStepUpOpen}
          onOpenChange={setMfaStepUpOpen}
          actionLabel="Update Organization MFA Enforcement"
          onVerified={async (freshToken) => {
            if (pendingEnforceValue !== null) {
              await handleToggleEnforceMfa(pendingEnforceValue, freshToken)
              setPendingEnforceValue(null)
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
                Organizational Units
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create and manage organizational units for accounts and groups
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-4">
              <div className="space-y-3 bg-slate-50/70 p-4 rounded-lg border border-slate-200/80">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-700">Unit Name</Label>
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
                    Create Unit
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
                Create Email Account
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create an address and password for signing in to Revlet Mail
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
                    className="h-9 text-xs border-slate-200 rounded-lg"
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
                    className="h-9 text-xs border-slate-200 rounded-lg"
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
                  placeholder="8+ chars, letter & number/symbol"
                  className="h-9 text-xs border-slate-200 rounded-lg"
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
                Create Account
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
                onClick={handleResetUserPassword}
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
                    disabled={isMutatingAlias || !newAliasPrefix.trim()}
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
          <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200">
            <DialogHeader className="p-6 border-b border-slate-100">
              <DialogTitle className="font-headline font-semibold text-base text-slate-900">
                Create Group
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Create a shared group email address that forwards to multiple members
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
                  placeholder="Admissions"
                  className="h-9 text-xs border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Group Address</Label>
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
                <Label className="text-xs font-medium text-slate-700">Organizational Unit</Label>
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
                  Members (Optional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={newGroupMemberInput}
                    onChange={(e) => setNewGroupMemberInput(e.target.value)}
                    placeholder="member@example.com"
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
                Create Group
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
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-700">Member Address</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={groupMemberInput}
                    onChange={(e) => setGroupMemberInput(e.target.value)}
                    placeholder="user@example.com"
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
