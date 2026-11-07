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
import { Mail, MessageSquare, Send, Loader2, Copy, Check, Clock, ChevronRight } from "lucide-react"
import { useUser, useFirestore } from "@/firebase"
import { collection, addDoc, query, where, getDocs, serverTimestamp } from "firebase/firestore"
import { stripScripts, containsMaliciousScript } from "@/lib/security/sanitize"
import { toast } from "@/hooks/use-toast"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import { cn } from "@/lib/utils"
import { PublicSupportView } from "@/components/public/public-support-view"

export default function SupportPage() {
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()

  const [subject, setSubject] = useState("")
  const [category, setCategory] = useState("Technical Support")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [tickets, setTickets] = useState<any[]>([])
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
        const snap = await getDocs(q);
        const fetched = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        // Sort descending by submission timestamp (fallback to seconds)
        fetched.sort((a: any, b: any) => {
          const tA = a.submittedAt?.seconds || 0;
          const tB = b.submittedAt?.seconds || 0;
          return tB - tA;
        });
        setTickets(fetched);
        setIsLoadingTickets(false);
      } catch (error) {
        console.error("Error loading support tickets:", error);
        setIsLoadingTickets(false);
      }
    };

    fetchTickets();
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
        title: "Session Required",
        description: "You must be logged in to submit a support ticket."
      })
      return
    }

    if (!subject.trim() || !category.trim() || !message.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Failed",
        description: "Please fill out all support ticket fields."
      })
      return
    }

    if (containsMaliciousScript(subject) || containsMaliciousScript(message)) {
      toast({
        variant: "destructive",
        title: "Disallowed Content",
        description: "Executable scripts and HTML tags are strictly blocked in support requests."
      })
      return
    }

    const cleanSubject = stripScripts(subject, { maxLength: 200 })
    const cleanMessage = stripScripts(message, { maxLength: 4000 })

    setIsSubmitting(true)
    try {
      const ticketsRef = collection(db, "supportTickets")
      const userEmail = user.email || ""
      const userDisplayName = user.displayName || user.email?.split('@')[0] || "User"
      const docRef = await addDoc(ticketsRef, {
        subject: cleanSubject,
        category: category.trim(),
        description: cleanMessage,
        ownerId: user.uid,
        userEmail,
        userDisplayName,
        submittedAt: serverTimestamp(),
        status: "Open"
      })

      setTickets(prev => [
        {
          id: docRef.id,
          subject: cleanSubject,
          category: category.trim(),
          description: cleanMessage,
          ownerId: user.uid,
          userEmail,
          userDisplayName,
          submittedAt: { seconds: Math.floor(Date.now() / 1000) },
          status: "Open"
        },
        ...prev
      ])

      toast({
        title: "Ticket Created",
        description: "Your support request has been registered securely. Our team will review it shortly."
      })

      // Reset form fields
      setSubject("")
      setMessage("")
      setCategory("Technical Support")
    } catch (error: any) {
      const permissionError = new FirestorePermissionError({
        path: 'supportTickets',
        operation: 'create',
        requestResourceData: { subject, category, message }
      });
      errorEmitter.emit('permission-error', permissionError);
      
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "Failed to submit your support ticket."
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
      <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
        
        {/* RESPONSIVE HEADER BLOCK */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">Contact Support</h1>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-50 px-3.5 py-2 border border-slate-200 rounded-full shadow-sm shrink-0 max-w-full overflow-hidden">
            <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">direct support email:</span>
            <a href="mailto:hello@revlet.me" className="text-primary hover:underline font-bold truncate">hello@revlet.me</a>
          </div>
        </div>

        <div className="space-y-6">
          {/* Ticket Submission Card */}
          <Card className="w-full bg-white border-slate-200 shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 px-4 sm:px-8 py-5">
              <div className="flex items-center gap-2 text-primary">
                <MessageSquare className="w-5 h-5" />
                <CardTitle className="text-base font-headline font-semibold text-slate-900">Open a Support Ticket</CardTitle>
              </div>
              <CardDescription className="text-xs">Describe your issue in detail and our team will get back to you promptly.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Ticket Subject *</Label>
                  <Input 
                    id="subject" 
                    value={subject} 
                    onChange={(e) => setSubject(e.target.value)} 
                    placeholder="e.g. DNS Propagation Issue" 
                    className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded-lg text-xs font-normal px-3"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Category *</Label>
                  <Select 
                    value={category} 
                    onValueChange={(v) => setCategory(v)}
                  >
                    <SelectTrigger className="h-10 text-xs font-semibold border-[#c6c6cd] bg-white rounded-lg">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Technical Support" className="text-xs">Technical Support</SelectItem>
                      <SelectItem value="Billing & Payments" className="text-xs">Billing & Payments</SelectItem>
                      <SelectItem value="DNS & Network" className="text-xs">DNS & Network</SelectItem>
                      <SelectItem value="Bug Report" className="text-xs">Bug Report</SelectItem>
                      <SelectItem value="General Inquiry" className="text-xs">General Inquiry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="message" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Detailed Description *</Label>
                <Textarea 
                  id="message" 
                  value={message} 
                  onChange={(e) => setMessage(e.target.value)} 
                  placeholder="Please provide specific details, including domain names and steps to reproduce any errors..." 
                  className="min-h-[150px] border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded-lg text-xs font-normal p-3"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-medium leading-none text-center sm:text-left">
                  Managed by Revlet.
                </p>
                <Button 
                  onClick={handleSubmitTicket} 
                  disabled={isSubmitting} 
                  className="bg-primary hover:bg-primary/95 text-white font-bold h-10 w-full sm:w-auto px-8 rounded-lg shadow-sm flex items-center justify-center gap-2 text-xs"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit Ticket
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Support Tickets Associated with the Account */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-xl overflow-hidden mt-8">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200 px-4 sm:px-8 py-4 flex flex-row items-center justify-between gap-2">
            <div className="space-y-0.5">
              <CardTitle className="text-lg font-headline font-bold text-slate-900">Your Support Tickets</CardTitle>
              <CardDescription className="text-xs">History and status of your help requests.</CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold text-slate-400 bg-white px-2.5 py-0.5 h-5 rounded shrink-0">
              {tickets.length} Tickets
            </Badge>
          </CardHeader>
          <CardContent className="p-0 min-h-[180px]">
            {isLoadingTickets ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading help history...</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-2 px-4">
                <MessageSquare className="w-10 h-10 text-slate-200" />
                <p className="text-sm font-bold text-slate-400">No support tickets found.</p>
                <p className="text-[10px] text-slate-400 max-w-xs leading-normal">Submit a ticket using the form above to reach our Network Ops desk.</p>
              </div>
            ) : (
              <>
                {/* DESKTOP TABLE VIEW */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 border-b border-slate-200">
                        <TableHead className="text-[10px] font-bold uppercase py-4 pl-8 text-slate-400 tracking-widest">Ticket ID</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-slate-400 tracking-widest">Subject</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-slate-400 tracking-widest">Category</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-slate-400 tracking-widest">Date Opened</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-slate-400 tracking-widest">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tickets.map((t) => {
                        const isExpanded = expandedTicketId === t.id
                        return (
                          <React.Fragment key={t.id}>
                            <TableRow 
                              className={cn(
                                "hover:bg-[#F8FAFC] cursor-pointer transition-colors border-b border-slate-100 last:border-0",
                                isExpanded && "bg-slate-50/50"
                              )}
                              onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                            >
                              <TableCell className="font-bold text-slate-700 py-5 pl-8">
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-xs font-mono">{t.id.substring(0, 8)}...</span>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-slate-300 hover:text-primary transition-colors"
                                    onClick={() => handleCopyId(t.id)}
                                  >
                                    {copiedId === t.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="text-slate-900 text-xs font-semibold max-w-[250px] truncate">
                                <span className="truncate">{t.subject}</span>
                              </TableCell>
                              <TableCell className="text-slate-600 text-xs font-semibold">{t.category}</TableCell>
                              <TableCell className="text-slate-400 text-xs font-medium">
                                {t.submittedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-between gap-2">
                                  <Badge className={`text-[9px] px-2 py-0.5 h-6 font-bold shadow-none rounded border uppercase tracking-wider
                                    ${t.status === "Resolved" || t.status === "Closed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                                      t.status === "In Progress" ? "bg-blue-50 text-blue-600 border-blue-100" : 
                                      "bg-amber-50 text-amber-600 border-amber-100"}`}>
                                    {t.status || "Open"}
                                  </Badge>
                                  <ChevronRight className={cn("w-3.5 h-3.5 text-slate-300 transition-transform duration-200", isExpanded && "rotate-90 text-primary")} />
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="bg-slate-50/20 hover:bg-slate-50/20 border-b border-slate-100">
                                <TableCell colSpan={5} className="pl-8 pr-8 py-4 bg-slate-50/20">
                                  <div className="p-5 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Ticket Description</p>
                                    <p className="whitespace-pre-wrap font-medium text-slate-700 text-xs leading-relaxed">{t.description}</p>
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

                {/* MOBILE RESPONSIVE CARD LIST VIEW */}
                <div className="block md:hidden space-y-6 py-6 px-4">
                  {tickets.map((t) => {
                    const isExpanded = expandedTicketId === t.id
                    return (
                      <div 
                        key={t.id}
                        className={cn(
                          "bg-white border rounded-xl p-6 relative overflow-hidden transition-all shadow-sm flex flex-col gap-4 cursor-pointer hover:border-slate-300",
                          isExpanded ? "border-primary ring-2 ring-primary/5 shadow-primary/5" : "border-slate-200"
                        )}
                        onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                      >
                        {/* Left visual strip status color indicator */}
                        <div 
                          className={cn(
                            "absolute left-0 top-0 bottom-0 w-[5px]",
                            t.status === "Resolved" || t.status === "Closed" ? "bg-emerald-500" :
                            t.status === "In Progress" ? "bg-blue-500" : "bg-amber-500"
                          )}
                        />

                        {/* Top Row: Subject & Status badge */}
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-headline font-bold text-slate-800 text-sm leading-snug">{t.subject}</span>
                          <Badge className={`text-[9px] px-2 py-0.5 h-6 font-bold shadow-none rounded border uppercase tracking-wider shrink-0
                            ${t.status === "Resolved" || t.status === "Closed" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                              t.status === "In Progress" ? "bg-blue-50 text-blue-600 border-blue-100" : 
                              "bg-amber-50 text-amber-600 border-amber-100"}`}>
                            {t.status || "Open"}
                          </Badge>
                        </div>

                        {/* Middle metadata: Category & Date */}
                        <div className="grid grid-cols-2 gap-3 text-slate-500 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                            <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{t.category}</span>
                          </div>
                          <div className="flex items-center gap-1.5 justify-end text-slate-400 font-medium">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{t.submittedAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                          </div>
                        </div>

                        {/* ID Block and View detail Toggle */}
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                          <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400" onClick={(e) => e.stopPropagation()}>
                            <span className="font-bold uppercase tracking-widest text-[8px] text-slate-400 mr-0.5">ID:</span>
                            <span>{t.id.substring(0, 8)}...</span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-slate-350 hover:text-primary transition-colors shrink-0"
                              onClick={() => handleCopyId(t.id)}
                            >
                              {copiedId === t.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </Button>
                          </div>
                          
                          <div className="flex items-center gap-1 text-[10px] font-bold text-primary">
                            <span>{isExpanded ? "Hide details" : "View details"}</span>
                            <ChevronRight className={cn("w-3.5 h-3.5 text-primary transition-transform duration-200 shrink-0", isExpanded && "rotate-90")} />
                          </div>
                        </div>

                        {/* Collapsible ticket description overlay */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                            <div className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-1.5 mt-1">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Ticket Description</p>
                              <p className="whitespace-pre-wrap font-medium text-slate-700 text-xs leading-relaxed">{t.description}</p>
                            </div>
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
