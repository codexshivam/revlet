
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Upload, FileText, Landmark, Download } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

export default function BillingPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold text-slate-900">Manage Payments & Invoices</h1>
        
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="bg-red-50 border border-red-100 p-6 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-red-600 uppercase tracking-widest">Pending Invoice Amount</span>
                <p className="text-4xl font-headline font-bold text-red-700">NPR 45,500.00</p>
              </div>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-red-600 hover:bg-red-700 text-white font-bold h-12 px-8">
                    Submit Payment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl bg-white">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-headline font-bold">Payment Submission Portal</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2 text-primary">
                        <Landmark className="w-5 h-5" />
                        <h3 className="font-bold">Bank Details</h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p><span className="text-slate-500">Bank Name:</span> <span className="font-bold">Global IME Bank</span></p>
                        <p><span className="text-slate-500">Account Name:</span> <span className="font-bold">EduSphere Tech Pvt. Ltd.</span></p>
                        <p><span className="text-slate-500">Account No:</span> <span className="font-bold">123000987654321</span></p>
                        <p><span className="text-slate-500">Branch:</span> <span className="font-bold">Kantipath, Kathmandu</span></p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="voucher" className="font-bold">Upload Proof of Payment</Label>
                        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 flex flex-col items-center justify-center gap-2 hover:border-primary transition-colors cursor-pointer bg-slate-50/50">
                          <Upload className="w-8 h-8 text-slate-300" />
                          <p className="text-xs text-slate-500 text-center">Click to upload bank transfer voucher or receipt (PDF, JPG, PNG)</p>
                          <Input id="voucher" type="file" className="hidden" />
                        </div>
                      </div>
                      <Button className="w-full h-11 font-bold">Confirm Submission</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200">
            <CardTitle className="text-sm font-bold text-slate-600">Invoice History Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[10px] font-bold uppercase py-3">Invoice ID</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Date</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Amount (NPR)</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { id: "INV-2024-001", date: "May 12, 2024", amount: "45,500.00", status: "Unpaid" },
                  { id: "INV-2024-002", date: "Apr 10, 2024", amount: "12,200.00", status: "Paid" },
                  { id: "INV-2024-003", date: "Mar 15, 2024", amount: "12,200.00", status: "Paid" },
                ].map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-bold text-slate-700">{inv.id}</TableCell>
                    <TableCell className="text-slate-500">{inv.date}</TableCell>
                    <TableCell className="font-mono font-bold text-slate-900">रू {inv.amount}</TableCell>
                    <TableCell>
                      <Badge className={inv.status === "Paid" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-primary hover:text-primary hover:bg-primary/5">
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
