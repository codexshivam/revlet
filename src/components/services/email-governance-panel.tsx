"use client"

import { useCallback, useEffect, useState } from "react"
import { useUser } from "@/firebase"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { StepUpMfaDialog } from "@/components/security/step-up-mfa-dialog"
import {
  getGovernanceOverview,
  createLegalHold,
  releaseLegalHold,
  exportEDiscoveryBundle,
  saveDlpRule,
  deleteDlpRule,
  saveTransportRule,
  deleteTransportRule,
  resolveQuarantineItem,
  createSharedMailbox,
  updateSharedMailboxDelegates,
  deleteSharedMailbox,
  exportSiemAuditLogs,
  type LegalHoldRecord,
  type DlpRuleRecord,
  type TransportRuleRecord,
  type QuarantineItemRecord,
  type SharedMailboxRecord,
  type SharedMailboxDelegate,
  type AuditLogRecord,
} from "@/app/actions/email-governance"
import {
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  Search,
} from "lucide-react"

const sharedAccessLabels: Record<SharedMailboxDelegate["accessLevel"], string> = {
  FULL_ACCESS: "Read and send",
  SEND_AS: "Send only",
  READ_ONLY: "Read only",
}

interface EmailGovernancePanelProps {
  orgId: string
  domain: string
  mode?: "shared" | "quarantine" | "dlp" | "ediscovery" | "audit"
}

