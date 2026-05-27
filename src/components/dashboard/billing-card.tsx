
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, Receipt, ExternalLink } from "lucide-react"

const invoices = [
  { id: "INV-2024-001", date: "2024-03-15", institution: "KU", amount: " रू 45,000", status: "Paid" },
  { id: "INV-2024-002", date: "2024-03-20", institution: "TU", amount: " रू 1,20,000", status: "Pending" },
  { id: "INV-2024-003", date: "2024-03-22", institution: "SXC", amount: " रू 12,500", status: "Overdue" },
]

export function BillingCard() {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-base font-headline font-bold">
          Institutional Billing (NPR)
        </CardTitle>
        <Receipt className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
              <span className="text-[10px] font-bold text-blue-600 uppercase">Outstanding Balance</span>
              <p className="text-2xl font-headline font-bold text-blue-900">रू 1,32,500</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Next Cycle</span>
              <p className="text-2xl font-headline font-bold text-slate-900">Apr 1, 2024</p>
            </div>
          </div>

          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="text-[10px] font-bold uppercase py-2">Invoice #</TableHead>
                <TableHead className="text-[10px] font-bold uppercase py-2">Amount</TableHead>
                <TableHead className="text-[10px] font-bold uppercase py-2 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="py-2 text-xs font-medium">{inv.id}</TableCell>
                  <TableCell className="py-2 text-xs font-semibold">{inv.amount}</TableCell>
                  <TableCell className="py-2 text-right">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-5">
            <Upload className="mr-2 h-3.5 w-3.5" />
            Upload Proof of Payment
          </Button>
          <p className="text-[10px] text-center text-slate-400 italic">
            Compatible with eSewa, Khalti, and SCT Gateway Confirmations
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
