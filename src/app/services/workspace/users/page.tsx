
"use client"

import * as React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Users, 
  UserPlus, 
  Search, 
  Key, 
  Archive, 
  Trash2, 
  Loader2, 
  MoreVertical,
  Plus
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from "firebase/firestore"
import { cn } from "@/lib/utils"
import { 
  listWorkspaceUsers, 
  createWorkspaceUser, 
  resetUserPassword, 
  archiveUser, 
  deleteWorkspaceUser 
} from "@/app/actions/google-workspace"

interface WorkspaceUser {
  id: string
  name: string
  email: string
  status: string
  storage: string
  archived: boolean
  orgUnitPath: string
}

export default function DirectoryPage() {
  const { toast } = useToast()
  const { user } = useUser()
  const db = useFirestore()
  
  const [orgs, setOrgs] = useState<any[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [users, setUsers] = useState<WorkspaceUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUsersLoading, setIsUsersLoading] = useState(false)
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [isOUDialogOpen, setIsOUDialogOpen] = useState(false)
  
  const [newUser, setNewUser] = useState({ firstName: "", lastName: "", emailPrefix: "", password: "", orgUnit: "" })
  const [resetData, setResetData] = useState({ userId: "", userName: "", newPassword: "", forceChange: true })
  const [newOUType, setNewOUType] = useState("")

  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

  const fetchUsers = useCallback(async () => {
    if (!selectedOrg?.managedWorkspace || !selectedOrg?.contactEmail) return
    setIsUsersLoading(true)
    const res = await listWorkspaceUsers('/', selectedOrg.contactEmail)
    if (res.success) setUsers(res.data)
    setIsUsersLoading(false)
  }, [selectedOrg])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, "organizations"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setOrgs(fetched)
      if (fetched.length > 0 && !selectedOrgId) setSelectedOrgId(fetched[0].id)
      setIsLoading(false)
    })
    return unsub
  }, [user, db, selectedOrgId])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const defaultOUs = selectedOrg?.gEducation ? ["Students", "Teachers", "Main People", "Staffs"] : ["Users", "Main People"]
  const allOUs = [...defaultOUs, ...(selectedOrg?.customUserTypes || [])]

  const handleCreateUser = async () => {
    if (!selectedOrg) return
    setIsUsersLoading(true)
    const res = await createWorkspaceUser({
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: `${newUser.emailPrefix}@${selectedOrg.domain}`,
      password: newUser.password,
      orgUnitPath: `/${newUser.orgUnit}`
    }, selectedOrg.contactEmail)

    if (res.success) {
      toast({ title: "User Created" })
      setIsCreateDialogOpen(false)
      fetchUsers()
    } else {
      toast({ variant: "destructive", title: "Creation Failed", description: res.error })
    }
    setIsUsersLoading(false)
  }

  const handleResetPassword = async () => {
    setIsUsersLoading(true)
    const res = await resetUserPassword(resetData.userId, resetData.newPassword, resetData.forceChange, selectedOrg?.contactEmail)
    if (res.success) {
      toast({ title: "Password Reset Complete" })
      setIsResetDialogOpen(false)
    }
    setIsUsersLoading(false)
  }

  const handleArchive = async (userId: string) => {
    setIsUsersLoading(true)
    const res = await archiveUser(userId, true, selectedOrg?.contactEmail)
    if (res.success) {
      toast({ title: "User Suspended" })
      fetchUsers()
    }
    setIsUsersLoading(false)
  }

  if (isLoading) return <DashboardShell><div className="flex justify-center py-40"><Loader2 className="animate-spin text-primary" /></div></DashboardShell>

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Directory</span>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-headline font-bold text-slate-900">Cloud Identities</h1>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setIsOUDialogOpen(true)} className="h-9 font-bold text-xs"><Plus className="w-4 h-4 mr-2" />Add Unit</Button>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="h-9 font-bold text-xs bg-slate-900 text-white"><UserPlus className="w-4 h-4 mr-2" />Provision User</Button>
            </div>
          </div>
        </div>

        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        <Card className="bg-white border-slate-200 overflow-hidden">
          <Tabs defaultValue={allOUs[0].toLowerCase()} className="w-full">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-6 py-4">
              <TabsList className="bg-slate-200/50 h-8 p-1">
                {allOUs.map((ou) => (
                  <TabsTrigger key={ou} value={ou.toLowerCase()} className="text-[9px] font-bold uppercase tracking-widest px-4 h-6 data-[state=active]:bg-white">
                    {ou}
                  </TabsTrigger>
                ))}
              </TabsList>
            </CardHeader>
            <CardContent className="p-0">
              {isUsersLoading ? (
                <div className="py-40 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Synchronizing Directory...</p>
                </div>
              ) : (
                allOUs.map((ou) => (
                  <TabsContent key={ou} value={ou.toLowerCase()} className="m-0">
                    <Table>
                      <TableHeader className="bg-slate-50/30">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold uppercase pl-8">Name</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase">Cloud Email</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase text-right pr-8">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.filter(u => u.orgUnitPath === `/${ou}`).length === 0 ? (
                          <TableRow><TableCell colSpan={3} className="py-24 text-center text-slate-400 text-xs italic">No active accounts in this unit.</TableCell></TableRow>
                        ) : (
                          users.filter(u => u.orgUnitPath === `/${ou}`).map((u) => (
                            <TableRow key={u.id} className="hover:bg-slate-50 transition-colors">
                              <TableCell className="pl-8 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">{u.name.substring(0, 1)}</div>
                                  <span className="text-sm font-bold text-slate-800">{u.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-slate-500">{u.email}</TableCell>
                              <TableCell className="text-right pr-8">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => {setResetData({userId: u.id, userName: u.name, newPassword: "", forceChange: true}); setIsResetDialogOpen(true)}} className="h-8 w-8 text-slate-400 hover:text-primary"><Key className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleArchive(u.id)} className="h-8 w-8 text-slate-400 hover:text-amber-500"><Archive className="w-3.5 h-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                ))
              )}
            </CardContent>
          </Tabs>
        </Card>

        {/* Dialogs for Create, Reset, OU Omitted for Brevity - Using Hub Implementation Logic */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-md p-0 overflow-hidden border-none shadow-2xl bg-white">
            <DialogHeader className="bg-slate-900 text-white p-6">
              <DialogTitle className="font-headline font-bold text-xl">Provision Identity</DialogTitle>
            </DialogHeader>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">First Name</Label>
                  <Input value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} placeholder="Sagar" className="h-10 text-xs font-bold" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500">Last Name</Label>
                  <Input value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} placeholder="Poudel" className="h-10 text-xs font-bold" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Email Prefix</Label>
                <div className="flex items-center gap-2">
                  <Input value={newUser.emailPrefix} onChange={e => setNewUser({...newUser, emailPrefix: e.target.value})} placeholder="username" className="h-10 text-xs font-bold flex-1" />
                  <span className="text-xs font-bold text-slate-400">@{selectedOrg?.domain}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                 <Label className="text-[10px] font-bold uppercase text-slate-500">Assign to OU</Label>
                 <select className="w-full h-10 px-3 text-xs font-bold border border-slate-200 rounded-md outline-none" value={newUser.orgUnit} onChange={e => setNewUser({...newUser, orgUnit: e.target.value})}>
                   <option value="">Select Unit</option>
                   {allOUs.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                 </select>
              </div>
            </div>
            <DialogFooter className="bg-slate-50 p-6 border-t">
              <Button onClick={handleCreateUser} disabled={isUsersLoading} className="px-8 bg-slate-900 text-white font-bold h-11">Commit Identity</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  )
}
