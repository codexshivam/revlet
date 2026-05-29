"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useState, useEffect } from "react"
import { useUser, useAuth, useFirestore } from "@/firebase"
import { updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth"
import { collection, query, where, getDocs } from "firebase/firestore"
import { toast } from "@/hooks/use-toast"
import { Loader2, ShieldCheck, KeyRound, Building2 } from "lucide-react"

export default function ProfilePage() {
  const { user, loading: authLoading } = useUser()
  const auth = useAuth()
  const db = useFirestore()

  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [orgCount, setOrgCount] = useState(0)
  
  // Profile update states
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "")
      setEmail(user.email || "")

      // Fetch user's registered organization count
      const fetchOrgs = async () => {
        try {
          const orgsRef = collection(db, "organizations")
          const q = query(orgsRef, where("ownerId", "==", user.uid))
          const snap = await getDocs(q)
          setOrgCount(snap.size)
        } catch (e) {
          console.error("Failed to fetch organizations for profile count:", e)
        }
      }
      fetchOrgs()
    }
  }, [user, db])

  const handleUpdateProfile = async () => {
    if (!user) return
    if (!displayName.trim()) {
      toast({
        variant: "destructive",
        title: "Validation Failed",
        description: "Display name cannot be empty."
      })
      return
    }

    setIsUpdatingProfile(true)
    try {
      await updateProfile(user, { displayName: displayName.trim() })
      toast({
        title: "Profile Updated",
        description: "Your full name has been updated successfully."
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Failed to update profile settings."
      })
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!user || !user.email) return
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        variant: "destructive",
        title: "Missing Fields",
        description: "Please fill in all the password update fields."
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Weak Password",
        description: "New password must be at least 6 characters long."
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Mismatch",
        description: "Confirm password does not match the new password."
      })
      return
    }

    setIsUpdatingPassword(true)
    try {
      // Re-authenticate user before updating sensitive details
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      
      // Update password
      await updatePassword(user, newPassword)
      toast({
        title: "Password Updated",
        description: "Your account password has been updated securely."
      })

      // Reset password fields
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: error.message?.includes("wrong-password") 
          ? "The current password you entered is incorrect." 
          : error.message || "Failed to update security credentials."
      })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  if (authLoading) {
    return (
      <DashboardShell>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loading Account Settings...</p>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Settings</span>
          <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">Security & Settings</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Side Info Panel */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-white border-slate-200 shadow-sm rounded-lg overflow-hidden">
              <div className="h-1 w-full bg-primary/20" />
              <CardHeader>
                <CardTitle className="text-lg font-headline font-bold text-slate-900">Your Credentials</CardTitle>
                <CardDescription className="text-xs">Summary of your account status.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Assigned Organizations</p>
                    <p className="text-sm font-bold text-slate-900">{orgCount} Institutions</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-900 rounded-lg text-white shadow-lg shadow-slate-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-bold text-sm">Security Standards</h4>
                  </div>
                  <p className="text-[10px] opacity-80 leading-relaxed">
                    Account access logs are verified continuously. Any sensitive action requires fresh authentication protocols.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Core Configuration Panels */}
          <div className="lg:col-span-2 space-y-8">
            {/* Personal Information */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-lg overflow-hidden">
              <CardHeader className="border-b border-slate-100 px-8 py-5">
                <CardTitle className="text-base font-headline font-semibold text-slate-900">Personal Information</CardTitle>
                <CardDescription className="text-xs">Manage your primary administrative profile details.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-name" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Full Name</Label>
                    <Input 
                      id="prof-name" 
                      value={displayName} 
                      onChange={(e) => setDisplayName(e.target.value)} 
                      placeholder="Rajesh Karki"
                      className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prof-email" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Email Address (Login ID)</Label>
                    <Input 
                      id="prof-email" 
                      value={email} 
                      disabled 
                      className="h-10 border-[#c6c6cd] bg-slate-50 text-slate-400 rounded text-xs font-normal px-3 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button 
                    onClick={handleUpdateProfile} 
                    disabled={isUpdatingProfile} 
                    className="bg-primary hover:bg-primary/95 text-white font-bold h-10 px-8 rounded-lg shadow-sm"
                  >
                    {isUpdatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Profile Details"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Password Management */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-lg overflow-hidden">
              <CardHeader className="border-b border-slate-100 px-8 py-5">
                <div className="flex items-center gap-2 text-primary">
                  <KeyRound className="w-4 h-4" />
                  <CardTitle className="text-base font-headline font-semibold text-slate-900">Update Credentials</CardTitle>
                </div>
                <CardDescription className="text-xs">Change your password protocols securely.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4 max-w-md">
                  <div className="space-y-1.5">
                    <Label htmlFor="curr-pwd" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Current Password</Label>
                    <Input 
                      id="curr-pwd" 
                      type="password" 
                      value={currentPassword} 
                      onChange={(e) => setCurrentPassword(e.target.value)} 
                      placeholder="••••••••"
                      className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pwd" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">New Password</Label>
                      <Input 
                        id="new-pwd" 
                        type="password" 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        placeholder="Min 6 characters"
                        className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="conf-pwd" className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Confirm New Password</Label>
                      <Input 
                        id="conf-pwd" 
                        type="password" 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        placeholder="••••••••"
                        className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <Button 
                    onClick={handleUpdatePassword} 
                    disabled={isUpdatingPassword} 
                    className="bg-primary hover:bg-primary/95 text-white font-bold h-10 px-8 rounded-lg shadow-sm"
                  >
                    {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Credentials"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
