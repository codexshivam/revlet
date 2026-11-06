
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
  CreditCard,
  X,
  Eye
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { useUser, useFirestore, useFirebaseApp } from "@/firebase"
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore"
import { errorEmitter } from '@/firebase/error-emitter'
import { FirestorePermissionError } from '@/firebase/errors'
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { cn } from "@/lib/utils"

interface Organization {
  id: string
  name: string
  outstandingAmount: number
}

interface PaymentVoucher {
  id: string
  organizationId: string
  amount: number
  submittedAt: any
  voucherFileName: string
  voucherUrl?: string
  status: "Not verified" | "Verified" | "Rejected"
}

function PaymentTableSkeleton() {
  return (
    <div className="w-full divide-y divide-slate-100 animate-pulse bg-white">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-5 pl-4 sm:pl-8 pr-4 sm:pr-8">
          <div className="flex flex-col gap-2">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-3 w-16 bg-slate-100 rounded" />
          </div>
          <div className="h-4 w-36 bg-slate-150 rounded hidden md:block" />
          <div className="h-4 w-20 bg-slate-100 rounded" />
          <div className="h-6 w-20 bg-slate-100 rounded-full" />
          <div className="h-8 w-24 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

export default function BillingPage() {
  const { user, loading: authLoading } = useUser()
  const db = useFirestore()
  const app = useFirebaseApp()

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
    
    const vouchersRef = collection(db, "paymentVouchers")
    const qVouchers = query(vouchersRef, where("ownerId", "==", user.uid))

    const fetchData = async () => {
      try {
        const [orgsSnap, vouchersSnap] = await Promise.all([
          getDocs(qOrgs),
          getDocs(qVouchers)
        ]);

        setOrgs(orgsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Organization[]);

        const fetched = vouchersSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PaymentVoucher[];
        
        setVouchers(fetched.sort((a, b) => {
          const dateA = a.submittedAt?.toMillis?.() || 0
          const dateB = b.submittedAt?.toMillis?.() || 0
          return dateB - dateA
        }));
        setIsLoading(false);
      } catch (error) {
        const permissionError = new FirestorePermissionError({
          path: 'paymentVouchers',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setIsLoading(false);
      }
    };

    fetchData();
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

  const compressImage = (file: File): Promise<Blob | File> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        resolve(file); // PDFs or other documents uploaded directly without compression
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Standard premium target resolution for verification is 1200px max edge
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  resolve(file);
                }
              },
              "image/jpeg",
              0.65 // Compress to highly efficient 65% quality
            );
          } else {
            resolve(file);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

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
    try {
      // 1. Process and compress file to save bandwidth & storage
      const processedFile = await compressImage(selectedFile)

      // 2. Upload proof to Firebase Storage
      const storageInstance = getStorage(app)
      const storagePath = `vouchers/${user.uid}/${Date.now()}_${selectedFile.name}`
      const storageRef = ref(storageInstance, storagePath)

      const uploadResult = await uploadBytes(storageRef, processedFile)
      const voucherUrl = await getDownloadURL(uploadResult.ref)

      // 3. Write metadata to Cloud Firestore
      const vouchersRef = collection(db, "paymentVouchers")
      const targetOrg = orgs.find(o => o.id === submissionData.organizationId)
      
      const docRef = await addDoc(vouchersRef, {
        organizationId: submissionData.organizationId,
        amount: parseFloat(submissionData.amount),
        ownerId: user.uid,
        submittedAt: serverTimestamp(),
        voucherFileName: selectedFile.name,
        voucherUrl: voucherUrl,
        status: "Not verified"
      })

      setVouchers(prev => [
        {
          id: docRef.id,
          organizationId: submissionData.organizationId,
          amount: parseFloat(submissionData.amount),
          submittedAt: { toMillis: () => Date.now() },
          voucherFileName: selectedFile.name,
          voucherUrl: voucherUrl,
          status: "Not verified"
        },
        ...prev
      ])

      toast({
        title: "Payment Submitted",
        description: "Proof of payment has been successfully compressed, uploaded, and submitted for verification.",
      })
      setIsSubmitting(false)
      setIsDialogOpen(false)
      setSelectedFile(null)
      setSubmissionData({ organizationId: "", amount: "" })
    } catch (error: any) {
      const permissionError = new FirestorePermissionError({
        path: 'paymentVouchers',
        operation: 'create',
        requestResourceData: submissionData
      });
      errorEmitter.emit('permission-error', permissionError);
      
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "An unexpected error occurred during receipt upload.",
      })
      setIsSubmitting(false)
    }
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
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Billing & Finance</span>
          <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">Manage Payments</h1>
        </div>
        
        <Card className="bg-white border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <CardContent className="p-4 sm:p-6 md:p-8">
            <div className="bg-slate-50 border border-slate-100 p-4 sm:p-6 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Outstanding Balance</span>
                <p className="text-3xl font-headline font-bold text-slate-900">रू {totalOutstanding.toLocaleString()}</p>
              </div>
              
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-primary hover:bg-primary/95 text-white font-bold h-11 w-full md:w-auto px-8 shadow-md shadow-primary/10 rounded-lg">
                    Submit Payment Voucher
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl bg-white p-5 sm:p-6 border border-slate-200 rounded-xl shadow-2xl space-y-6">
                  <DialogHeader className="p-0">
                    <DialogTitle className="text-lg font-headline font-semibold text-slate-900">Submit Payment Voucher</DialogTitle>
                    <p className="text-slate-400 text-xs mt-1">Upload proof of bank transfer for manual verification.</p>
                  </DialogHeader>

                  {/* Compact Bank Details Box in clean responsive grid */}
                  <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1 leading-none">Beneficiary</p>
                      <p className="font-bold text-slate-800 uppercase truncate">Shivam Yadav</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1 leading-none">Account Number</p>
                      <p className="font-mono font-bold text-slate-800 truncate">16007010030603</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1 leading-none">Bank Name</p>
                      <p className="font-bold text-slate-800 truncate">Global IME Bank</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Institution</Label>
                        <Select 
                          value={submissionData.organizationId} 
                          onValueChange={(v) => setSubmissionData({...submissionData, organizationId: v})}
                        >
                          <SelectTrigger className="h-10 text-xs font-semibold border-slate-200 bg-white rounded">
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
                        <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Transfer Amount (NPR)</Label>
                        <Input 
                          type="number"
                          placeholder="e.g. 15000"
                          className="h-10 text-xs font-normal border-[#c6c6cd] rounded"
                          value={submissionData.amount}
                          onChange={(e) => setSubmissionData({...submissionData, amount: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Voucher Upload</Label>
                      <div 
                        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group
                          ${selectedFile ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 hover:border-primary hover:bg-slate-50'}`}
                        onClick={() => document.getElementById('voucher-upload')?.click()}
                      >
                        {selectedFile ? <FileCheck className="w-8 h-8 text-emerald-500" /> : <Upload className="w-8 h-8 text-slate-300 group-hover:text-primary transition-colors" />}
                        <div className="text-center">
                          <p className="text-[10px] font-bold text-slate-700 truncate max-w-[320px]">
                            {selectedFile ? selectedFile.name : 'Click or drag to attach receipt'}
                          </p>
                          <p className="text-[8px] text-slate-400 mt-0.5">PDF, JPG or PNG (Max 5MB)</p>
                        </div>
                        <Input id="voucher-upload" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                      </div>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handleConfirmSubmission} 
                    className="w-full bg-primary hover:bg-primary/95 text-white font-bold h-11 rounded hover:bg-black transition-all text-xs"
                    disabled={isSubmitting || !selectedFile || !submissionData.organizationId}
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Submit for Verification"}
                  </Button>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
 
        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200 px-4 sm:px-8 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Submission History</CardTitle>
              <Badge variant="outline" className="text-[10px] font-bold text-slate-400 h-5 px-2 bg-white rounded">
                {vouchers.length} Records
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 min-h-[300px]">
            {isLoading ? (
              <PaymentTableSkeleton />
            ) : vouchers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center gap-3">
                <ReceiptText className="w-12 h-12 text-slate-100" />
                <p className="text-sm font-bold text-slate-400">No payment records found.</p>
              </div>
            ) : (
              <>
                {/* DESKTOP TABLE VIEW */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 border-b border-slate-200">
                        <TableHead className="text-[10px] font-bold uppercase py-4 pl-8 text-slate-400 tracking-widest">Voucher ID</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-slate-400 tracking-widest">Institution</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-slate-400 tracking-widest">Amount (NPR)</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-slate-400 tracking-widest">Submitted Date</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-slate-400 tracking-widest">Status</TableHead>
                        <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-8 text-slate-400 tracking-widest">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vouchers.map((v) => (
                        <TableRow key={v.id} className="hover:bg-[#F8FAFC] transition-colors border-b border-slate-100 last:border-0">
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
                          <TableCell className="text-slate-600 text-xs font-semibold">
                            {orgs.find(o => o.id === v.organizationId)?.name || "Unknown Institution"}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-slate-900 text-xs">रू {v.amount.toLocaleString()}</TableCell>
                          <TableCell className="text-slate-400 text-xs font-medium">
                            {v.submittedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[9px] px-2 py-0.5 h-6 font-bold shadow-none rounded border pointer-events-none select-none
                              ${v.status === "Verified" ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:text-emerald-600" : 
                                v.status === "Rejected" ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-50 hover:text-red-600" : 
                                "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-50 hover:text-amber-600"}`}>
                              {v.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-8">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 gap-1.5 text-slate-500 hover:text-primary hover:bg-primary/5 text-xs font-bold rounded"
                              onClick={() => {
                                if (v.voucherUrl) {
                                  window.open(v.voucherUrl, "_blank")
                                } else {
                                  toast({ 
                                    variant: "destructive",
                                    title: "Document Not Found", 
                                    description: `Receipt file "${v.voucherFileName}" does not have a public upload URL.` 
                                  })
                                }
                              }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Receipt
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* MOBILE RESPONSIVE CARD LIST VIEW */}
                <div className="block md:hidden space-y-6 py-6 px-4">
                  {vouchers.map((v) => (
                    <div 
                      key={v.id}
                      className="bg-white border border-slate-200 rounded-xl p-6 relative overflow-hidden transition-all shadow-sm flex flex-col gap-4"
                    >
                      {/* Left status color indicator strip */}
                      <div 
                        className={cn(
                          "absolute left-0 top-0 bottom-0 w-[5px]",
                          v.status === "Verified" ? "bg-emerald-500" :
                          v.status === "Rejected" ? "bg-red-500" : "bg-amber-500"
                        )}
                      />

                      {/* Top Row: Institution Name & Status Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-headline font-bold text-slate-800 text-sm leading-snug">
                          {orgs.find(o => o.id === v.organizationId)?.name || "Unknown Institution"}
                        </span>
                        <Badge className={`text-[9px] px-2 py-0.5 h-6 font-bold shadow-none rounded border uppercase tracking-wider shrink-0 pointer-events-none select-none
                          ${v.status === "Verified" ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-50 hover:text-emerald-600" : 
                            v.status === "Rejected" ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-50 hover:text-red-600" : 
                            "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-50 hover:text-amber-600"}`}>
                          {v.status}
                        </Badge>
                      </div>

                      {/* Middle Row: Amount & Date */}
                      <div className="grid grid-cols-2 gap-3 text-slate-500 text-xs">
                        <div>
                          <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5 leading-none">Amount</p>
                          <p className="font-mono font-bold text-slate-900 text-sm">रू {v.amount.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-0.5 leading-none">Submitted Date</p>
                          <p className="font-medium text-slate-600">{v.submittedAt?.toDate?.().toLocaleDateString() || 'N/A'}</p>
                        </div>
                      </div>

                      {/* Bottom Row: Voucher ID with Copy & View Receipt Action */}
                      <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                        <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                          <span className="font-bold uppercase tracking-widest text-[8px] text-slate-400 mr-0.5">ID:</span>
                          <span>{v.id.substring(0, 8)}...</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-slate-350 hover:text-primary transition-colors shrink-0"
                            onClick={() => handleCopyId(v.id)}
                          >
                            {copiedId === v.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>

                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 gap-1.5 text-slate-500 hover:text-primary hover:bg-primary/5 text-xs font-bold rounded-lg px-3 shrink-0"
                          onClick={() => {
                            if (v.voucherUrl) {
                              window.open(v.voucherUrl, "_blank")
                            } else {
                              toast({ 
                                variant: "destructive",
                                title: "Document Not Found", 
                                description: `Receipt file "${v.voucherFileName}" does not have a public upload URL.` 
                              })
                            }
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Receipt
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
