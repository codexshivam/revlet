"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Mail, Loader2, Copy, Check, ChevronRight } from "lucide-react"
import { useUser, useFirestore } from "@/firebase"
import { collection, addDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore"
import { stripScripts, containsMaliciousScript } from "@/lib/security/sanitize"
import { toast } from "@/hooks/use-toast"
import { errorEmitter } from "@/firebase/error-emitter"
import { FirestorePermissionError } from "@/firebase/errors"
import { cn } from "@/lib/utils"
import { PublicSupportView } from "@/components/public/public-support-view"

interface SupportTicket {
  id: string
  subject: string
  category: string
  description: string
  ownerId: string
  userEmail?: string
  userDisplayName?: string
  submittedAt?: { seconds: number; toDate?: () => Date }
  status?: string
}

function getStatusBadge(status?: string) {
  const norm = (status || "Open").toLowerCase()
  if (norm === "resolved" || norm === "closed") {
    return {
      dot: "bg-emerald-500",
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
      label: status || "Resolved",
    }
  }
  if (norm === "in progress") {
    return {
      dot: "bg-blue-500",
      pill: "bg-blue-50 text-blue-700 border-blue-200/60",
      label: "In progress",
    }
  }
  return {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 border-amber-200/60",
    label: status || "Open",
  }
}

export default function SupportPage() {
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()

  const [subject, setSubject] = useState("")
  const [category, setCategory] = useState("Technical Support")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [isLoadingTickets, setIsLoadingTickets] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) return

    const q = query(
      collection(db, "supportTickets"),
      where("ownerId", "==", user.uid)
    )

    const fetchTickets = async () => {
      try {
        const snap = await getDocs(q)
        const fetched: SupportTicket[] = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<SupportTicket, "id">),
        }))

        fetched.sort((a, b) => {
          const tA = a.submittedAt?.seconds || 0
          const tB = b.submittedAt?.seconds || 0
          return tB - tA
        })

        setTickets(fetched)
      } catch (error) {
        console.error("Error loading support tickets:", error)
      } finally {
        setIsLoadingTickets(false)
      }
    }

    fetchTickets()
  }, [user, authLoading, db])

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    toast({ title: "Copied", description: "Ticket ID copied to clipboard." })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSubmitTicket = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Session required",
        description: "You must be signed in to submit a support ticket.",
      })
      return
    }

    if (!subject.trim() || !category.trim() || !message.trim()) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please fill out all support ticket fields.",
      })
      return
    }

    if (containsMaliciousScript(subject) || containsMaliciousScript(message)) {
      toast({
        variant: "destructive",
        title: "Disallowed content",
        description: "Executable scripts and HTML tags are blocked in support requests.",
      })
      return
    }

    const cleanSubject = stripScripts(subject, { maxLength: 200 })
    const cleanMessage = stripScripts(message, { maxLength: 4000 })

    setIsSubmitting(true)
    try {
      const ticketsRef = collection(db, "supportTickets")
      const userEmail = user.email || ""
      const userDisplayName = user.displayName || user.email?.split("@")[0] || "User"
      const docRef = await addDoc(ticketsRef, {
        subject: cleanSubject,
        category: category.trim(),
        description: cleanMessage,
        ownerId: user.uid,
        userEmail,
        userDisplayName,
        submittedAt: serverTimestamp(),
        status: "Open",
      })

      const newTicket: SupportTicket = {
        id: docRef.id,
        subject: cleanSubject,
        category: category.trim(),
        description: cleanMessage,
        ownerId: user.uid,
        userEmail,
        userDisplayName,
        submittedAt: { seconds: Math.floor(Date.now() / 1000) },
        status: "Open",
      }

      setTickets((prev) => [newTicket, ...prev])

      toast({
        title: "Ticket created",
        description: "Your support request has been registered. Our team will review it shortly.",
      })

      setSubject("")
      setMessage("")
      setCategory("Technical Support")
    } catch (error: any) {
      const permissionError = new FirestorePermissionError({
        path: "supportTickets",
        operation: "create",
        requestResourceData: { subject, category, message },
      })
      errorEmitter.emit("permission-error", permissionError)

      toast({
        variant: "destructive",
        title: "Submission failed",
        description: error.message || "Failed to submit your support ticket.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) {
    return <PublicSupportView />
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              Support
            </h1>
            <p className="text-sm text-slate-500">
              Submit inquiries to Network Operations and review existing tickets.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shrink-0">
            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-500">Direct inquiries:</span>
            <a
              href="mailto:hello@revlet.me"
              className="font-medium text-slate-900 hover:text-primary transition-colors"
            >
              hello@revlet.me
            </a>
          </div>
        </div>

        {/* Ticket Submission Card */}
        <Card className="bg-white border-slate-200 shadow-none rounded-xl">
          <CardHeader className="border-b border-slate-100 px-6 py-5">
            <CardTitle className="text-base font-semibold text-slate-900">
              Open a support ticket
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Describe your issue in detail. Our team typically responds within 24 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-xs font-medium text-slate-700">
                  Ticket subject
                </Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. DNS propagation delay"
                  className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category" className="text-xs font-medium text-slate-700">
                  Category
                </Label>
                <Select value={category} onValueChange={(v) => setCategory(v)}>
                  <SelectTrigger className="h-10 text-sm font-normal border-slate-200 bg-white rounded-lg">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg">
                    <SelectItem value="Technical Support" className="text-xs">
                      Technical support
                    </SelectItem>
                    <SelectItem value="Billing & Payments" className="text-xs">
                      Billing & payments
                    </SelectItem>
                    <SelectItem value="DNS & Network" className="text-xs">
                      DNS & network
                    </SelectItem>
                    <SelectItem value="Bug Report" className="text-xs">
                      Bug report
                    </SelectItem>
                    <SelectItem value="General Inquiry" className="text-xs">
                      General inquiry
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message" className="text-xs font-medium text-slate-700">
                Detailed description
              </Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Include affected domain names, relevant record types, and steps to reproduce..."
                className="min-h-[140px] text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg p-3 resize-y"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Response priority is based on account tier and ticket category.
              </p>
              <Button
                onClick={handleSubmitTicket}
                disabled={isSubmitting}
                className="h-9 px-5 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center justify-center gap-2"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? "Submitting..." : "Submit ticket"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tickets History Card */}
        <Card className="bg-white border-slate-200 shadow-none rounded-xl">
          <CardHeader className="border-b border-slate-100 px-6 py-4 flex flex-row items-center justify-between gap-4">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-semibold text-slate-900">
                Support tickets
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                History and status of your submitted inquiries.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="text-xs font-normal tabular-nums text-slate-600 bg-slate-50 border-slate-200 px-2 py-0.5 rounded"
            >
              {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"}
            </Badge>
          </CardHeader>
          <CardContent className="p-0 min-h-[180px]">
            {isLoadingTickets ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <p className="text-xs text-slate-500">Loading support history...</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-1.5 px-4">
                <p className="text-sm font-medium text-slate-700">No support tickets found</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  Use the form above to reach the Revlet engineering and operations desk.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                        <TableHead className="text-xs font-medium py-3 pl-6 text-slate-500 w-[160px]">
                          Ticket ID
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-slate-500">
                          Subject
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-slate-500 w-[180px]">
                          Category
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-slate-500 w-[130px]">
                          Date opened
                        </TableHead>
                        <TableHead className="text-xs font-medium py-3 text-slate-500 w-[140px]">
                          Status
                        </TableHead>
                        <TableHead className="w-[40px] pr-6" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tickets.map((t) => {
                        const isExpanded = expandedTicketId === t.id
                        const statusConfig = getStatusBadge(t.status)
                        const formattedDate =
                          t.submittedAt?.toDate?.()?.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }) ||
                          (t.submittedAt?.seconds
                            ? new Date(t.submittedAt.seconds * 1000).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "—")

                        return (
                          <React.Fragment key={t.id}>
                            <TableRow
                              className={cn(
                                "cursor-pointer transition-colors border-b border-slate-100 last:border-0 hover:bg-slate-50/80",
                                isExpanded && "bg-slate-50/60"
                              )}
                              onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                            >
                              <TableCell className="py-3.5 pl-6 font-mono text-xs text-slate-600">
                                <div
                                  className="flex items-center gap-1.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>#{t.id.slice(0, 8)}</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-400 hover:text-slate-900 transition-colors"
                                    onClick={() => handleCopyId(t.id)}
                                    title="Copy full ticket ID"
                                  >
                                    {copiedId === t.id ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-medium text-slate-900 max-w-[280px]">
                                <span className="truncate block">{t.subject}</span>
                              </TableCell>
                              <TableCell className="text-xs text-slate-600">
                                {t.category}
                              </TableCell>
                              <TableCell className="text-xs text-slate-500 tabular-nums">
                                {formattedDate}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border",
                                    statusConfig.pill
                                  )}
                                >
                                  <span
                                    className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)}
                                  />
                                  {statusConfig.label}
                                </span>
                              </TableCell>
                              <TableCell className="pr-6 text-right">
                                <ChevronRight
                                  className={cn(
                                    "w-4 h-4 text-slate-400 transition-transform duration-150 inline-block",
                                    isExpanded && "rotate-90 text-slate-700"
                                  )}
                                />
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="border-b border-slate-100 bg-slate-50/40 hover:bg-slate-50/40">
                                <TableCell colSpan={6} className="px-6 py-4">
                                  <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-1.5">
                                    <p className="text-xs font-medium text-slate-500">
                                      Ticket description
                                    </p>
                                    <p className="whitespace-pre-wrap text-xs text-slate-700 leading-relaxed">
                                      {t.description}
                                    </p>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card List View */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {tickets.map((t) => {
                    const isExpanded = expandedTicketId === t.id
                    const statusConfig = getStatusBadge(t.status)
                    const formattedDate =
                      t.submittedAt?.toDate?.()?.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }) ||
                      (t.submittedAt?.seconds
                        ? new Date(t.submittedAt.seconds * 1000).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—")

                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "p-4 transition-colors cursor-pointer space-y-3",
                          isExpanded ? "bg-slate-50/60" : "hover:bg-slate-50/40"
                        )}
                        onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-sm font-medium text-slate-900 leading-snug">
                            {t.subject}
                          </h4>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border shrink-0",
                              statusConfig.pill
                            )}
                          >
                            <span
                              className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)}
                            />
                            {statusConfig.label}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{t.category}</span>
                          <span className="tabular-nums">{formattedDate}</span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <div
                            className="flex items-center gap-1 font-mono text-slate-600"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>#{t.id.slice(0, 8)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-slate-900"
                              onClick={() => handleCopyId(t.id)}
                            >
                              {copiedId === t.id ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                          <span className="text-slate-500 flex items-center gap-1">
                            {isExpanded ? "Hide details" : "View details"}
                            <ChevronRight
                              className={cn(
                                "w-3.5 h-3.5 text-slate-400 transition-transform duration-150",
                                isExpanded && "rotate-90 text-slate-700"
                              )}
                            />
                          </span>
                        </div>

                        {isExpanded && (
                          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1 mt-2">
                            <p className="text-xs font-medium text-slate-500">
                              Ticket description
                            </p>
                            <p className="whitespace-pre-wrap text-xs text-slate-700 leading-relaxed">
                              {t.description}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
