
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { UserPlus, MoreHorizontal, Shield } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"

const team = [
  { name: "Rajesh Karki", email: "rajesh@kvm.edu.np", role: "Admin", status: true },
  { name: "Sunita Poudel", email: "sunita@edusphere.np", role: "IT Support", status: true },
  { name: "Bibek Thapa", email: "bibek@billing.np", role: "Billing Manager", status: false },
]

export default function TeamManagementPage() {
  const handleInvite = () => {
    toast({
      title: "Invitation Sent",
      description: "A secure access invite has been sent to the team member.",
    })
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-headline font-bold text-slate-900">Team Management Panel</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="font-bold gap-2">
                <UserPlus className="w-4 h-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="member-name">Full Name</Label>
                  <Input id="member-name" placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="member-email">Email Address</Label>
                  <Input id="member-email" type="email" placeholder="john@institution.np" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="member-role">Access Role</Label>
                  <Select defaultValue="IT Support">
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="IT Support">IT Support</SelectItem>
                      <SelectItem value="Billing Manager">Billing Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleInvite}>Send Invitation</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-200">
            <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role-Based Access List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/30 border-b border-slate-200">
                  <TableHead className="text-[10px] font-bold uppercase py-4 pl-6">Team Member</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Access Level Role</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4">Active Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-4 text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((member) => (
                  <TableRow key={member.email} className="hover:bg-slate-50/30 transition-colors border-b border-slate-100 last:border-0">
                    <TableCell className="pl-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-800 text-sm">{member.name}</span>
                        <span className="text-xs text-slate-400 font-medium">{member.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-slate-50 text-slate-600 border-slate-200 font-bold text-[10px] px-2 py-0.5 h-6">
                        <Shield className="w-3 h-3 mr-1.5 text-slate-300" />
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch checked={member.status} className="scale-90" />
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-slate-600">
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
