
"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
  Upload, 
  Landmark, 
  FileCheck, 
  AlertCircle, 
  Loader2, 
  ReceiptText, 
  MapPin, 
  Copy, 
  Check, 
  User as UserIcon,
  CreditCard
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'

interface Organization {
  id: string
  name: string
  outstandingAmount: number
}

interface PaymentVoucher {
  id: string
  organizationId: string
  organizationName: string
  amount: number
  submittedAt: any
  voucherFileName: string
  status: "Not verified" | "Verified" | "Rejected"
}

export default function BillingPage() {
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()

  const [orgs, setOrgs] = useState<Organization[]>([])
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
  // Voucher form state
  const [submissionData, setSubmissionData] = useState({
    organizationId: "",
    amount: ""
  })

  useEffect(() => {
    if (authLoading || !user) return

    // Fetch User Organizations
    const orgsRef = collection(db, "organizations")
    const qOrgs = query(orgsRef, where("ownerId", "==", user.uid))
    
    const unsubOrgs = onSnapshot(qOrgs, (snap) => {
      setOrgs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Organization[])
    })

    // Fetch Vouchers
    const vouchersRef = collection(db, "paymentVouchers")
    const qVouchers = query(vouchersRef, where("ownerId", "==", user.uid))

    const unsubVouchers = onSnapshot(qVouchers, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PaymentVoucher[]
      
      setVouchers(fetched.sort((a, b) => {
        const dateA = a.submittedAt?.toMillis?.() || 0
        const dateB = b.submittedAt?.toMillis?.() || 0
        return dateB - dateA
      }))
      setIsLoading(false)
    }, async (error) => {
      const permissionError = new FirestorePermissionError({
        path: 'paymentVouchers',
        operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
      setIsLoading(false)
    })

    return () => {
      unsubOrgs()
      unsubVouchers()
    }
  }, [user, authLoading, db])

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    toast({ title: "Copied", description: "Voucher ID copied to clipboard." })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Voucher must be smaller than 5MB.",
        })
        e.target.value = ""
        return
      }
      setSelectedFile(file)
      toast({ title: "Voucher Attached", description: file.name })
    }
  }

  const handleConfirmSubmission = async () => {
    if (!user) return
    if (!selectedFile || !submissionData.organizationId || !submissionData.amount) {
      toast({
        variant: "destructive",
        title: "Incomplete Details",
        description: "Please select an organization, enter amount and attach the voucher.",
      })
      return
    }

    setIsSubmitting(true)
    const vouchersRef = collection(db, "paymentVouchers")
    const targetOrg = orgs.find(o => o.id === submissionData.organizationId)
    
    addDoc(vouchersRef, {
      organizationId: submissionData.organizationId,
      organizationName: targetOrg?.name || "Unknown Institution",
      amount: parseFloat(submissionData.amount),
      ownerId: user.uid,
      submittedAt: serverTimestamp(),
      voucherFileName: selectedFile.name,
      status: "Not verified"
    }).then(() => {
      toast({
        title: "Payment Submitted",
        description: "Proof of payment has been sent for administrative verification.",
      })
      setIsSubmitting(false)
      setIsDialogOpen(false)
      setSelectedFile(null)
      setSubmissionData({ organizationId: "", amount: "" })
    }).catch(async (error) => {
      const permissionError = new FirestorePermissionError({
        path: 'paymentVouchers',
        operation: 'create',
        requestResourceData: submissionData
      });
      errorEmitter.emit('permission-error', permissionError);
      setIsSubmitting(false)
    })
  }

  const totalOutstanding = orgs.reduce((sum, o) => sum + (o.outstandingAmount || 0), 0)

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Securing Financial Data...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Billing & Finance</span>
          <h1 className="text-3xl font-headline font-bold text-slate-900">Manage Payments</h1>
        </div>
        
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="bg-red-50 border border-red-100 p-6 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Total Outstanding Balance</span>
                <p className="text-3xl font-headline font-bold text-red-700">रू {totalOutstanding.toLocaleString()}</p>
              </div>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white font-bold h-12 px-8 shadow-lg shadow-red-200">
                    Submit Payment Voucher
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl bg-white p-0 overflow-hidden border-none shadow-2xl">
                  <DialogHeader className="p-6 bg-slate-900 text-white">
                    <DialogTitle className="text-xl font-headline font-bold">Payment Submission Portal</DialogTitle>
                    <p className="text-slate-400 text-xs">Verify your bank transfer and upload proof.</p>
                  </DialogHeader>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                    <div className="p-8 bg-slate-50 border-r border-slate-100 space-y-8">
                      <div className="space-y-6">
                        <div className="flex items-center gap-2 text-primary">
                          <Landmark className="w-5 h-5" />
                          <h3 className="font-bold text-sm uppercase tracking-wider">Authorised Bank Details</h3>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
                                <UserIcon className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1">
                                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter leading-none mb-1">Account Name</p>
                                <p className="text-sm font-bold text-slate-900 uppercase">Shivam Yadav</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
                                <CreditCard className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1">
                                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter leading-none mb-1">Account Number</p>
                                <p className="text-base font-mono font-bold text-primary tracking-tight">16007010030603</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
                                <Landmark className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1">
                                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter leading-none mb-1">Bank</p>
                                <p className="text-xs font-bold text-slate-700">Global IME Bank Limited</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center">
                                <MapPin className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex-1">
                                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter leading-none mb-1">Branch</p>
                                <p className="text-xs font-bold text-slate-700 uppercase">Bhaisepati Branch</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                        <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                          Verification is manually processed by our accounts team. Please ensure the reference note includes your Institution Code.
                        </p>
                      </div>
                    </div>
                    
                    <div className="p-8 space-y-6 flex flex-col justify-center">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Institution</Label>
                          <Select 
                            value={submissionData.organizationId} 
                            onValueChange={(v) => setSubmissionData({...submissionData, organizationId: v})}
                          >
                            <SelectTrigger className="h-10 text-xs font-bold border-slate-200">
                              <SelectValue placeholder="Select institution" />
                            </SelectTrigger>
                            <SelectContent>
                              {orgs.map(org => (
                                <SelectItem key={org.id} value={org.id} className="text-xs">
                                  {org.name} (NPR {org.outstandingAmount?.toLocaleString() || 0})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Transfer Amount (NPR)</Label>
                          <Input 
                            type="number"
                            placeholder="e.g. 15000"
                            className="h-10 text-xs font-bold border-slate-200"
                            value={submissionData.amount}
                            onChange={(e) => setSubmissionData({...submissionData, amount: e.target.value})}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Voucher Upload</Label>
                          <div 
                            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group
                              ${selectedFile ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-primary hover:bg-slate-50'}`}
                            onClick={() => document.getElementById('voucher-upload')?.click()}
                          >
                            {selectedFile ? <FileCheck className="w-10 h-10 text-emerald-500" /> : <Upload className="w-10 h-10 text-slate-300 group-hover:text-primary transition-colors" />}
                            <div className="text-center">
                              <p className="text-[11px] font-bold text-slate-700 truncate max-w-[200px]">
                                {selectedFile ? selectedFile.name : 'Click to attach payment receipt'}
                              </p>
                              <p className="text-[9px] text-slate-400 mt-0.5">PDF, JPG or PNG (Max 5MB)</p>
                            </div>
                            <Input id="voucher-upload" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                          </div>
                        </div>
                      </div>
                      
                      <Button 
                        onClick={handleConfirmSubmission} 
                        className="w-full bg-slate-900 text-white font-bold h-12 rounded-lg hover:bg-black transition-all"
                        disabled={isSubmitting || !selectedFile || !submissionData.organizationId}
                      >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Submit for Verification"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200 px-8 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Submission History</CardTitle>
              <Badge variant="outline" className="text-[10px] font-bold text-slate-400 h-5 px-2 bg-white">
                {vouchers.length} Records
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 min-h-[300px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                <p className="text-[10px] font-bold text-slate-400 uppercase">Synchronizing Submissions...</p>
              </div>
            ) : vouchers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center gap-3">
                <ReceiptText className="w-12 h-12 text-slate-100" />
                <p className="text-sm font-bold text-slate-400">No payment records found.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 border-b border-slate-200">
                    <TableHead className="text-[10px] font-bold uppercase py-4 pl-8">Voucher ID</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4">Institution</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4">Amount (NPR)</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4">Submitted Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4">Status</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((v) => (
                    <TableRow key={v.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                      <TableCell className="font-bold text-slate-700 py-5 pl-8">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono">{v.id.substring(0, 8)}...</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-slate-300 hover:text-primary transition-colors"
                            onClick={() => handleCopyId(v.id)}
                          >
                            {copiedId === v.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 text-xs font-semibold">{v.organizationName}</TableCell>
                      <TableCell className="font-mono font-bold text-slate-900 text-xs">रू {v.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-slate-400 text-xs font-medium">
                        {v.submittedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] px-2 py-0.5 h-6 font-bold shadow-none rounded border
                          ${v.status === "Verified" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                            v.status === "Rejected" ? "bg-red-50 text-red-600 border-red-100" : 
                            "bg-amber-50 text-amber-600 border-amber-100"}`}>
                          {v.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 gap-1.5 text-slate-500 hover:text-primary hover:bg-primary/5 text-xs font-bold"
                          onClick={() => toast({ title: "View Document", description: `File: ${v.voucherFileName}` })}
                        >
                          View Receipt
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
    </DashboardShell>
  )
}
