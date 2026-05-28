
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MoreVertical, Plus, Building2, ExternalLink, Edit2, LogOut, Globe } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { useState, useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import { useAuth, useUser } from "@/firebase"
import { signOut } from "firebase/auth"
import { useRouter } from "next/navigation"

const initialOrgs = [
  { 
    name: "Kathmandu Vidya Mandir", 
    domain: "kvm.edu.np", 
    services: ["DNS", "Hosting", "Workspace"],
    code: "KVM-001"
  },
  { 
    name: "Lalitpur Secondary School", 
    domain: "lss.edu.np", 
    services: ["DNS", "Hosting"],
    code: "LSS-002"
  },
  { 
    name: "Pokhara University Affiliated College", 
    domain: "pac.edu.np", 
    services: ["DNS", "Workspace"],
    code: "PAC-005"
  }
]

export default function AccountHomePage() {
  const router = useRouter()
  const auth = useAuth()
  const { user, loading } = useUser()
  const [orgs, setOrgs] = useState(initialOrgs)
  const [accountName, setAccountName] = useState("EduSphere Platform")

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  const handleAddOrg = () => {
    toast({
      title: "Organization added",
      description: "The new institution has been registered successfully.",
    })
  }

  const handleUpdateAccount = () => {
    toast({
      title: "Account updated",
      description: "Your account name has been changed.",
    })
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      toast({ title: "Logged out", description: "You have been securely signed out." })
      router.push("/login")
    } catch (error: any) {
      toast({ variant: "destructive", title: "Logout Failed", description: error.message })
    }
  }

  if (loading) return null

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account home</span>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-headline font-bold text-slate-900 tracking-tight">
              {user?.displayName || accountName}
            </h1>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 bg-white border-slate-200 hover:bg-slate-50 shadow-sm transition-all active:scale-95">
                    <MoreVertical className="w-4 h-4 text-slate-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <Dialog>
                    <DialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer gap-2 py-2.5">
                        <Edit2 className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">Edit account name</span>
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Account Name</DialogTitle>
                      </DialogHeader>
                      <div className="py-4 space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="acc-name">Name</Label>
                          <Input 
                            id="acc-name" 
                            defaultValue={user?.displayName || accountName} 
                            onChange={(e) => setAccountName(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleUpdateAccount}>Save Changes</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-2 py-2.5 text-destructive focus:text-destructive">
                    <LogOut className="w-4 h-4" />
                    <span className="font-medium">Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 shadow-md shadow-primary/10 transition-all hover:-translate-y-0.5 active:translate-y-0">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Organization
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Register New Institution</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="org-name">Institution Name</Label>
                      <Input id="org-name" placeholder="e.g. Tribhuvan University" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org-domain">Primary Domain</Label>
                      <Input id="org-domain" placeholder="e.g. tu.edu.np" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddOrg}>Complete Registration</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-xl border-t-0">
          <div className="h-1.5 w-full bg-primary/10" />
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
                  <TableHead className="text-[10px] font-bold uppercase py-5 pl-8 text-slate-400 tracking-widest">Institution Name</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Managed Domain</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-5 text-slate-400 tracking-widest">Active Services</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase py-5 text-right pr-8 text-slate-400 tracking-widest">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.code} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                    <TableCell className="pl-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-slate-100 rounded-lg border border-slate-200 group-hover:bg-primary/5 group-hover:border-primary/20 transition-all">
                          <Building2 className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-800 text-sm">{org.name}</span>
                          <span className="font-mono text-[10px] text-slate-400 uppercase tracking-tighter">{org.code}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-slate-300" />
                        <span className="text-xs font-semibold text-slate-600">
                          {org.domain}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {org.services.map((s) => (
                          <Badge key={s} variant="secondary" className="bg-slate-100 text-[9px] font-bold text-slate-500 border-slate-200 py-0.5 h-5 px-2 tracking-tight group-hover:border-slate-300 transition-colors uppercase">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <Button size="sm" variant="outline" className="h-8 font-bold text-xs gap-2 border-slate-200 hover:bg-primary hover:text-white transition-all shadow-sm">
                        Manage
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="py-4 px-8 border-t border-slate-50 bg-slate-50/30">
              <p className="text-[10px] text-slate-400 font-medium">
                Total Organizations: {orgs.length} • Showing all records
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