export function EmailGovernancePanel({ orgId, domain, mode }: EmailGovernancePanelProps) {
  const { user } = useUser()
  const [requestedSection, setActiveSection] = useState<"shared" | "quarantine" | "dlp" | "ediscovery" | "audit">(
    mode || "quarantine"
  )
  useEffect(() => {
    if (mode) setActiveSection(mode)
  }, [mode])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<{
    canEmailAdmin: boolean
    canSecurityAdmin: boolean
    canComplianceAdmin: boolean
  } | null>(null)
  const [legalHolds, setLegalHolds] = useState<LegalHoldRecord[]>([])
  const [dlpRules, setDlpRules] = useState<DlpRuleRecord[]>([])
  const [transportRules, setTransportRules] = useState<TransportRuleRecord[]>([])
  const [quarantineItems, setQuarantineItems] = useState<QuarantineItemRecord[]>([])
  const [sharedMailboxes, setSharedMailboxes] = useState<SharedMailboxRecord[]>([])
  const [domainUsers, setDomainUsers] = useState<Array<{ email: string; displayName: string }>>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([])

  // Step-Up MFA state
  const [stepUpToken, setStepUpToken] = useState<string | null>(null)
  const [mfaPromptOpen, setMfaPromptOpen] = useState(false)
  const [mfaActionLabel, setMfaActionLabel] = useState("")
  const [pendingAction, setPendingAction] = useState<((token: string) => Promise<void>) | null>(null)

  // Shared Mailbox modal & search state
  const [isAddSharedOpen, setIsAddSharedOpen] = useState(false)
  const [sharedSearchQuery, setSharedSearchQuery] = useState("")
  const [smDisplayName, setSmDisplayName] = useState("")
  const [smLocalPart, setSmLocalPart] = useState("")
  const [smDelegateEmail, setSmDelegateEmail] = useState("")
  const [smDelegateAccess, setSmDelegateAccess] = useState<"FULL_ACCESS" | "SEND_AS" | "READ_ONLY">("FULL_ACCESS")
  const [deletingSharedMailbox, setDeletingSharedMailbox] = useState<SharedMailboxRecord | null>(null)
  const [editingSharedMailbox, setEditingSharedMailbox] = useState<SharedMailboxRecord | null>(null)
  const [editingDelegates, setEditingDelegates] = useState<SharedMailboxDelegate[]>([])
  const [newDelegateEmail, setNewDelegateEmail] = useState("")
  const [newDelegateAccess, setNewDelegateAccess] = useState<"FULL_ACCESS" | "SEND_AS" | "READ_ONLY">("FULL_ACCESS")
  const [showNewDelegateSuggestions, setShowNewDelegateSuggestions] = useState(false)
  const [showSmDelegateSuggestions, setShowSmDelegateSuggestions] = useState(false)

  const activeDomainUserSet = new Set(domainUsers.map((u) => u.email.toLowerCase()))
  const getDelegateValidationError = (rawEmail: string, selfEmail?: string) => {
    const clean = rawEmail.trim().toLowerCase()
    if (!clean) return null
    if (!clean.includes("@")) return "Enter a valid email address."
    if (domain && !clean.endsWith(`@${domain.toLowerCase()}`)) {
      return `Must belong to @${domain}.`
    }
    if (selfEmail && clean === selfEmail.toLowerCase()) {
      return "Shared mailbox cannot be its own delegate."
    }
    if (domainUsers.length > 0 && !activeDomainUserSet.has(clean)) {
      return `No active user found with this email in @${domain || "your domain"}.`
    }
    return null
  }
  const filterDomainUserSuggestions = (query: string, excludedEmails: string[] = []) => {
    const q = query.trim().toLowerCase()
    const excluded = new Set(excludedEmails.map((e) => e.toLowerCase()))
    return domainUsers
      .filter((u) => !excluded.has(u.email.toLowerCase()))
      .filter(
        (u) =>
          !q ||
          u.email.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q)
      )
      .slice(0, 6)
  }

  // Legal Hold form
  const [holdMatter, setHoldMatter] = useState("")
  const [holdCustodians, setHoldCustodians] = useState("")
  const [holdAll, setHoldAll] = useState(false)
  const [holdReason, setHoldReason] = useState("")
  const [eDiscoveryQuery, setEDiscoveryQuery] = useState("")

  // DLP Rule form
  const [dlpName, setDlpName] = useState("")
  const [dlpType, setDlpType] = useState<DlpRuleRecord["patternType"]>("ssn")
  const [dlpPattern, setDlpPattern] = useState("")
  const [dlpAction, setDlpAction] = useState<DlpRuleRecord["action"]>("quarantine")

  // Transport Rule form
  const [trName, setTrName] = useState("")
  const [trType, setTrType] = useState<TransportRuleRecord["ruleType"]>("append_disclaimer")
  const [trConfig, setTrConfig] = useState("")

  // Audit filter
  const [auditFilter, setAuditFilter] = useState("")
  const [busy, setBusy] = useState(false)

  const loadData = useCallback(async () => {
    if (!user || !orgId) return
    setLoading(true)
    setLoadError(null)
    try {
      const idToken = await user.getIdToken()
      const res = await getGovernanceOverview(idToken, orgId)
      if (res.success && res.data) {
        setCapabilities(res.data.capabilities)
        setLegalHolds(res.data.legalHolds)
        setDlpRules(res.data.dlpRules)
        setTransportRules(res.data.transportRules)
        setQuarantineItems(res.data.quarantineItems)
        setSharedMailboxes(res.data.sharedMailboxes)
        setDomainUsers(Array.isArray(res.data.domainUsers) ? res.data.domainUsers : [])
        setAuditLogs(res.data.auditLogs)
      } else {
        setLoadError(res.error || "Could not load governance data for this organization.")
      }
    } catch {
      setLoadError("Could not load governance data for this organization.")
    } finally {
      setLoading(false)
    }
  }, [user, orgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const runWithStepUp = async (
    label: string,
    fn: (tokenToUse: string) => Promise<{ success: boolean; error?: string }>
  ) => {
    const activeToken = stepUpToken || ""
    setBusy(true)
    try {
      const res = await fn(activeToken)
      if (!res.success && res.error?.includes("MFA_STEP_UP_REQUIRED")) {
        setMfaActionLabel(label)
        setPendingAction(() => async (freshToken: string) => {
          setStepUpToken(freshToken)
          const retry = await fn(freshToken)
          if (!retry.success) {
            toast({ variant: "destructive", title: "Action Failed", description: retry.error })
          } else {
            await loadData()
          }
        })
        setMfaPromptOpen(true)
        return
      }
      if (!res.success) {
        toast({ variant: "destructive", title: "Action Failed", description: res.error })
        return
      }
      await loadData()
    } finally {
      setBusy(false)
    }
  }

  const downloadFile = (filename: string, content: string, mime = "application/json") => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredSharedMailboxes = sharedMailboxes.filter((sm) => {
    const q = sharedSearchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      sm.displayName.toLowerCase().includes(q) ||
      sm.email.toLowerCase().includes(q) ||
      sm.delegates.some((d) => d.email.toLowerCase().includes(q))
    )
  })

  if (loadError) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <p>{/unauthorized|insufficient|access denied/i.test(loadError) ? "Ask your workspace administrator for access to these email tools." : loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void loadData()}>Retry</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {mode !== "shared" && (
          <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1">
            <Skeleton className="h-7 w-24 rounded-lg" />
            <Skeleton className="h-7 w-28 rounded-lg" />
            <Skeleton className="h-7 w-36 rounded-lg" />
            <Skeleton className="h-7 w-32 rounded-lg" />
          </div>
        )}
        <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 bg-slate-50/40 flex items-center justify-between gap-4">
            <Skeleton className="h-8 w-56 rounded-lg" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (mode === "shared" && !capabilities?.canEmailAdmin) {
    return <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">An email administrator can manage shared inboxes in this workspace.</p>
  }

  const securitySections = [
    { id: "quarantine", label: "Held messages", available: capabilities?.canEmailAdmin || capabilities?.canSecurityAdmin },
    { id: "dlp", label: "Mail protection rules", available: capabilities?.canEmailAdmin || capabilities?.canSecurityAdmin },
    { id: "ediscovery", label: "Legal holds & discovery", available: capabilities?.canComplianceAdmin },
    { id: "audit", label: "Activity log", available: capabilities?.canSecurityAdmin || capabilities?.canComplianceAdmin },
  ] as const
  const visibleSections = securitySections.filter((section) => section.available)
  const activeSection = mode === "shared"
    ? "shared"
    : visibleSections.find((section) => section.id === requestedSection)?.id || visibleSections[0]?.id

  const openCreateInbox = () => {
    setSmDisplayName("")
    setSmLocalPart("")
    setSmDelegateEmail("")
    setSmDelegateAccess("FULL_ACCESS")
    setIsAddSharedOpen(true)
  }

  return (
    <div className="space-y-4">
      {mode !== "shared" && (
        <div role="group" aria-label="Security and compliance tools" className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          {visibleSections.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              variant={activeSection === id ? "outline" : "ghost"}
              aria-pressed={activeSection === id}
              onClick={() => setActiveSection(id)}
              className="min-h-11 text-sm"
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {activeSection === "shared" && (
        <>
          <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200/80 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2 className="text-base font-semibold text-zinc-950">
                  Shared inboxes
                  <span className="ml-2 font-mono text-xs text-slate-400 tabular-nums">
                    {sharedMailboxes.length}
                  </span>
                </h2>
                <p className="text-sm text-zinc-600">
                  Give people access to one team inbox, such as support@ or billing@.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    strokeWidth={1.5}
                  />
                  <Input
                    value={sharedSearchQuery}
                    onChange={(e) => setSharedSearchQuery(e.target.value)}
                    aria-label="Search shared inboxes"
                    placeholder="Search shared inboxes"
                    className="min-h-11 pl-9 text-base sm:text-sm border-slate-200 bg-white rounded-lg"
                  />
                </div>
                <Button onClick={openCreateInbox} className="min-h-11 w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                  Add shared inbox
                </Button>
              </div>
            </div>

            {filteredSharedMailboxes.length === 0 ? (
              <div className="py-16 px-4 text-center space-y-2">
                <p className="text-sm font-medium text-slate-900">
                  {sharedMailboxes.length === 0 ? "No shared inboxes yet" : "No matching shared inboxes"}
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {sharedMailboxes.length === 0
                    ? "Create an inbox your team can read and reply from together."
                    : "Try a different name, address, or team member."}
                </p>
                {sharedMailboxes.length === 0 && (
                  <div className="pt-2">
                    <Button
                      size="sm"
                      onClick={openCreateInbox}
                      className="bg-primary hover:bg-primary/95 !text-white text-white font-medium h-9 px-4 rounded-lg text-xs"
                    >
                      <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                      Add shared inbox
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {filteredSharedMailboxes.map((mailbox) => (
                  <li key={mailbox.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-zinc-950">{mailbox.displayName}</p>
                      <p className="break-all text-sm text-zinc-600">{mailbox.email}</p>
                    </div>
                    <div className="min-w-0 text-sm text-zinc-600">
                      <p>{mailbox.delegates.length ? `${mailbox.delegates.length} ${mailbox.delegates.length === 1 ? "person has" : "people have"} access` : "No one has access yet"}</p>
                      {mailbox.delegates.length === 1 && <p className="break-all text-xs">{mailbox.delegates[0].email} · {sharedAccessLabels[mailbox.delegates[0].accessLevel]}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() => {
                          setEditingSharedMailbox(mailbox)
                          setEditingDelegates([...mailbox.delegates])
                          setNewDelegateEmail("")
                          setNewDelegateAccess("FULL_ACCESS")
                        }}
                      >
                        Manage access
                      </Button>
                      <Button variant="ghost" size="icon" className="size-11 text-destructive" aria-label={`Delete ${mailbox.email}`} onClick={() => setDeletingSharedMailbox(mailbox)}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AlertDialog open={Boolean(deletingSharedMailbox)} onOpenChange={(open) => { if (!open) setDeletingSharedMailbox(null) }}>
            <AlertDialogContent className="max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete shared inbox?</AlertDialogTitle>
                <AlertDialogDescription>
                  People will lose access to <span className="break-all font-medium">{deletingSharedMailbox?.email}</span>. Delete this inbox only if your team no longer needs it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
                  disabled={busy}
                  onClick={() => {
                    const mailbox = deletingSharedMailbox
                    if (!mailbox || !user) return
                    void runWithStepUp(`Delete shared inbox ${mailbox.email}`, async (token) => {
                      const idToken = await user.getIdToken()
                      return deleteSharedMailbox(idToken, orgId, mailbox.id, token)
                    })
                  }}
                >
                  Delete inbox
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog open={isAddSharedOpen} onOpenChange={setIsAddSharedOpen}>
            <DialogContent className="max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] overflow-y-auto rounded-xl bg-white sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold text-slate-900">
                  Add shared inbox
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Choose an address and give the first person permission to use the inbox.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <div>
                  <Label htmlFor="shared-inbox-name" className="text-sm">Inbox name</Label>
                  <Input
                    id="shared-inbox-name"
                    value={smDisplayName}
                    onChange={(e) => setSmDisplayName(e.target.value)}
                    placeholder="Support Desk"
                    className="mt-1 min-h-11 text-base sm:text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="shared-inbox-address" className="text-sm">Email address</Label>
                  <div className="mt-1 flex flex-col gap-1.5 sm:flex-row sm:items-center">
                    <Input
                      id="shared-inbox-address"
                      value={smLocalPart}
                      onChange={(e) => setSmLocalPart(e.target.value)}
                      placeholder="support"
                      className="min-h-11 text-base sm:text-sm"
                    />
                    <span className="text-xs font-mono text-muted-foreground break-all">
                      @{domain || "example.com"}
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <Label htmlFor="shared-inbox-person" className="text-sm">First person with access</Label>
                  <Input
                    id="shared-inbox-person"
                    value={smDelegateEmail}
                    onFocus={() => setShowSmDelegateSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSmDelegateSuggestions(false), 150)}
                    onChange={(e) => {
                      setSmDelegateEmail(e.target.value)
                      setShowSmDelegateSuggestions(true)
                    }}
                    placeholder={`Search user in @${domain || "domain.com"}...`}
                    className="mt-1 min-h-11 text-base sm:text-sm"
                  />
                  {showSmDelegateSuggestions && (() => {
                    const smEmail = smLocalPart.trim() && domain ? `${smLocalPart.trim().toLowerCase()}@${domain.toLowerCase()}` : ""
                    const suggestions = filterDomainUserSuggestions(smDelegateEmail, smEmail ? [smEmail] : [])
                    if (suggestions.length === 0) return null
                    return (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
                        {suggestions.map((u) => (
                          <button
                            key={u.email}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setSmDelegateEmail(u.email)
                              setShowSmDelegateSuggestions(false)
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between gap-2"
                          >
                            <span className="text-xs font-medium text-slate-800 truncate">{u.displayName}</span>
                            <span className="text-[11px] font-mono text-slate-500 truncate">{u.email}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                  {smDelegateEmail.trim() && getDelegateValidationError(smDelegateEmail) && (
                    <p className="text-[11px] text-rose-600 mt-1">
                      {getDelegateValidationError(smDelegateEmail)}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="shared-inbox-access" className="text-sm">What can they do?</Label>
                  <Select value={smDelegateAccess} onValueChange={(v) => setSmDelegateAccess(v as SharedMailboxDelegate["accessLevel"])}>
                    <SelectTrigger id="shared-inbox-access" className="mt-1 min-h-11 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL_ACCESS">Read and send</SelectItem>
                      <SelectItem value="SEND_AS">Send only</SelectItem>
                      <SelectItem value="READ_ONLY">Read only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddSharedOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={
                    busy ||
                    !user ||
                    !smDisplayName.trim() ||
                    !smLocalPart.trim() ||
                    Boolean(smDelegateEmail.trim() && getDelegateValidationError(smDelegateEmail))
                  }
                  onClick={async () => {
                    if (!user) return
                    setBusy(true)
                    try {
                      const idToken = await user.getIdToken()
                      const res = await createSharedMailbox(idToken, orgId, {
                        displayName: smDisplayName,
                        localPart: smLocalPart,
                        delegates: smDelegateEmail.trim()
                          ? [{ email: smDelegateEmail.trim(), accessLevel: smDelegateAccess }]
                          : [],
                      })
                      if (!res.success) throw new Error(res.error)
                      setSmDisplayName("")
                      setSmLocalPart("")
                      setSmDelegateEmail("")
                      setIsAddSharedOpen(false)
                      toast({ title: "Shared Mailbox Created" })
                      await loadData()
                    } catch (err: any) {
                      toast({ variant: "destructive", title: "Error", description: err?.message })
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className="bg-primary hover:bg-primary/95 !text-white text-white text-xs"
                >
                  Create shared inbox
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeSection === "quarantine" && (
        <Card className="border-slate-200/80 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-900">
              Held messages ({quarantineItems.filter((q) => q.status === "quarantined").length} pending)
            </CardTitle>
            <CardDescription className="text-xs">
              Review messages held because they may contain unsafe content or sensitive information. Verify your identity to release or delete a message.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {quarantineItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Quarantine queue is empty.</p>
            ) : (
              quarantineItems.map((item) => (
                <div key={item.id} className="p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={item.status === "quarantined" ? "destructive" : "secondary"} className="text-[10px]">
                        {item.reason} ({item.score})
                      </Badge>
                      <span className="text-xs font-semibold truncate">{item.subject}</span>
                      <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      From: <span className="font-mono">{item.sender}</span> → {item.recipients.join(", ")} · Rule: {item.matchedRule}
                    </p>
                  </div>
                  {item.status === "quarantined" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          runWithStepUp("Release quarantined message", async (tok) => {
                            const idToken = await user!.getIdToken()
                            return resolveQuarantineItem(idToken, orgId, item.id, "released", tok)
                          })
                        }
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                        Release
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          runWithStepUp("Permanently delete quarantined message", async (tok) => {
                            const idToken = await user!.getIdToken()
                            return resolveQuarantineItem(idToken, orgId, item.id, "deleted", tok)
                          })
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {activeSection === "dlp" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {capabilities?.canSecurityAdmin && (
          <Card className="border-slate-200/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-900">
                Protect sensitive information
              </CardTitle>
              <CardDescription className="text-xs">
                Check outgoing email for sensitive information such as card numbers or API keys.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input value={dlpName} onChange={(e) => setDlpName(e.target.value)} placeholder="Rule name" className="h-8 text-xs" />
                <Select value={dlpType} onValueChange={(v) => setDlpType(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssn">US SSN Pattern</SelectItem>
                    <SelectItem value="credit_card">Credit Card (PAN)</SelectItem>
                    <SelectItem value="api_key">API / Secret Key</SelectItem>
                    <SelectItem value="keyword">Keyword Match</SelectItem>
                    <SelectItem value="regex">Custom Regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={dlpPattern}
                  onChange={(e) => setDlpPattern(e.target.value)}
                  placeholder="Keyword or regex (if custom)"
                  className="h-8 text-xs"
                />
                <Select value={dlpAction} onValueChange={(v) => setDlpAction(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quarantine">Quarantine & Alert</SelectItem>
                    <SelectItem value="block">Block Delivery</SelectItem>
                    <SelectItem value="warn_audit">Allow + Log Audit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  runWithStepUp("Create DLP rule", async (tok) => {
                    const idToken = await user!.getIdToken()
                    const res = await saveDlpRule(idToken, orgId, {
                      name: dlpName,
                      patternType: dlpType,
                      patternValue: dlpPattern,
                      action: dlpAction,
                    }, tok)
                    if (res.success) {
                      setDlpName("")
                      setDlpPattern("")
                      toast({ title: "DLP Rule Saved" })
                    }
                    return res
                  })
                }
              >
                Add protection rule
              </Button>
              <div className="space-y-2 pt-2 border-t">
                {dlpRules.map((r) => (
                  <div key={r.id} className="p-2.5 rounded border flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold">{r.name}</span>{" "}
                      <Badge variant="outline" className="text-[10px]">{r.patternType} → {r.action}</Badge>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() =>
                        runWithStepUp("Delete DLP rule", async (tok) => {
                          const idToken = await user!.getIdToken()
                          return deleteDlpRule(idToken, orgId, r.id, tok)
                        })
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          )}

          <Card className="border-slate-200/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-900">
                Rules for handling email
              </CardTitle>
              <CardDescription className="text-xs">
                Add disclaimers, block attachment types, or control how external messages are handled.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input value={trName} onChange={(e) => setTrName(e.target.value)} placeholder="Rule name" className="h-8 text-xs" />
                <Select value={trType} onValueChange={(v) => setTrType(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="append_disclaimer">Append Legal Disclaimer</SelectItem>
                    <SelectItem value="block_attachment_ext">Block Attachment Extensions</SelectItem>
                    <SelectItem value="sandbox_urls">Harden External Links (noopener/noreferrer)</SelectItem>
                    <SelectItem value="moderate_external">Moderate External Mail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                value={trConfig}
                onChange={(e) => setTrConfig(e.target.value)}
                placeholder="Disclaimer text or comma-separated extensions (.exe,.bat)"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                onClick={() =>
                  runWithStepUp("Create Transport rule", async (tok) => {
                    const idToken = await user!.getIdToken()
                    const res = await saveTransportRule(idToken, orgId, {
                      name: trName,
                      ruleType: trType,
                      configValue: trConfig,
                    }, tok)
                    if (res.success) {
                      setTrName("")
                      setTrConfig("")
                      toast({ title: "Transport Rule Saved" })
                    }
                    return res
                  })
                }
              >
                Add mail rule
              </Button>
              <div className="space-y-2 pt-2 border-t">
                {transportRules.map((r) => (
                  <div key={r.id} className="p-2.5 rounded border flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold">{r.name}</span>{" "}
                      <Badge variant="outline" className="text-[10px]">{r.ruleType}</Badge>
                      {r.configValue && <p className="text-[11px] text-muted-foreground truncate">{r.configValue}</p>}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive shrink-0"
                      onClick={() =>
                        runWithStepUp("Delete Transport rule", async (tok) => {
                          const idToken = await user!.getIdToken()
                          return deleteTransportRule(idToken, orgId, r.id, tok)
                        })
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "ediscovery" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1 border-slate-200/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-900">
                Place Litigation / Legal Hold
              </CardTitle>
              <CardDescription className="text-xs">
                Freezes matching mailboxes from the 21-day purge engine and organization deletion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Matter / Case Name</Label>
                <Input value={holdMatter} onChange={(e) => setHoldMatter(e.target.value)} placeholder="Case #2026-041" className="h-8 text-xs mt-1" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Hold All Org Mailboxes</Label>
                <Switch checked={holdAll} onCheckedChange={setHoldAll} />
              </div>
              {!holdAll && (
                <div>
                  <Label className="text-xs">Email addresses to preserve (separated by commas)</Label>
                  <Input
                    value={holdCustodians}
                    onChange={(e) => setHoldCustodians(e.target.value)}
                    placeholder="alice@example.com, bob@example.com"
                    className="h-8 text-xs mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">Reason</Label>
                <Input value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Pending legal discovery" className="h-8 text-xs mt-1" />
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() =>
                  runWithStepUp("Place Legal Hold", async (tok) => {
                    const idToken = await user!.getIdToken()
                    const res = await createLegalHold(idToken, orgId, {
                      matterName: holdMatter,
                      holdAllMailboxes: holdAll,
                      custodianEmails: holdCustodians.split(",").map((s) => s.trim()).filter(Boolean),
                      reason: holdReason,
                    }, tok)
                    if (res.success) {
                      setHoldMatter("")
                      setHoldCustodians("")
                      setHoldReason("")
                      toast({ title: "Legal Hold Activated" })
                    }
                    return res
                  })
                }
              >
                Activate Legal Hold
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border-slate-200/80 shadow-none">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-medium text-slate-900">
                    Active Legal Holds & Governance Metadata Export
                  </CardTitle>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Exports hold records, audit events (up to 500), and quarantined evidence (up to 200). Live mailbox contents are not included.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={eDiscoveryQuery}
                    onChange={(e) => setEDiscoveryQuery(e.target.value)}
                    placeholder="Filter eDiscovery query..."
                    className="h-8 text-xs w-48"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    onClick={() =>
                      runWithStepUp("Export eDiscovery evidence bundle", async (tok) => {
                        const idToken = await user!.getIdToken()
                        const res = await exportEDiscoveryBundle(idToken, orgId, eDiscoveryQuery, tok)
                        if (res.success && res.data) {
                          downloadFile(`ediscovery-${orgId}-${Date.now()}.json`, JSON.stringify(res.data, null, 2))
                          toast({ title: "eDiscovery Bundle Exported" })
                        }
                        return res
                      })
                    }
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export Bundle
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {legalHolds.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No legal holds configured.</p>
              ) : (
                legalHolds.map((h) => (
                  <div key={h.id} className="p-3 rounded-lg border flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{h.matterName}</span>
                        <Badge variant={h.status === "active" ? "destructive" : "secondary"} className="text-[10px]">
                          {h.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {h.holdAllMailboxes ? "All organization mailboxes frozen" : `Protected addresses: ${h.custodianEmails.join(", ")}`} · {h.reason}
                      </p>
                    </div>
                    {h.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          runWithStepUp(`Release Legal Hold (${h.matterName})`, async (tok) => {
                            const idToken = await user!.getIdToken()
                            return releaseLegalHold(idToken, orgId, h.id, tok)
                          })
                        }
                      >
                        Release Hold
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "audit" && (
        <Card className="border-slate-200/80 shadow-none">
          <CardHeader className="p-5 pb-4 border-b border-slate-100">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <CardTitle className="text-sm font-medium text-slate-900">
                  Security activity log
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Review recorded sign-ins, policy changes, held messages, and email administration activity.
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
                <div className="relative w-full sm:w-56">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    strokeWidth={1.5}
                  />
                  <Input
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                    placeholder="Filter actor or action..."
                    className="h-8 pl-8 text-xs border-slate-200 bg-white rounded-lg"
                  />
                </div>
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/60 p-0.5 shrink-0">
                  {(["json", "ndjson", "csv", "cef"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-medium uppercase text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs transition-all"
                      onClick={() =>
                        runWithStepUp(`Export SIEM Audit Logs (${fmt.toUpperCase()})`, async (tok) => {
                          const idToken = await user!.getIdToken()
                          const res = await exportSiemAuditLogs(idToken, orgId, fmt, tok)
                          if (res.success && typeof res.content === "string") {
                            downloadFile(`siem-audit-${orgId}.${fmt === "cef" ? "log" : fmt}`, res.content, "text/plain")
                            toast({ title: `Exported ${res.count} events (${fmt.toUpperCase()})` })
                          }
                          return res
                        })
                      }
                    >
                      <Download className="w-3 h-3 text-slate-500" />
                      <span>{fmt}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-1.5 max-h-[460px] overflow-y-auto">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No audit events recorded yet.</p>
            ) : (
              auditLogs
                .filter(
                  (l) =>
                    !auditFilter.trim() ||
                    `${l.action} ${l.actorEmail || ""} ${l.target}`.toLowerCase().includes(auditFilter.toLowerCase())
                )
                .map((log) => (
                  <div key={log.id} className="p-2.5 rounded border bg-muted/20 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">{log.action}</Badge>
                        <span className="font-medium truncate">{log.actorEmail || log.actorUid}</span>
                        <span className="text-muted-foreground font-mono truncate">→ {log.target}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      )}

      <StepUpMfaDialog
        open={mfaPromptOpen}
        onOpenChange={setMfaPromptOpen}
        actionLabel={mfaActionLabel}
        onVerified={async (freshToken) => {
          if (pendingAction) {
            await pendingAction(freshToken)
            setPendingAction(null)
          }
        }}
      />
    </div>
  )
}
