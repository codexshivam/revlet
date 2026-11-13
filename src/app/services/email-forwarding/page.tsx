"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useUser } from "@/firebase"
import Link from "next/link"
import { useActiveOrg } from "@/hooks/use-active-org"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Trash2,
  ShieldCheck,
  Loader2,
  Globe,
  ArrowRight,
  Mail,
  Search,
  MoreVertical,
  ShieldAlert,
} from "lucide-react"
import {
  getEmailRoutingStatus,
  activateEmailRouting,
  listEmailRules,
  createEmailRule,
  deleteEmailRule,
  syncEmailServiceState,
} from "@/app/actions/cloudflare-email"
import {
  listDNSRecords,
  autoConfigureEmailDNS,
  disableEmailRouting,
} from "@/app/actions/cloudflare-dns"

type EmailRule = {
  id: string
  alias: string
  destination: string
  verified: boolean
  enabled: boolean
}

function EmailRulesSkeleton() {
  return (
    <div className="w-full divide-y divide-slate-100 bg-white">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 py-4 px-6">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-4 w-4 hidden md:block" />
          <Skeleton className="h-4 w-52 flex-1" />
          <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  )
}

export default function EmailRoutingPage() {
  const { toast } = useToast()
  const { user } = useUser()
  const { orgs, activeOrg: selectedOrg, loading: isLoadingOrgs } = useActiveOrg()

  const [emailServiceActive, setEmailServiceActive] = useState<boolean>(() =>
    Boolean(selectedOrg?.emailForwardingActive ?? selectedOrg?.emailRoutingActive ?? selectedOrg?.emailServiceActive)
  )
  const isEffectiveEmailActive = Boolean(
    selectedOrg?.emailForwardingActive ??
    selectedOrg?.emailRoutingActive ??
    selectedOrg?.emailServiceActive ??
    emailServiceActive
  )
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const [rules, setRules] = useState<EmailRule[]>([])
  const [isLoadingRules, setIsLoadingRules] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [isActivateDialogOpen, setIsActivateDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [aliasPrefix, setAliasPrefix] = useState("")
  const [destinationEmail, setDestinationEmail] = useState("")
  const [formErrors, setFormErrors] = useState<{ alias?: string; destination?: string }>({})

  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [dnsRecords, setDnsRecords] = useState<any[]>([])

  const zoneId = selectedOrg?.cloudflareZoneId
  const verifiedRules = rules.filter((r) => r.verified)

  const filteredRules = verifiedRules.filter(
    (rule) =>
      rule.alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.destination.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const itemsPerPage = 10
  const totalPages = Math.ceil(filteredRules.length / itemsPerPage)
  const activePage = Math.min(currentPage, Math.max(1, totalPages))
  const paginatedRules = filteredRules.slice(
    (activePage - 1) * itemsPerPage,
    activePage * itemsPerPage
  )

  const spfRecord = dnsRecords.find(
    (r) =>
      r.type === "TXT" &&
      (r.name === selectedOrg?.domain || r.name === "@" || r.name === "") &&
      r.content.includes("v=spf1") &&
      r.content.includes("include:_spf.mx.cloudflare.net")
  )
  const isSpfValid = !!spfRecord

  const dmarcRecord = dnsRecords.find(
    (r) =>
      r.type === "TXT" &&
      (r.name === `_dmarc.${selectedOrg?.domain}` || r.name === "_dmarc" || r.name.startsWith("_dmarc")) &&
      r.content.includes("v=DMARC1")
  )
  const isDmarcValid = !!dmarcRecord

  // Sync email service status on mount / org change directly from Firestore
  useEffect(() => {
    if (selectedOrg) {
      const active = Boolean(
        selectedOrg.emailForwardingActive ??
        selectedOrg.emailRoutingActive ??
        selectedOrg.emailServiceActive
      )
      setEmailServiceActive(active)
    }
  }, [selectedOrg])

  // Background check only for legacy unmigrated documents missing explicit Firestore state
  useEffect(() => {
    let isMounted = true
    if (!selectedOrg || !zoneId || !user) return

    const hasExplicitFirestoreStatus =
      selectedOrg.emailForwardingActive !== undefined ||
      selectedOrg.emailRoutingActive !== undefined ||
      selectedOrg.emailServiceActive !== undefined

    if (hasExplicitFirestoreStatus) return

    const backgroundCheck = async () => {
      try {
        const idToken = await user.getIdToken()
        const stRes = await getEmailRoutingStatus(idToken, selectedOrg.id, zoneId)
        if (stRes.success && stRes.data?.enabled && isMounted) {
          setEmailServiceActive(true)
          await syncEmailServiceState(idToken, selectedOrg.id, true)
        }
      } catch (error) {
        console.error("Background email status check error:", error)
      }
    }
    backgroundCheck()
    return () => {
      isMounted = false
    }
  }, [selectedOrg, zoneId, user])

  // Fetch email rules and live DNS records
  const fetchEmailRules = useCallback(async () => {
    if (!zoneId || !selectedOrg?.id || !user) return
    setIsLoadingRules(true)
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      const res = await listEmailRules(idToken, orgId, zoneId)
      if (res.success) {
        setRules(res.data)
      } else {
        throw new Error(res.error)
      }

      const dnsRes = await listDNSRecords(idToken, orgId, zoneId)
      if (dnsRes.success && dnsRes.data) {
        setDnsRecords(dnsRes.data)
      }
    } catch (error: any) {
      console.warn("Email rules sync issue:", error?.message)
      const rawMsg = error?.message || ""
      const isInternalRscError =
        rawMsg.includes("Server Components render") || rawMsg.includes("digest")
      toast({
        variant: "destructive",
        title: "Sync error",
        description: isInternalRscError
          ? "Unable to sync email routing rules with edge network."
          : rawMsg || "Could not fetch email forwarding rules.",
      })
    } finally {
      setIsLoadingRules(false)
    }
  }, [zoneId, selectedOrg?.id, user, toast])

  useEffect(() => {
    if (isEffectiveEmailActive && zoneId) {
      fetchEmailRules()
    } else {
      setRules([])
      setDnsRecords([])
    }
  }, [isEffectiveEmailActive, zoneId, fetchEmailRules])

  // Handle activation
  const handleActivate = async () => {
    if (!zoneId || !selectedOrg || !user) return
    setIsActivating(true)
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      const dnsRes = await autoConfigureEmailDNS(idToken, orgId, zoneId, selectedOrg.domain)
      if (!dnsRes.success) {
        throw new Error("Failed to configure DNS records: " + dnsRes.error)
      }

      const res = await activateEmailRouting(idToken, orgId, zoneId)
      if (!res.success) {
        throw new Error(res.error)
      }

      await syncEmailServiceState(idToken, orgId, true)

      toast({
        title: "Forwarding activated",
        description: "Email routing has been enabled and DNS records deployed.",
      })

      setEmailServiceActive(true)
      setIsActivateDialogOpen(false)
      fetchEmailRules()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Activation failed",
        description: error.message || "Could not activate email forwarding.",
      })
    } finally {
      setIsActivating(false)
    }
  }

  // Handle deactivation
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false)
  const [isDisabling, setIsDisabling] = useState(false)

  const handleDisable = async () => {
    if (!zoneId || !selectedOrg || !user) return
    setIsDisabling(true)
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      await disableEmailRouting(idToken, orgId, zoneId)
      await syncEmailServiceState(idToken, orgId, false)

      toast({
        title: "Forwarding disabled",
        description: "Email routing has been disabled for this domain.",
      })

      setEmailServiceActive(false)
      setIsDisableDialogOpen(false)
      setRules([])
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Deactivation failed",
        description: error.message || "Could not disable email forwarding.",
      })
    } finally {
      setIsDisabling(false)
    }
  }

  // Handle create rule
  const handleCreateRule = async () => {
    if (!zoneId || !selectedOrg || !user) return

    const errors: { alias?: string; destination?: string } = {}
    const cleanAlias = aliasPrefix.trim()
    const cleanDest = destinationEmail.trim()

    if (!cleanAlias) {
      errors.alias = "Alias prefix is required."
    } else if (!/^[a-zA-Z0-9._-]+$/.test(cleanAlias)) {
      errors.alias = "Use alphanumeric characters, dots, hyphens, and underscores."
    }

    if (!cleanDest) {
      errors.destination = "Destination email is required."
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanDest)) {
      errors.destination = "Please enter a valid email address."
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setIsSubmitting(true)
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      const aliasEmail = `${cleanAlias}@${selectedOrg.domain}`
      const res = await createEmailRule(idToken, orgId, zoneId, aliasEmail, cleanDest)

      if (!res.success) {
        throw new Error(res.error)
      }

      toast({
        title: "Forwarding rule created",
        description: `Inbound mail to ${aliasEmail} will forward to ${cleanDest}.`,
      })

      setIsCreateDialogOpen(false)
      setAliasPrefix("")
      setDestinationEmail("")
      setFormErrors({})
      fetchEmailRules()
    } catch (error: any) {
      const errMsg = error.message || ""
      const isVerificationError =
        errMsg.toLowerCase().includes("verified") ||
        errMsg.toLowerCase().includes("destination") ||
        errMsg.toLowerCase().includes("active")

      if (isVerificationError) {
        toast({
          title: "Verification email sent",
          description: `A verification link was sent to ${cleanDest}. Confirm the address to complete rule activation.`,
          duration: 7000,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Creation failed",
          description: error.message || "Could not create the forwarding rule.",
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle delete rule
  const handleDeleteRule = async () => {
    if (!zoneId || !deletingRuleId || !selectedOrg?.id || !user) return
    try {
      const idToken = await user.getIdToken()
      const orgId = selectedOrg.id
      const res = await deleteEmailRule(idToken, orgId, zoneId, deletingRuleId)
      if (res.success) {
        toast({ title: "Rule deleted", description: "The forwarding rule has been removed." })
        fetchEmailRules()
      } else {
        throw new Error(res.error)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message || "Could not remove the forwarding rule.",
      })
    } finally {
      setIsDeleteOpen(false)
      setDeletingRuleId(null)
    }
  }

  // STATE 1: Loading orgs
  if (isLoadingOrgs) {
    return (
      <DashboardShell className="max-w-7xl">
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Card className="bg-white border-slate-200 shadow-none rounded-xl">
            <CardHeader className="border-b border-slate-100 py-4 px-6">
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent className="p-0">
              <EmailRulesSkeleton />
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell className="max-w-7xl">
      <div className="space-y-8 animate-in fade-in duration-300">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              Email Forwarding
            </h1>
            <p className="text-sm text-slate-500">
              Configure custom domain email addresses and route incoming mail to personal inboxes.
            </p>
          </div>

          {zoneId && isEffectiveEmailActive && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  setAliasPrefix("")
                  setDestinationEmail("")
                  setFormErrors({})
                  setIsCreateDialogOpen(true)
                }}
                className="h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Address</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 bg-white border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-lg">
                  <DropdownMenuItem
                    onClick={() => setIsDisableDialogOpen(true)}
                    className="gap-2 text-destructive focus:text-destructive focus:bg-red-50 text-xs cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Disable Service</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* STATE 2: No orgs */}
        {orgs.length === 0 ? (
          <Card className="bg-white border-slate-200 border-dashed shadow-none rounded-xl py-12">
            <CardContent className="flex flex-col items-center text-center gap-4 max-w-md mx-auto">
              <div className="p-3 bg-slate-50 rounded-full border border-slate-100 text-slate-400">
                <Globe className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900">No Organizations Found</h3>
                <p className="text-xs text-slate-500">
                  Register an organization to manage custom domain email forwarding.
                </p>
              </div>
              <Link href="/account/home">
                <Button className="h-9 px-4 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none">
                  Go to Account Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : selectedOrg && !selectedOrg.cloudflareZoneId ? (
          /* STATE 3: DNS dependency guard */
          <Card className="bg-white border-slate-200 border-dashed shadow-none rounded-xl py-12">
            <CardContent className="flex flex-col items-center text-center gap-4 max-w-md mx-auto">
              <div className="p-3 bg-slate-50 rounded-full border border-slate-100 text-slate-400">
                <Globe className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900">DNS Configuration Required</h3>
                <p className="text-xs text-slate-500">
                  Email routing requires an active domain zone. Configure DNS management for your organization to proceed.
                </p>
              </div>
              <Link href="/services/dns">
                <Button className="h-9 px-4 bg-slate-900 hover:bg-black text-white text-xs font-medium rounded-lg shadow-none">
                  Go to DNS Management
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : selectedOrg && zoneId && !isEffectiveEmailActive ? (
          /* STATE 4: Pre-activation Landing */
          <div className="space-y-8 max-w-4xl mx-auto py-4">
            <Card className="bg-white border-slate-200 shadow-none rounded-xl overflow-hidden">
              <CardHeader className="text-center pb-2 pt-8 px-6 space-y-2">
                <CardTitle className="text-xl sm:text-2xl font-semibold text-slate-900">
                  Domain Email Routing
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
                  Create custom addresses under <span className="font-mono text-slate-700">@{selectedOrg?.domain}</span> and forward incoming mail automatically to existing personal or team inboxes.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 sm:p-8 space-y-8">
                {/* Visual Architecture Flow */}
                <div className="border border-slate-200 rounded-xl p-5 sm:p-6 bg-slate-50/50">
                  <p className="text-xs font-medium text-slate-500 mb-4 text-center">
                    Routing Pipeline
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="w-full sm:flex-1 p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                      <p className="text-slate-400 font-medium">Sender</p>
                      <p className="font-mono text-slate-900 truncate">contact@external.org</p>
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-400 rotate-90 sm:rotate-0 shrink-0" />

                    <div className="w-full sm:flex-1 p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                      <p className="text-slate-400 font-medium">Domain Alias</p>
                      <p className="font-mono text-slate-900 truncate">info@{selectedOrg?.domain}</p>
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-400 rotate-90 sm:rotate-0 shrink-0" />

                    <div className="w-full sm:flex-1 p-3.5 bg-white border border-slate-200 rounded-lg space-y-1">
                      <p className="text-slate-400 font-medium">Destination</p>
                      <p className="font-mono text-slate-900 truncate">inbox@gmail.com</p>
                    </div>
                  </div>
                </div>

                {/* Technical Features */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5">
                    <p className="font-medium text-slate-900">Zero Mailboxes to Host</p>
                    <p className="text-slate-500 leading-relaxed">
                      All messages are relayed immediately to destination targets without local mail storage requirements.
                    </p>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5">
                    <p className="font-medium text-slate-900">Automatic DNS Provisioning</p>
                    <p className="text-slate-500 leading-relaxed">
                      Enabling the service automatically sets MX and SPF records required for edge relay delivery.
                    </p>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5">
                    <p className="font-medium text-slate-900">Anti-Spoofing Verification</p>
                    <p className="text-slate-500 leading-relaxed">
                      Every destination address must verify inbox ownership before forwarding becomes active.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center pt-2">
                  <Button
                    onClick={() => setIsActivateDialogOpen(true)}
                    className="h-10 px-6 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Enable Email Forwarding</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* STATE 5: Active Management Workspace */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Rules Table */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl">
              <CardHeader className="border-b border-slate-100 px-6 py-4 flex flex-row items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Forwarding Rules
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Active aliases configured on {selectedOrg?.domain}.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs font-normal tabular-nums text-slate-600 bg-slate-50 border-slate-200 px-2 py-0.5 rounded"
                >
                  {verifiedRules.length} {verifiedRules.length === 1 ? "rule" : "rules"}
                </Badge>
              </CardHeader>
              <CardContent className="p-0 min-h-[180px]">
                {isLoadingRules ? (
                  <EmailRulesSkeleton />
                ) : verifiedRules.length === 0 && !searchTerm ? (
                  <div className="py-16 text-center space-y-2 px-4">
                    <p className="text-sm font-medium text-slate-700">No Forwarding Rules Active</p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Create your first custom email address to begin routing incoming messages.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Search and Filters Bar */}
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-3">
                      <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <Input
                          placeholder="Search addresses..."
                          className="pl-9 h-9 text-xs border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                          value={searchTerm}
                          onChange={(e) => {
                            setSearchTerm(e.target.value)
                            setCurrentPage(1)
                          }}
                        />
                      </div>
                      {searchTerm && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSearchTerm("")
                            setCurrentPage(1)
                          }}
                          className="text-xs text-slate-500 h-8 px-2 hover:bg-slate-100"
                        >
                          Clear
                        </Button>
                      )}
                      <div className="ml-auto text-xs text-slate-500 tabular-nums hidden sm:block">
                        Showing {paginatedRules.length} of {filteredRules.length}
                      </div>
                    </div>

                    {filteredRules.length === 0 ? (
                      <div className="py-16 text-center space-y-1.5 px-4">
                        <p className="text-xs font-medium text-slate-700">No Matching Rules</p>
                        <p className="text-xs text-slate-400">
                          Try adjusting your search query.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="hidden md:block">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                                <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500">
                                  Custom Alias
                                </TableHead>
                                <TableHead className="text-xs font-medium py-3 text-slate-500">
                                  Forwards To
                                </TableHead>
                                <TableHead className="text-xs font-medium py-3 text-slate-500 w-[120px]">
                                  Status
                                </TableHead>
                                <TableHead className="w-[60px] pr-6 text-right text-slate-500">
                                  Action
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginatedRules.map((rule) => (
                                <TableRow
                                  key={rule.id}
                                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors"
                                >
                                  <TableCell className="pl-6 py-3.5 font-mono text-xs font-medium text-slate-900">
                                    {rule.alias}
                                  </TableCell>
                                  <TableCell className="py-3.5 font-mono text-xs text-slate-600">
                                    {rule.destination}
                                  </TableCell>
                                  <TableCell className="py-3.5">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      Active
                                    </span>
                                  </TableCell>
                                  <TableCell className="pr-6 text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-slate-400 hover:text-red-600 transition-colors rounded-lg"
                                      onClick={() => {
                                        setDeletingRuleId(rule.id)
                                        setIsDeleteOpen(true)
                                      }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Mobile List View */}
                        <div className="block md:hidden divide-y divide-slate-100">
                          {paginatedRules.map((rule) => (
                            <div key={rule.id} className="p-4 space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5 min-w-0">
                                  <p className="font-mono text-xs font-medium text-slate-900 break-all">
                                    {rule.alias}
                                  </p>
                                  <p className="font-mono text-xs text-slate-500 break-all">
                                    → {rule.destination}
                                  </p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Active
                                </span>
                              </div>
                              <div className="flex justify-end pt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-slate-500 hover:text-red-600 px-2"
                                  onClick={() => {
                                    setDeletingRuleId(rule.id)
                                    setIsDeleteOpen(true)
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                            <div>
                              Page <span className="font-medium text-slate-900">{activePage}</span> of{" "}
                              <span className="font-medium text-slate-900">{totalPages}</span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-slate-200 rounded-lg"
                                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                disabled={activePage === 1}
                              >
                                Previous
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-slate-200 rounded-lg"
                                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={activePage === totalPages}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Security Parameters */}
            <Card className="bg-white border-slate-200 shadow-none rounded-xl">
              <CardHeader className="border-b border-slate-100 px-6 py-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Domain Authentication Records
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-slate-500">
                  Verification status of edge routing TXT and MX directives.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* SPF */}
                  <div className="p-4 bg-slate-50/60 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">SPF Protocol</span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium border",
                          isSpfValid
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                            : "bg-amber-50 text-amber-700 border-amber-200/60"
                        )}
                      >
                        {isSpfValid ? "Aligned" : "Not configured"}
                      </span>
                    </div>
                    <code className="text-xs font-mono text-slate-500 block break-all">
                      {isSpfValid ? spfRecord.content : "v=spf1 include:_spf.mx.cloudflare.net ~all"}
                    </code>
                  </div>

                  {/* DKIM */}
                  <div className="p-4 bg-slate-50/60 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">DKIM Relay</span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium border",
                          isEffectiveEmailActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                            : "bg-amber-50 text-amber-700 border-amber-200/60"
                        )}
                      >
                        {isEffectiveEmailActive ? "Managed" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Cryptographic signatures are evaluated at edge ingestion nodes automatically.
                    </p>
                  </div>

                  {/* DMARC */}
                  <div className="p-4 bg-slate-50/60 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">DMARC Policy</span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium border",
                          isDmarcValid
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                            : "bg-amber-50 text-amber-700 border-amber-200/60"
                        )}
                      >
                        {isDmarcValid ? "Enforced" : "Not configured"}
                      </span>
                    </div>
                    <code className="text-xs font-mono text-slate-500 block break-all">
                      {isDmarcValid ? dmarcRecord.content : "v=DMARC1; p=none;"}
                    </code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Activation Confirmation Dialog */}
        <Dialog open={isActivateDialogOpen} onOpenChange={setIsActivateDialogOpen}>
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Enable Email Forwarding
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                This will update the MX and SPF records on {selectedOrg?.domain} to route incoming mail through edge relays.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 text-xs text-slate-600 leading-relaxed">
              Existing custom MX records will be replaced with Cloudflare routing priorities. Are you sure you want to continue?
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsActivateDialogOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleActivate}
                disabled={isActivating}
                className="h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isActivating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isActivating ? "Enabling..." : "Enable Service"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Address Dialog */}
        <Dialog
          open={isCreateDialogOpen}
          onOpenChange={(open) => {
            setIsCreateDialogOpen(open)
            if (!open) setFormErrors({})
          }}
        >
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Create Forwarding Address
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Configure an inbound alias for {selectedOrg?.domain}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Alias Name</Label>
                <div className="flex items-center">
                  <Input
                    placeholder="e.g. contact, info, team"
                    className={cn(
                      "h-9 text-sm border-slate-200 rounded-r-none focus-visible:ring-primary/20 bg-white",
                      formErrors.alias && "border-red-400"
                    )}
                    value={aliasPrefix}
                    onChange={(e) => {
                      setAliasPrefix(e.target.value)
                      setFormErrors((prev) => ({ ...prev, alias: undefined }))
                    }}
                  />
                  <div className="h-9 px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg flex items-center">
                    <span className="text-xs font-mono text-slate-500">@{selectedOrg?.domain}</span>
                  </div>
                </div>
                {formErrors.alias && (
                  <p className="text-xs text-red-500">{formErrors.alias}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-700">Forward Destination</Label>
                <Input
                  type="email"
                  placeholder="personal.inbox@gmail.com"
                  className={cn(
                    "h-9 text-sm border-slate-200 rounded-lg focus-visible:ring-primary/20 bg-white",
                    formErrors.destination && "border-red-400"
                  )}
                  value={destinationEmail}
                  onChange={(e) => {
                    setDestinationEmail(e.target.value)
                    setFormErrors((prev) => ({ ...prev, destination: undefined }))
                  }}
                />
                {formErrors.destination && (
                  <p className="text-xs text-red-500">{formErrors.destination}</p>
                )}
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs text-slate-600">
                <p className="font-medium text-slate-900">Destination Verification</p>
                <p className="leading-relaxed">
                  If this destination is newly added, Cloudflare will dispatch a confirmation email. Follow the link in the message to activate message delivery.
                </p>
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsCreateDialogOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateRule}
                disabled={isSubmitting}
                className="h-9 px-4 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? "Creating..." : "Create Address"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Delete Forwarding Address
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Are you sure you want to delete this forwarding address? Messages sent to it will no longer be routed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-4 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsDeleteOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteRule}
                variant="destructive"
                className="h-9 px-4 text-xs font-medium rounded-lg shadow-none"
              >
                Delete Address
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deactivation Confirmation Dialog */}
        <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
          <DialogContent className="max-w-md p-6 bg-white border border-slate-200 rounded-xl shadow-lg">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-base font-semibold text-slate-900">
                Disable Email Forwarding
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                This will disable email routing for {selectedOrg?.domain}. Active forwarding rules will cease relaying messages.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="pt-4 gap-2">
              <Button
                variant="ghost"
                onClick={() => setIsDisableDialogOpen(false)}
                className="h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDisable}
                disabled={isDisabling}
                variant="destructive"
                className="h-9 px-4 text-xs font-medium rounded-lg shadow-none flex items-center gap-2"
              >
                {isDisabling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isDisabling ? "Disabling..." : "Disable Service"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
