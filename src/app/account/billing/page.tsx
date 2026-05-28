
"use client"

import { useState } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Upload, Landmark, Download, FileCheck, AlertCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"

export default function BillingPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 3MB limit: 3 * 1024 * 1024 bytes
      if (file.size > 3 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Please select a file smaller than 3MB.",
        })
        e.target.value = ""
        return
      }

      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
      if (!allowedTypes.includes(file.type)) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Only PDF, JPG, and PNG files are accepted.",
        })
        e.target.value = ""
        return
      }

      setSelectedFile(file)
      toast({
        title: "File selected",
        description: `${file.name} attached successfully.`,
      })
    }
  }

  const handleConfirmSubmission = () => {
    if (!selectedFile) {
      toast({
        variant: "destructive",
        title: "No file selected",
        description: "Please upload your payment voucher first.",
      })
      return
    }

    setIsSubmitting(true)
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false)
      setSelectedFile(null)
      toast({
        title: "Payment Submitted",
        description: "Your proof of payment has been sent for verification.",
      })
    }, 1500)
  }

  const handleDownloadPDF = (id: string) => {
    toast({
      title: "Downloading Invoice",
      description: `Preparing ${id} for download...`,
    })
    // Simulate download
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold text-slate-900">Manage Payments & Invoices</h1>
        
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="bg-red-50 border border-red-100 p-6 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Pending Invoice Amount</span>
                <p className="text-3xl font-headline font-bold text-red-700">NPR 45,500.00</p>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white font-bold h-12 px-8">
                    Submit Payment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl bg-white p-0 overflow-hidden border-none shadow-2xl">
                  <DialogHeader className="p-6 bg-slate-900 text-white">
                    <DialogTitle className="text-xl font-headline font-bold">Payment Submission Portal</DialogTitle>
                    <p className="text-slate-400 text-xs">Upload your bank transfer receipt for verification.</p>
                  </DialogHeader>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                    <div className="p-8 bg-slate-50 border-r border-slate-100 space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary">
                          <Landmark className="w-5 h-5" />
                          <h3 className="font-bold">Bank Details</h3>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Bank Name</p>
                            <p className="text-sm font-bold text-slate-900">Global IME Bank</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Account Name</p>
                            <p className="text-sm font-bold text-slate-900">EduSphere Tech Pvt. Ltd.</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Account Number</p>
                            <p className="text-sm font-mono font-bold text-primary">123000987654321</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Branch</p>
                            <p className="text-sm font-bold text-slate-900">Kantipath, Kathmandu</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                        <p className="text-[10px] text-amber-700 leading-relaxed">
                          Please ensure the transfer description includes your <strong>Institution ID</strong> for faster processing.
                        </p>
                      </div>
                    </div>
                    
                    <div className="p-8 space-y-6 flex flex-col justify-center">
                      <div className="space-y-4">
                        <Label htmlFor="voucher" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Proof of Payment</Label>
                        <div 
                          className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group
                            ${selectedFile ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-primary hover:bg-slate-50/50'}`}
                          onClick={() => document.getElementById('voucher')?.click()}
                        >
                          {selectedFile ? (
                            <FileCheck className="w-10 h-10 text-emerald-500" />
                          ) : (
                            <Upload className="w-10 h-10 text-slate-300 group-hover:text-primary transition-colors" />
                          )}
                          <div className="text-center">
                            <p className="text-xs font-bold text-slate-700">
                              {selectedFile ? selectedFile.name : 'Click to select file'}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">PDF, JPG, PNG (Max 3MB)</p>
                          </div>
                          <Input 
                            id="voucher" 
                            type="file" 
                            className="hidden" 
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleFileChange}
                          />
                        </div>
                      </div>
                      
                      <Button 
                        onClick={handleConfirmSubmission} 
                        className="w-full h-12 font-bold shadow-lg shadow-primary/10"
                        disabled={isSubmitting || !selectedFile}
                      >
                        {isSubmitting ? "Processing..." : "Confirm & Send Submission"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200">
            <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Invoice History Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[10px] font-bold uppercase py-3 pl-6">Invoice ID</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Date</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Amount (NPR)</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { id: "INV-2024-001", date: "May 12, 2024", amount: "45,500.00", status: "Unpaid" },
                  { id: "INV-2024-002", date: "Apr 10, 2024", amount: "12,200.00", status: "Paid" },
                  { id: "INV-2024-003", date: "Mar 15, 2024", amount: "12,200.00", status: "Paid" },
                ].map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                    <TableCell className="font-bold text-slate-700 py-4 pl-6 text-xs">{inv.id}</TableCell>
                    <TableCell className="text-slate-400 text-xs font-medium">{inv.date}</TableCell>
                    <TableCell className="font-mono font-bold text-slate-900 text-xs">रू {inv.amount}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] px-2 py-0 h-5 font-bold shadow-none ${inv.status === "Paid" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"}`}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/5 text-xs font-bold"
                        onClick={() => handleDownloadPDF(inv.id)}
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
