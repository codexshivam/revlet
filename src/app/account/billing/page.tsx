
"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Upload, Landmark, Download, FileCheck, AlertCircle, Loader2, ReceiptText } from "lucide-react"
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
  serverTimestamp,
  orderBy 
} from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'

interface Invoice {
  id: string
  organizationId: string
  organizationName: string
  amount: number
  status: "Paid" | "Unpaid" | "Pending Verification"
  dueDate: string
  ownerId: string
  createdAt: any
}

export default function BillingPage() {
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  // Voucher form state
  const [submissionData, setSubmissionData] = useState({
    invoiceId: "",
    amount: ""
  })

  useEffect(() => {
    if (authLoading) return
    if (!user) return

    const invoicesRef = collection(db, "invoices")
    const q = query(
      invoicesRef, 
      where("ownerId", "==", user.uid)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invoice[]
      
      // Client-side sort if index isn't ready
      setInvoices(fetched.sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || 0
        const dateB = b.createdAt?.toMillis?.() || 0
        return dateB - dateA
      }))
      setIsLoading(false)
    }, async (error) => {
      const permissionError = new FirestorePermissionError({
        path: 'invoices',
        operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [user, authLoading, db])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Voucher must be smaller than 3MB.",
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
    if (!selectedFile || !submissionData.invoiceId || !submissionData.amount) {
      toast({
        variant: "destructive",
        title: "Incomplete Details",
        description: "Please select an invoice, enter amount and attach the voucher.",
      })
      return
    }

    setIsSubmitting(true)
    const vouchersRef = collection(db, "paymentVouchers")
    
    addDoc(vouchersRef, {
      invoiceId: submissionData.invoiceId,
      amount: parseFloat(submissionData.amount),
      ownerId: user.uid,
      submittedAt: serverTimestamp(),
      voucherFileName: selectedFile.name,
      status: "Submitted"
    }).then(() => {
      toast({
        title: "Payment Submitted",
        description: "Proof of payment has been sent for administrative verification.",
      })
      setIsSubmitting(false)
      setIsDialogOpen(false)
      setSelectedFile(null)
      setSubmissionData({ invoiceId: "", amount: "" })
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

  const handleDownloadPDF = (inv: Invoice) => {
    toast({
      title: "Generating Document",
      description: `Downloading invoice ${inv.id} for ${inv.organizationName}.`,
    })
    // Mock PDF generation
    const element = document.createElement("a");
    const content = `EduSphere Invoice: ${inv.id}\nOrg: ${inv.organizationName}\nAmount: NPR ${inv.amount}\nStatus: ${inv.status}`;
    const file = new Blob([content], {type: 'application/pdf'});
    element.href = URL.createObjectURL(file);
    element.download = `Invoice-${inv.id}.pdf`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  const pendingAmount = invoices
    .filter(i => i.status === "Unpaid")
    .reduce((sum, i) => sum + i.amount, 0)

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
          <h1 className="text-3xl font-headline font-bold text-slate-900">Manage Payments & Invoices</h1>
        </div>
        
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="bg-red-50 border border-red-100 p-6 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Outstanding Total Amount</span>
                <p className="text-3xl font-headline font-bold text-red-700">रू {pendingAmount.toLocaleString()}</p>
              </div>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white font-bold h-12 px-8 shadow-lg shadow-red-200">
                    Submit Payment Voucher
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl bg-white p-0 overflow-hidden border-none shadow-2xl">
                  <DialogHeader className="p-6 bg-slate-900 text-white">
                    <DialogTitle className="text-xl font-headline font-bold">Payment Submission Portal</DialogTitle>
                    <p className="text-slate-400 text-xs">Verify your bank transfer and upload proof.</p>
                  </DialogHeader>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                    <div className="p-8 bg-slate-50 border-r border-slate-100 space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <Landmark className="w-5 h-5" />
                          <h3 className="font-bold text-sm uppercase">Global IME Bank</h3>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Account Name</p>
                            <p className="text-xs font-bold text-slate-900 uppercase">EduSphere Tech Pvt. Ltd.</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Account Number</p>
                            <p className="text-sm font-mono font-bold text-primary">123000987654321</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Reference Info</p>
                            <p className="text-[10px] font-medium text-slate-500 italic leading-tight">
                              Please include Institution ID in transfer remarks for auto-reconciliation.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                        <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                          Voucher verification typically takes 2-4 business hours during institutional bank hours.
                        </p>
                      </div>
                    </div>
                    
                    <div className="p-8 space-y-5 flex flex-col justify-center">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Target Invoice</Label>
                          <Select 
                            value={submissionData.invoiceId} 
                            onValueChange={(v) => setSubmissionData({...submissionData, invoiceId: v})}
                          >
                            <SelectTrigger className="h-10 text-xs font-bold">
                              <SelectValue placeholder="Select outstanding invoice" />
                            </SelectTrigger>
                            <SelectContent>
                              {invoices.filter(i => i.status !== "Paid").map(inv => (
                                <SelectItem key={inv.id} value={inv.id} className="text-xs">
                                  {inv.id} - रू {inv.amount.toLocaleString()} ({inv.organizationName})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Transfer Amount (NPR)</Label>
                          <Input 
                            type="number"
                            placeholder="e.g. 45500"
                            className="h-10 text-xs font-bold"
                            value={submissionData.amount}
                            onChange={(e) => setSubmissionData({...submissionData, amount: e.target.value})}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Voucher Upload</Label>
                          <div 
                            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group
                              ${selectedFile ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-primary hover:bg-slate-50'}`}
                            onClick={() => document.getElementById('voucher')?.click()}
                          >
                            {selectedFile ? <FileCheck className="w-8 h-8 text-emerald-500" /> : <Upload className="w-8 h-8 text-slate-300" />}
                            <p className="text-[10px] font-bold text-slate-700 truncate max-w-full">
                              {selectedFile ? selectedFile.name : 'Click to attach receipt'}
                            </p>
                            <Input id="voucher" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                          </div>
                        </div>
                      </div>
                      
                      <Button 
                        onClick={handleConfirmSubmission} 
                        className="w-full bg-slate-900 text-white font-bold h-12 rounded-lg"
                        disabled={isSubmitting || !selectedFile || !submissionData.invoiceId}
                      >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Confirm & Send for Verification"}
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
              <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Institutional Invoice History</CardTitle>
              <Badge variant="outline" className="text-[10px] font-bold text-slate-400 h-5 px-2 bg-white">
                {invoices.length} Statements
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 min-h-[300px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                <p className="text-[10px] font-bold text-slate-400 uppercase">Synchronizing Statements...</p>
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center gap-3">
                <ReceiptText className="w-12 h-12 text-slate-100" />
                <p className="text-sm font-bold text-slate-400">No invoices found for your institutions.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 border-b border-slate-200">
                    <TableHead className="text-[10px] font-bold uppercase py-4 pl-8">Invoice Statement</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4">Institution</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4">Amount (NPR)</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4">Due Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4">Status</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8">Ledger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                      <TableCell className="font-bold text-slate-700 py-5 pl-8 text-xs">{inv.id}</TableCell>
                      <TableCell className="text-slate-600 text-xs font-semibold">{inv.organizationName}</TableCell>
                      <TableCell className="font-mono font-bold text-slate-900 text-xs">रू {inv.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-slate-400 text-xs font-medium">{inv.dueDate}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] px-2 py-0 h-5 font-bold shadow-none rounded
                          ${inv.status === "Paid" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                            inv.status === "Unpaid" ? "bg-red-50 text-red-600 border-red-100" : 
                            "bg-amber-50 text-amber-600 border-amber-100"}`}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/5 text-xs font-bold"
                          onClick={() => handleDownloadPDF(inv)}
                        >
                          <Download className="w-3 h-3" />
                          PDF
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
