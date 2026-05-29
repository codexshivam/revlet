"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { OrgSelector } from "@/components/org/org-selector"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HardDrive, ShieldCheck, Loader2, Zap } from "lucide-react"
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot } from "firebase/firestore"
import { useToast } from "@/hooks/use-toast"
import { getCustomerStorageUsage } from "@/app/actions/google-workspace"

export default function StoragePoliciesPage() {
  const { toast } = useToast()
  const { user } = useUser()
  const db = useFirestore()
  
  const [orgs, setOrgs] = useState<any[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [storageData, setStorageData] = useState({ used: 0, total: 100 })

  const selectedOrg = useMemo(() => orgs.find(o => o.id === selectedOrgId), [orgs, selectedOrgId])

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
    if (selectedOrg?.contactEmail) {
      getCustomerStorageUsage(selectedOrg.contactEmail).then(res => {
        if (res.success) setStorageData(res.data)
      })
    }
  }, [selectedOrg])

  const defaultOUs = selectedOrg?.gEducation ? ["Students", "Teachers", "Staffs"] : ["Users", "Main People"]
  const allOUs = [...defaultOUs, ...(selectedOrg?.customUserTypes || [])]

  const handleApplyPolicy = () => {
    toast({ title: "Policy Propagated" })
  }

  if (isLoading) return <DashboardShell><div className="flex justify-center py-40"><Loader2 className="animate-spin text-primary" /></div></DashboardShell>

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Storage</span>
          <h1 className="text-3xl font-headline font-bold text-slate-900">Infrastructure Allocation</h1>
        </div>

        <OrgSelector selectedId={selectedOrgId} onSelect={setSelectedOrgId} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {allOUs.map((ou) => (
              <Card key={ou} className="bg-white border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
                <CardHeader className="py-4 px-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <HardDrive className="w-4 h-4 text-slate-400" />
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{ou} Registry</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Individual Quota (GB)</Label>
                    <Input defaultValue={ou === "Students" ? "5" : "100"} className="h-10 font-bold border-slate-200" />
                  </div>
                  <Button onClick={handleApplyPolicy} className="w-full bg-slate-900 text-white font-bold h-10">Commit Quota Change</Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="lg:col-span-1 space-y-6">
             <Card className="bg-primary/5 border-primary/10 p-6 space-y-4">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-primary"><HardDrive className="w-5 h-5" /></div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Institutional Pool</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    The current global limit is <span className="font-bold">{storageData.total} TB</span>. Individual quotas ensure fair distribution across units.
                  </p>
                </div>
             </Card>
             <Card className="bg-amber-50 border-amber-100 p-6 space-y-4">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-amber-500"><Zap className="w-5 h-5" /></div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-amber-900 uppercase tracking-tight">Rapid Sync</h4>
                  <p className="text-xs text-amber-700/80 leading-relaxed font-medium">Changes propagate to the Google edge in under 24 hours.</p>
                </div>
             </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
