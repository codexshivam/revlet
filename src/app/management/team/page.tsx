
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { UserPlus, MoreHorizontal, Shield } from "lucide-react"

const team = [
  { name: "Rajesh Karki", email: "rajesh@kvm.edu.np", role: "Admin", status: true },
  { name: "Sunita Poudel", email: "sunita@edusphere.np", role: "IT Support", status: true },
  { name: "Bibek Thapa", email: "bibek@billing.np", role: "Billing Manager", status: false },
]

export default function TeamManagementPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-headline font-bold text-slate-900">Team Management Panel</h1>
          <Button className="font-bold gap-2">
            <UserPlus className="w-4 h-4" />
            Invite Member
          </Button>
        </div>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200">
            <CardTitle className="text-sm font-bold text-slate-600">Role-Based Access List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[10px] font-bold uppercase py-3">Team Member</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Access Level Role</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3">Active Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((member) => (
                  <TableRow key={member.email}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{member.name}</span>
                        <span className="text-xs text-slate-500">{member.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 font-bold text-[10px] px-2 py-0.5">
                        <Shield className="w-3 h-3 mr-1 text-slate-400" />
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch checked={member.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                        <MoreHorizontal className="w-4 h-4" />
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
