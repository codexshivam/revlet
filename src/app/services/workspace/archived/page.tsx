
"use client"

import * as React from "react"
import { useState, useEffect, useMemo, useCallback } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Archive, 
  Trash2, 
  Loader2, 
  RotateCcw,
  Search,
  AlertCircle
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot } from "firebase/firestore"
import { cn } from "@/lib/utils"
import { 
  listWorkspaceUsers, 
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

export default function ArchivePage() {
  const { toast } = useToast()
  const { user } = useUser()
  const db = useFirestore()
  
  const [orgs, setOrgs] = useState<any[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [users, setUsers] = useState<WorkspaceUser[]>([])
  const [isUsersLoading, setIsUsersLoading] = useState(false)
  
  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

  const fetchUsers = useCallback(async () => {
    if (!selectedOrg?.contactEmail) return
    setIsUsersLoading(true)
    const res = await listWorkspaceUsers('/', selectedOrg.contactEmail)
    if (res.success) setUsers(res.data.filter((u: any) => u.archived || u.status === 'Suspended'))
    setIsUsersLoading(false)
  }, [selectedOrg])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, "organizations"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setOrgs(fetched)
      if (fetched.length > 0 && !selectedOrgId) setSelectedOrgId(fetched[0].id)
    })
    return unsub
  }, [user, db, selectedOrgId])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleRestore = async (userId: string) => {
    setIsUsersLoading(true)
    const res = await archiveUser(userId, false, selectedOrg?.contactEmail)
    if (res.success) {
      toast({ title: "Account Reactivated" })
      fetchUsers()
    }
    setIsUsersLoading(false)
  }

  const handleDelete = async (userId: string) => {
    if (!confirm("Permanent Deletion: This wipes all user data. Proceed?")) return
    setIsUsersLoading(true)
    const res = await deleteWorkspaceUser(userId, selectedOrg?.contactEmail)
    if (res.success) {
      toast({ title: "Identity Purged" })
      fetchUsers()
    }
    setIsUsersLoading(false)
  }

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Retention</span>
          <h1 className="text-3xl font-headline font-bold text-slate-900">Archive Registry</h1>
        </div>

        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-8 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Non-Active Identities</CardTitle>
            <Badge variant="outline" className="bg-white text-[9px] font-bold h-5 px-2">{users.length} Records</Badge>
          </CardHeader>
          <CardContent className="p-0 min-h-[400px]">
            {isUsersLoading ? (
              <div className="py-40 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-slate-200" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scanning Archive...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="py-32 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 bg-slate-50 rounded-full"><AlertCircle className="w-8 h-8 text-slate-200" /></div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900">No matching records</p>
                  <p className="text-xs text-slate-400 font-medium">All cloud identities are currently in active state.</p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/30">
                  <TableRow>
                    <TableHead className="text-[10px] font-bold uppercase pl-8">Identity</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">Status</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-right pr-8">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="pl-8 py-5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-bold text-slate-400 line-through leading-none">{u.name}</span>
                          <span className="text-[10px] font-mono text-slate-400">{u.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-red-50 text-red-600 border-red-100 text-[8px] font-bold uppercase tracking-tighter">SUSPENDED</Badge>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleRestore(u.id)} className="h-8 text-[10px] font-bold uppercase gap-1.5"><RotateCcw className="w-3 h-3" />Restore</Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)} className="h-8 w-8 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></Button>
                        </div>
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
