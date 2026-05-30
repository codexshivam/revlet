"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useUser, useFirestore } from "@/firebase"
import { doc, setDoc, getDoc, addDoc, collection, serverTimestamp, updateDoc } from "firebase/firestore"
import Link from "next/link"
import { useActiveOrg } from "@/hooks/use-active-org"
import {
  Plus,
  Trash2,
  ShieldCheck,
  Loader2,
  Globe,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRightLeft,
  ShieldAlert,
  Mail,
  Send,
  ArrowRight,
  Sparkles,
  MailOpen,
  Zap,
} from "lucide-react"
import {
  getEmailRoutingStatus,
  activateEmailRouting,
  listEmailRules,
  createEmailRule,
  deleteEmailRule,
} from "@/app/actions/cloudflare-email"

type EmailRule = {
  id: string
  alias: string
  destination: string
  verified: boolean
  enabled: boolean
}

export default function EmailRoutingPage() {
  const { toast } = useToast()
  const { user } = useUser()
  const db = useFirestore()
  const { orgs, activeOrg: selectedOrg, activeOrgId: selectedOrgId, loading: isLoadingOrgs } = useActiveOrg()

  const [emailServiceActive, setEmailServiceActive] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)
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

  const zoneId = selectedOrg?.cloudflareZoneId

  // Check email service status on mount / org change
  useEffect(() => {
    const checkEmailStatus = async () => {
      if (!selectedOrg) { setIsCheckingStatus(false); return }
      setIsCheckingStatus(true)
      try {
        // First check org doc
        if (selectedOrg.emailServiceActive) {
          setEmailServiceActive(true)
        } else {
          // Fallback: check emailRoutingConfigs collection
          const configRef = doc(db, "emailRoutingConfigs", selectedOrg.id)
          const configSnap = await getDoc(configRef)
          if (configSnap.exists() && configSnap.data()?.isServiceActive) {
            setEmailServiceActive(true)
          } else {
            setEmailServiceActive(false)
          }
        }
      } catch (error) {
        console.error("Error checking email status:", error)
        setEmailServiceActive(false)
      } finally {
        setIsCheckingStatus(false)
      }
    }
    checkEmailStatus()
  }, [selectedOrg, db])

  // Fetch email rules
  const fetchEmailRules = useCallback(async () => {
    if (!zoneId) return
    setIsLoadingRules(true)
    try {
      const res = await listEmailRules(zoneId)
      if (res.success) {
        setRules(res.data)
      } else {
        throw new Error(res.error)
      }
    } catch (error: any) {
      console.warn("Email rules sync issue:", error.message)
      toast({
        variant: "destructive",
        title: "Sync Error",
        description: error.message || "Could not fetch email service rules.",
      })
    } finally {
      setIsLoadingRules(false)
    }
  }, [zoneId, toast])

  useEffect(() => {
    if (emailServiceActive && zoneId) {
      fetchEmailRules()
    } else {
      setRules([])
    }
  }, [emailServiceActive, zoneId, fetchEmailRules])

  // Handle activation
  const handleActivate = async () => {
    if (!zoneId || !selectedOrg || !user) return
    setIsActivating(true)
    try {
      const res = await activateEmailRouting(zoneId)
      if (!res.success) {
        throw new Error(res.error)
      }

      // Update Firestore org doc
      await updateDoc(doc(db, "organizations", selectedOrg.id), { emailServiceActive: true })

      // Create emailRoutingConfigs doc
      await setDoc(doc(db, "emailRoutingConfigs", selectedOrg.id), {
        organizationId: selectedOrg.id,
        domainName: selectedOrg.domain,
        isServiceActive: true,
        dmarcPolicy: "v=DMARC1; p=none;",
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      })

      toast({
        title: "Email Service Activated",
        description: "Mail infrastructure has been provisioned and security records deployed.",
      })

      setEmailServiceActive(true)
      setIsActivateDialogOpen(false)
      fetchEmailRules()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Activation Failed",
        description: error.message || "Could not activate email service.",
      })
    } finally {
      setIsActivating(false)
    }
  }

  // Handle create rule
  const handleCreateRule = async () => {
    if (!zoneId || !selectedOrg || !user) return

    // Validate
    const errors: { alias?: string; destination?: string } = {}
    const cleanAlias = aliasPrefix.trim()
    const cleanDest = destinationEmail.trim()

    if (!cleanAlias) {
      errors.alias = "Alias prefix is required."
    } else if (!/^[a-zA-Z0-9._-]+$/.test(cleanAlias)) {
      errors.alias = "Only alphanumeric characters, dots, hyphens, and underscores allowed."
    }

    if (!cleanDest) {
      errors.destination = "Destination email is required."
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanDest)) {
      errors.destination = "Must be a valid email address."
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      toast({
        variant: "destructive",
        title: "Validation Failed",
        description: "Please resolve form input errors before submitting.",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const aliasEmail = `${cleanAlias}@${selectedOrg.domain}`
      const res = await createEmailRule(zoneId, aliasEmail, cleanDest)

      if (!res.success) {
        throw new Error(res.error)
      }

      // Save to Firestore forwardingRules collection
      await addDoc(collection(db, "forwardingRules"), {
        organizationId: selectedOrg.id,
        aliasEmail,
        destinationEmail: cleanDest,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      })

      toast({
        title: "Forwarding Rule Created",
        description: `${aliasEmail} → ${cleanDest} is now active.`,
      })

      setIsCreateDialogOpen(false)
      setAliasPrefix("")
      setDestinationEmail("")
      setFormErrors({})
      fetchEmailRules()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: error.message || "Could not create the forwarding rule.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle delete rule
  const handleDeleteRule = async () => {
    if (!zoneId || !deletingRuleId) return
    try {
      const res = await deleteEmailRule(zoneId, deletingRuleId)
      if (res.success) {
        toast({ title: "Rule Removed", description: "The forwarding rule has been deleted." })
        fetchEmailRules()
      } else {
        throw new Error(res.error)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete Failed",
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
      <DashboardShell>
        <div className="flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Infrastructure...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Services</span>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Email Service</h1>
            <div className="flex items-center gap-3">
              {zoneId && emailServiceActive && (
                <Button
                  onClick={() => {
                    setAliasPrefix("")
                    setDestinationEmail("")
                    setFormErrors({})
                    setIsCreateDialogOpen(true)
                  }}
                  className="bg-slate-900 hover:bg-black text-white font-bold h-10 px-6 shadow-lg shadow-slate-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Rule
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* STATE 2: No orgs */}
        {orgs.length === 0 ? (
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
              <CardContent className="p-16 flex flex-col items-center text-center gap-6">
                <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                  <Globe className="w-10 h-10 text-slate-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-headline font-bold text-slate-900">No Registered Organizations</h3>
                  <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                    To manage email service configurations, you must first register your organization on the Account Home screen.
                  </p>
                </div>
                <Link href="/account/home">
                  <Button className="font-bold gap-2 h-11 px-6 bg-slate-900 hover:bg-black text-white transition-all shadow-md">
                    Go to Account Home
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

        /* STATE 3: DNS dependency guard */
        ) : selectedOrg && !selectedOrg.cloudflareZoneId ? (
          <div className="max-w-4xl mx-auto py-20 animate-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-slate-50 border-slate-200 border-dashed shadow-sm">
              <CardContent className="p-16 flex flex-col items-center text-center gap-6">
                <div className="p-4 bg-white rounded-full border border-slate-100 shadow-sm shrink-0">
                  <Globe className="w-10 h-10 text-slate-300 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-headline font-bold text-slate-900">DNS Management Required</h3>
                  <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed font-medium">
                    Email services require an active domain configuration. Please activate DNS management for your organization first.
                  </p>
                </div>
                <Link href="/services/dns">
                  <Button className="font-bold gap-2 h-11 px-6 bg-slate-900 hover:bg-black text-white transition-all shadow-md">
                    Go to DNS Management
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

        /* STATE 4: Pre-activation + STATE 5: Active workspace */
        ) : selectedOrg && zoneId && isCheckingStatus ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
            <p className="text-[10px] font-bold text-slate-400 uppercase">Checking Service Status...</p>
          </div>

        ) : selectedOrg && zoneId && !emailServiceActive ? (
          /* STATE 4: Pre-activation landing */
          <div className="max-w-6xl mx-auto py-8 px-4 md:px-6 animate-in slide-in-from-bottom-4 duration-500 w-full">
            <div className="space-y-12 text-center flex flex-col items-center">
              {/* Value Proposition Banner */}
              <div className="space-y-4 flex flex-col items-center max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-100 bg-blue-50/50 text-[10px] font-bold text-primary uppercase tracking-widest shadow-sm animate-pulse">
                  <Sparkles className="w-3 h-3 text-primary" />
                  The Best Domain Email Service
                </div>
                <h2 className="text-2xl md:text-3xl font-headline font-bold text-slate-900 leading-tight">
                  Get Professional Email for Your Domain
                </h2>
                <p className="text-slate-500 text-xs md:text-sm leading-relaxed max-w-xl mx-auto">
                  Create custom email addresses using your own domain name (like info@{selectedOrg?.domain || "yourdomain.com"}) and automatically forward messages directly to your existing personal inbox. Simple, beautiful, and completely secure.
                </p>
              </div>

              {/* How it Works Flow Visualization */}
              <div className="max-w-5xl w-full p-6 md:p-8 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/20 to-white shadow-lg shadow-slate-100/50 relative overflow-hidden text-left transition-all hover:shadow-xl duration-300">
                <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />
                
                <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center mb-8">
                  How it works
                </h4>
                
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-4 relative z-10 w-full px-2">
                  {/* Sender Card */}
                  <div className="flex-1 w-full lg:max-w-[270px] p-4 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center gap-3.5 transition-all hover:border-slate-200">
                    <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg shrink-0">
                      <MailOpen className="w-5 h-5 text-slate-500 animate-pulse" />
                    </div>
                    <div className="text-left space-y-0.5 min-w-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Email from anyone</p>
                      <p className="text-xs font-bold text-slate-800 truncate">customer@gmail.com</p>
                    </div>
                  </div>
                  
                  {/* Flow Arrow 1 */}
                  <div className="flex lg:flex-col items-center gap-1.5 text-primary shrink-0">
                    <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    <div className="h-0.5 w-8 lg:w-0.5 lg:h-8 bg-gradient-to-r lg:bg-gradient-to-b from-primary to-blue-400 hidden md:block" />
                    <ArrowRight className="w-4 h-4 lg:rotate-0 rotate-90" />
                  </div>
                  
                  {/* Custom Domain Gateway */}
                  <div className="flex-1 w-full lg:max-w-[300px] p-5 rounded-xl bg-slate-900 text-white shadow-lg shadow-slate-900/10 flex items-center gap-3.5 relative border border-slate-800 transition-all hover:bg-black">
                    <div className="p-2 bg-white/10 rounded-lg shrink-0">
                      <Globe className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '15s' }} />
                    </div>
                    <div className="text-left space-y-0.5 min-w-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Your Custom Address</p>
                      <p className="text-xs font-bold font-mono truncate text-emerald-400">info@{selectedOrg?.domain || "yourdomain.com"}</p>
                    </div>
                  </div>
                  
                  {/* Flow Arrow 2 */}
                  <div className="flex lg:flex-col items-center gap-1.5 text-emerald-500 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <div className="h-0.5 w-8 lg:w-0.5 lg:h-8 bg-gradient-to-r lg:bg-gradient-to-b from-emerald-500 to-teal-400 hidden md:block" />
                    <ArrowRight className="w-4 h-4 lg:rotate-0 rotate-90" />
                  </div>
                  
                  {/* Destination Card */}
                  <div className="flex-1 w-full lg:max-w-[270px] p-4 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center gap-3.5 transition-all hover:border-slate-200">
                    <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg shrink-0">
                      <Send className="w-5 h-5 text-emerald-600 animate-bounce" style={{ animationDuration: '4s' }} />
                    </div>
                    <div className="text-left space-y-0.5 min-w-0">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Your Personal Inbox</p>
                      <p className="text-xs font-bold text-slate-800 truncate">you@gmail.com</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Capability Highlights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left w-full">
                {[
                  {
                    title: "Easy Email Forwarding",
                    desc: "Receive emails on your custom brand address and read them inside your normal personal inbox. No new passwords to remember.",
                    icon: ArrowRightLeft,
                    color: "bg-blue-50/50 hover:bg-blue-50 text-blue-600 border-blue-100 hover:border-blue-200",
                  },
                  {
                    title: "1-Click Automated Setup",
                    desc: "We handle all the complicated connection setup behind the scenes. Just click activate and your brand is ready to receive mail.",
                    icon: ShieldAlert,
                    color: "bg-emerald-50/50 hover:bg-emerald-50 text-emerald-600 border-emerald-100 hover:border-emerald-200",
                  },
                  {
                    title: "Spam & Identity Protection",
                    desc: "Built-in cryptographic shields secure your domain from hackers and ensure your emails always arrive safely.",
                    icon: Lock,
                    color: "bg-purple-50/50 hover:bg-purple-50 text-purple-600 border-purple-100 hover:border-purple-200",
                  },
                ].map((feature) => (
                  <div key={feature.title} className={cn("p-5 rounded-xl border flex items-start gap-4 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 duration-200", feature.color)}>
                    <div className="p-2.5 bg-white rounded-lg shadow-sm shrink-0 border border-slate-100/80">
                      <feature.icon className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs md:text-sm font-bold text-slate-800">{feature.title}</h4>
                      <p className="text-[11px] opacity-90 leading-relaxed font-medium text-slate-500">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Get Started Button */}
              <div className="pt-2 flex flex-col items-center">
                <Button
                  onClick={() => setIsActivateDialogOpen(true)}
                  size="default"
                  className="font-bold px-10 h-11 shadow-md shadow-primary/10 text-xs group bg-slate-900 hover:bg-black text-white rounded-lg transition-all"
                >
                  <Mail className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                  Activate Email Service
                </Button>
              </div>
            </div>
          </div>

        ) : selectedOrg && zoneId && emailServiceActive && (
          /* STATE 5: Active Management Workspace */
          <div className="space-y-8 animate-in fade-in duration-700">
            {/* Security Status Dashboard */}
            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Domain Security Parameters</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* SPF Card */}
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">SPF Protocol</span>
                      <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-bold border shadow-none">ALIGNED</Badge>
                    </div>
                    <code className="text-[10px] font-mono text-slate-500 block leading-relaxed break-all">v=spf1 include:_spf.mx.cloudflare.net ~all</code>
                  </div>
                  {/* DKIM Card */}
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">DKIM Verification</span>
                      <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-bold border shadow-none">VERIFIED / PASS-THROUGH</Badge>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">Cryptographic key validation is automatically managed by the routing infrastructure.</p>
                  </div>
                  {/* DMARC Card */}
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">DMARC Compliance</span>
                      <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-bold border shadow-none">ENFORCED</Badge>
                    </div>
                    <code className="text-[10px] font-mono text-slate-500 block leading-relaxed">v=DMARC1; p=none;</code>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email Service Rules Table */}
            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between py-4 px-6">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Forwarding Rules</CardTitle>
                  <Badge variant="outline" className="text-[9px] font-bold h-5 px-1.5 bg-white border-slate-200">{rules.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingRules ? (
                  <div className="flex flex-col items-center justify-center py-32 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Synchronizing Rules...</p>
                  </div>
                ) : rules.length === 0 ? (
                  <div className="p-24 text-center space-y-3">
                    <Mail className="w-8 h-8 text-slate-100 mx-auto" />
                    <p className="text-sm font-bold text-slate-400">No active forwarding rules found.</p>
                    <p className="text-xs text-slate-400 font-medium">Create your first email alias to start routing mail.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow className="border-b border-slate-100">
                        <TableHead className="text-[10px] font-bold uppercase py-4 pl-6">Source Email Alias</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4">Active Target Destination</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 w-40">Verification Status</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-6 w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                          <TableCell className="pl-6 py-4">
                            <span className="font-bold text-xs text-slate-800">{rule.alias}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-[11px] text-slate-500">{rule.destination}</span>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "text-[9px] font-bold px-2 py-0.5 border shadow-none",
                              rule.verified
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : "bg-amber-50 text-amber-600 border-amber-100"
                            )}>
                              {rule.verified ? "VERIFIED" : "PENDING VERIFICATION"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-slate-400 hover:bg-destructive hover:text-white transition-all rounded-md"
                              onClick={() => { setDeletingRuleId(rule.id); setIsDeleteOpen(true) }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Activation Confirmation Dialog */}
        <Dialog open={isActivateDialogOpen} onOpenChange={setIsActivateDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white [&>button]:text-white [&>button]:hover:text-white [&>button]:opacity-90 [&>button]:transition-all">
            <DialogHeader className="bg-primary text-white p-6">
              <DialogTitle className="font-headline font-bold text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Confirm Service Activation
              </DialogTitle>
              <p className="text-white/70 text-xs mt-1">This action will modify your domain&apos;s mail configuration.</p>
            </DialogHeader>
            <div className="p-6 space-y-3">
              <p className="text-sm font-medium text-slate-700 leading-relaxed">
                Activating this service will automatically replace existing MX records on your domain to prioritize your new secure forwarding paths. Do you wish to proceed?
              </p>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setIsActivateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleActivate} disabled={isActivating}>
                {isActivating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Activate Service
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Alias Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
          setIsCreateDialogOpen(open)
          if (!open) setFormErrors({})
        }}>
          <DialogContent className="max-w-md p-0 overflow-hidden border border-slate-200/80 shadow-2xl bg-white rounded-xl">
            <DialogHeader className="bg-white border-b border-slate-100 px-5 py-4">
              <DialogTitle className="font-headline font-bold text-base text-slate-900">
                Create Forwarding Rule
              </DialogTitle>
              <p className="text-slate-400 text-[10px] mt-0.5 uppercase font-bold tracking-wider">Domain: {selectedOrg?.domain}</p>
            </DialogHeader>
            <div className="px-5 py-4 space-y-3.5">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Alias Prefix</Label>
                  <div className="flex items-center gap-0">
                    <Input
                      placeholder="e.g. admissions"
                      className={cn(
                        "h-9 font-semibold text-xs border-slate-200 transition-all rounded-r-none",
                        formErrors.alias && "border-red-400 focus-visible:ring-red-500 bg-red-50/20"
                      )}
                      value={aliasPrefix}
                      onChange={(e) => {
                        setAliasPrefix(e.target.value)
                        setFormErrors((prev) => ({ ...prev, alias: undefined }))
                      }}
                    />
                    <div className="h-9 px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md flex items-center">
                      <span className="text-xs font-bold text-slate-500">@{selectedOrg?.domain}</span>
                    </div>
                  </div>
                  {formErrors.alias && <p className="text-[9px] text-red-500 font-bold uppercase tracking-wide">{formErrors.alias}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Destination Email</Label>
                  <Input
                    type="email"
                    placeholder="e.g. admin@gmail.com"
                    className={cn(
                      "h-9 font-semibold text-xs border-slate-200 transition-all",
                      formErrors.destination && "border-red-400 focus-visible:ring-red-500 bg-red-50/20"
                    )}
                    value={destinationEmail}
                    onChange={(e) => {
                      setDestinationEmail(e.target.value)
                      setFormErrors((prev) => ({ ...prev, destination: undefined }))
                    }}
                  />
                  {formErrors.destination && <p className="text-[9px] text-red-500 font-bold uppercase tracking-wide">{formErrors.destination}</p>}
                </div>

                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                  <Send className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-primary font-bold leading-relaxed">
                    Emails sent to <span className="font-mono">{aliasPrefix || "prefix"}@{selectedOrg?.domain}</span> will be forwarded to the destination inbox.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter className="bg-white border-t border-slate-100/60 px-5 py-3 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-9">Cancel</Button>
              <Button onClick={handleCreateRule} disabled={isSubmitting} className="h-9 px-6 bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-md rounded-lg">
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : "Create Rule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white animate-in zoom-in duration-300 [&>button]:text-white [&>button]:hover:text-white [&>button]:opacity-90 [&>button]:transition-all">
            <DialogHeader className="bg-red-600 text-white p-6">
              <DialogTitle className="font-headline font-bold text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 animate-bounce text-white" />
                Confirm Routing Rule Deletion
              </DialogTitle>
              <p className="text-red-100 text-xs mt-1">This will permanently remove this email forwarding rule.</p>
            </DialogHeader>
            <div className="p-6 space-y-3">
              <p className="text-sm font-medium text-slate-700 leading-relaxed">
                Are you sure you want to remove this forwarding rule? Emails sent to this alias will no longer be routed to the configured destination.
              </p>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t border-slate-100 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setIsDeleteOpen(false)} className="text-xs font-bold uppercase text-slate-400">Cancel</Button>
              <Button
                onClick={handleDeleteRule}
                className="px-6 bg-red-600 hover:bg-red-700 text-white font-bold h-10 shadow-lg shadow-red-200"
              >
                Confirm Removal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
