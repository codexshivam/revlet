"use client"

import { useCallback, useEffect, useState } from "react"
import { useUser } from "@/firebase"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
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
  deleteSharedMailbox,
  exportSiemAuditLogs,
  type LegalHoldRecord,
  type DlpRuleRecord,
  type TransportRuleRecord,
  type QuarantineItemRecord,
  type SharedMailboxRecord,
  type AuditLogRecord,
} from "@/app/actions/email-governance"
import {
  Scale,
  ShieldAlert,
  Inbox,
  FileSearch,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  Lock,
  MailCheck,
  ScrollText,
} from "lucide-react"

interface EmailGovernancePanelProps {
  orgId: string
  domain: string
  mode?: "shared" | "quarantine" | "dlp" | "ediscovery" | "audit"
}

export function EmailGovernancePanel({ orgId, domain, mode }: EmailGovernancePanelProps) {
  const { user } = useUser()
  const [activeSection, setActiveSection] = useState<"shared" | "quarantine" | "dlp" | "ediscovery" | "audit">(
    mode || "quarantine"
  )
  useEffect(() => {
    if (mode) setActiveSection(mode)
  }, [mode])
  const [loading, setLoading] = useState(true)
  const [legalHolds, setLegalHolds] = useState<LegalHoldRecord[]>([])
  const [dlpRules, setDlpRules] = useState<DlpRuleRecord[]>([])
  const [transportRules, setTransportRules] = useState<TransportRuleRecord[]>([])
  const [quarantineItems, setQuarantineItems] = useState<QuarantineItemRecord[]>([])
  const [sharedMailboxes, setSharedMailboxes] = useState<SharedMailboxRecord[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([])

  // Step-Up MFA state
  const [stepUpToken, setStepUpToken] = useState<string | null>(null)
  const [mfaPromptOpen, setMfaPromptOpen] = useState(false)
  const [mfaActionLabel, setMfaActionLabel] = useState("")
  const [pendingAction, setPendingAction] = useState<((token: string) => Promise<void>) | null>(null)

  // Shared Mailbox form
  const [smDisplayName, setSmDisplayName] = useState("")
  const [smLocalPart, setSmLocalPart] = useState("")
  const [smDelegateEmail, setSmDelegateEmail] = useState("")
  const [smDelegateAccess, setSmDelegateAccess] = useState<"FULL_ACCESS" | "SEND_AS" | "READ_ONLY">("FULL_ACCESS")

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
    try {
      const idToken = await user.getIdToken()
      const res = await getGovernanceOverview(idToken, orgId)
      if (res.success && res.data) {
        setLegalHolds(res.data.legalHolds)
        setDlpRules(res.data.dlpRules)
        setTransportRules(res.data.transportRules)
        setQuarantineItems(res.data.quarantineItems)
        setSharedMailboxes(res.data.sharedMailboxes)
        setAuditLogs(res.data.auditLogs)
      }
    } catch {
      // ignore
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

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading enterprise governance & compliance controls...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Segmented Governance Navigation (omitted when rendered in standalone Shared Mailboxes tab) */}
      {mode !== "shared" && (
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1">
          {(
            [
              {
                id: "quarantine",
                label: "Quarantine",
                count: quarantineItems.filter((q) => q.status === "quarantined").length,
                icon: ShieldAlert,
              },
              { id: "dlp", label: "DLP & Mail Flow", count: dlpRules.length + transportRules.length, icon: Lock },
              { id: "ediscovery", label: "eDiscovery & Legal Hold", count: legalHolds.length, icon: Scale },
              { id: "audit", label: "SIEM & Audit Logs", icon: ScrollText },
            ] as const
          ).map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-white text-slate-900 border border-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 border border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-slate-700" : "text-slate-400"}`} strokeWidth={1.5} />
                <span>{item.label}</span>
                {"count" in item && typeof item.count === "number" && (
                  <span className="font-mono text-[11px] tabular-nums text-slate-400">
                    {item.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {activeSection === "shared" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1 border-slate-200/80 shadow-none">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-medium text-slate-900 flex items-center gap-2">
                <MailCheck className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                Create Shared Mailbox
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Provision a delegated team mailbox (distinct from distribution lists)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Display Name</Label>
                <Input
                  value={smDisplayName}
                  onChange={(e) => setSmDisplayName(e.target.value)}
                  placeholder="Support Desk"
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Email Address</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    value={smLocalPart}
                    onChange={(e) => setSmLocalPart(e.target.value)}
                    placeholder="support"
                    className="h-8 text-xs"
                  />
                  <span className="text-xs font-mono text-muted-foreground">@{domain}</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">Initial Delegate Email</Label>
                <Input
                  value={smDelegateEmail}
                  onChange={(e) => setSmDelegateEmail(e.target.value)}
                  placeholder={`alice@${domain}`}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Delegate Access Level</Label>
                <Select value={smDelegateAccess} onValueChange={(v) => setSmDelegateAccess(v as any)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_ACCESS">Full Access (Read & Manage)</SelectItem>
                    <SelectItem value="SEND_AS">Send As</SelectItem>
                    <SelectItem value="READ_ONLY">Read Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={busy || !user}
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
                    toast({ title: "Shared Mailbox Created" })
                    await loadData()
                  } catch (err: any) {
                    toast({ variant: "destructive", title: "Error", description: err?.message })
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create Shared Mailbox
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Active Shared Mailboxes ({sharedMailboxes.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {sharedMailboxes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No shared mailboxes provisioned yet.</p>
              ) : (
                sharedMailboxes.map((sm) => (
                  <div key={sm.id} className="p-3 rounded-lg border flex items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{sm.displayName}</span>
                        <span className="text-xs font-mono text-muted-foreground">{sm.email}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sm.delegates.map((d, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px]">
                            {d.email} ({d.accessLevel})
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        runWithStepUp(`Delete shared mailbox ${sm.email}`, async (tok) => {
                          const idToken = await user!.getIdToken()
                          return deleteSharedMailbox(idToken, orgId, sm.id, tok)
                        })
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "quarantine" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-600" />
              Spam & DLP Quarantine Console ({quarantineItems.filter((q) => q.status === "quarantined").length} pending)
            </CardTitle>
            <CardDescription className="text-xs">
              Review held messages flagged by DLP, phishing, or attachment rules. Release or delete requires Step-Up MFA.
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
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                Data Loss Prevention (DLP) Rules
              </CardTitle>
              <CardDescription className="text-xs">
                Inspect outbound mail for sensitive patterns (SSN, Credit Cards, API Keys, Regex).
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
                <Lock className="w-3.5 h-3.5 mr-1.5" /> Add DLP Rule
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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-indigo-600" />
                Transport & Mail Flow Rules
              </CardTitle>
              <CardDescription className="text-xs">
                Enforce org disclaimers, external moderation, URL sandboxing, and attachment blocking.
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
                    <SelectItem value="sandbox_urls">Sandbox External URLs</SelectItem>
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
                <Lock className="w-3.5 h-3.5 mr-1.5" /> Add Transport Rule
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
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Scale className="w-4 h-4 text-purple-600" />
                Place Litigation / Legal Hold
              </CardTitle>
              <CardDescription className="text-xs">
                Freezes matching mailboxes from the 21-day purge engine and org deletion.
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
                  <Label className="text-xs">Custodian Emails (comma-separated)</Label>
                  <Input
                    value={holdCustodians}
                    onChange={(e) => setHoldCustodians(e.target.value)}
                    placeholder={`alice@${domain}, bob@${domain}`}
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
                <Lock className="w-3.5 h-3.5 mr-1.5" /> Activate Legal Hold
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-blue-600" />
                  Active Legal Holds & eDiscovery Export
                </CardTitle>
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
                        {h.holdAllMailboxes ? "All organization mailboxes frozen" : `Custodians: ${h.custodianEmails.join(", ")}`} · {h.reason}
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
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Persistent SIEM & Security Audit Logs</CardTitle>
                <CardDescription className="text-xs">
                  Immutable Firestore-backed audit trail across auth, MFA, DLP, quarantine, legal holds, and mail actions.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  placeholder="Filter actor or action..."
                  className="h-8 text-xs w-44"
                />
                {(["json", "ndjson", "csv", "cef"] as const).map((fmt) => (
                  <Button
                    key={fmt}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs uppercase"
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
                    <Download className="w-3 h-3 mr-1" /> {fmt}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[460px] overflow-y-auto">
            {auditLogs
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
              ))}
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
