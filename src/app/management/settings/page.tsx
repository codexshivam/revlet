"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Mail, Loader2, Info, User, LogOut, CheckCircle2 } from "lucide-react"
import { useUser, useAuth, useFirestore } from "@/firebase"
import { 
  updatePassword, 
  updateProfile, 
  signOut, 
  EmailAuthProvider, 
  reauthenticateWithCredential, 
  verifyBeforeUpdateEmail 
} from "firebase/auth"
import { doc, setDoc } from "firebase/firestore"
import { toast } from "@/hooks/use-toast"

export default function SettingsPage() {
  const router = useRouter()
  const { user } = useUser()
  const auth = useAuth()
  const db = useFirestore()
  
  // Profile name state
  const [name, setName] = useState(user?.displayName || "")
  const [isUpdatingName, setIsUpdatingName] = useState(false)

  useEffect(() => {
    if (user?.displayName && !name) {
      setName(user.displayName)
    }
  }, [user?.displayName, name])

  // Email state
  const [newEmail, setNewEmail] = useState("")
  const [emailConfirmPass, setEmailConfirmPass] = useState("")
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)

  // Password state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  // Logout state
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleUpdateName = async () => {
    if (!user || !name.trim()) {
      toast({ 
        variant: "destructive", 
        title: "Name Required", 
        description: "Please enter your name before saving." 
      })
      return
    }

    setIsUpdatingName(true)
    try {
      await updateProfile(user, { displayName: name.trim() })

      if (db) {
        const userRef = doc(db, "users", user.uid)
        await setDoc(userRef, { 
          displayName: name.trim(),
          email: user.email || ""
        }, { merge: true })
      }

      toast({ 
        title: "Profile Updated", 
        description: "Your display name has been updated successfully." 
      })
    } catch (error: any) {
      toast({ 
        variant: "destructive", 
        title: "Update Failed", 
        description: "We could not update your name. Please try again." 
      })
    } finally {
      setIsUpdatingName(false)
    }
  }

  const handleUpdateEmail = async () => {
    if (!user || !newEmail || !emailConfirmPass) {
      toast({ 
        variant: "destructive", 
        title: "Missing Information", 
        description: "Please provide both your new email and your current password." 
      })
      return
    }

    setIsUpdatingEmail(true)
    try {
      const credential = EmailAuthProvider.credential(user.email!, emailConfirmPass)
      await reauthenticateWithCredential(user, credential)
      
      await verifyBeforeUpdateEmail(user, newEmail)
      
      toast({ 
        title: "Verification Sent", 
        description: "A verification link has been sent to your new email address. Changes will apply after confirmation." 
      })
      setNewEmail("")
      setEmailConfirmPass("")
    } catch (error: any) {
      let errorMessage = "We could not update your email. Please try again."
      
      if (error.code === "auth/wrong-password") {
        errorMessage = "Your current password is invalid."
      } else if (error.code === "auth/email-already-in-use") {
        errorMessage = "This email address is already associated with another account."
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "The new email address provided is not valid."
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many attempts. Please try again later."
      }

      toast({ 
        variant: "destructive", 
        title: "Update Failed", 
        description: errorMessage 
      })
    } finally {
      setIsUpdatingEmail(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!user || !currentPassword || !newPassword || !confirmPassword) {
      toast({ 
        variant: "destructive", 
        title: "Incomplete Form", 
        description: "Please fill in all the password fields to proceed." 
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({ 
        variant: "destructive", 
        title: "Passwords Mismatch", 
        description: "The new password and confirmation do not match." 
      })
      return
    }

    setIsUpdatingPassword(true)
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPassword)
      await reauthenticateWithCredential(user, credential)
      
      await updatePassword(user, newPassword)
      toast({ 
        title: "Password Updated", 
        description: "Your password has been successfully updated." 
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      let errorMessage = "We could not update your password. Please try again."

      if (error.code === "auth/wrong-password") {
        errorMessage = "Your current password is invalid."
      } else if (error.code === "auth/weak-password") {
        errorMessage = "The new password is too weak. Please use at least 6 characters."
      }

      toast({ 
        variant: "destructive", 
        title: "Update Failed", 
        description: errorMessage
      })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await signOut(auth)
      toast({
        title: "Signed Out",
        description: "You have been signed out of your account."
      })
      router.push("/login")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign Out Failed",
        description: "Could not sign out. Please try again."
      })
      setIsLoggingOut(false)
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
        
        {/* Header with Title and Sign Out Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-1 sm:px-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-headline font-bold text-slate-900 tracking-tight">Settings</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5">
              Manage your personal profile, credentials, and active administrative session.
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleLogout} 
            disabled={isLoggingOut}
            className="border-slate-200 text-slate-700 hover:text-red-600 hover:bg-red-50 hover:border-red-200 font-semibold text-xs h-10 gap-2 rounded-lg transition-colors shrink-0"
          >
            {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            <span>Sign Out</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          
          {/* 1. Name & Profile Update */}
          <Card className="bg-white border-slate-200 shadow-sm h-fit rounded-xl overflow-hidden">
            <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2 text-primary mb-1">
                <User className="w-5 h-5" />
                <CardTitle className="text-lg font-headline font-bold">Profile Information</CardTitle>
              </div>
              <CardDescription className="text-xs">Update your primary full name as shown across your organizations.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Full Name</Label>
                <Input 
                  id="display-name" 
                  placeholder="Your Full Name" 
                  className="border-slate-200 h-10 rounded px-3 text-xs" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="readonly-email" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Account Email</Label>
                <Input 
                  id="readonly-email" 
                  value={user?.email || "Loading..."} 
                  disabled 
                  className="bg-slate-50 border-slate-200 text-xs h-10 rounded px-3 text-slate-500" 
                />
              </div>

              <Button 
                className="w-full font-bold h-10 rounded-lg shadow-sm bg-primary hover:bg-primary/95 text-white text-xs mt-2" 
                onClick={handleUpdateName}
                disabled={isUpdatingName}
              >
                {isUpdatingName ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Save Profile Name"}
              </Button>
            </CardContent>
          </Card>

          {/* 2. Administrative Email Change */}
          <Card className="bg-white border-slate-200 shadow-sm h-fit rounded-xl overflow-hidden">
            <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Mail className="w-5 h-5" />
                <CardTitle className="text-lg font-headline font-bold">Administrative Email</CardTitle>
              </div>
              <CardDescription className="text-xs">Update your primary contact email. Verification is required for changes to apply.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-email" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Proposed New Email</Label>
                <Input 
                  id="new-email" 
                  placeholder="admin@organization.com" 
                  className="border-slate-200 h-10 rounded px-3 text-xs" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verify-pass" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Current Password</Label>
                <Input 
                  id="verify-pass" 
                  type="password" 
                  placeholder="Enter current password..." 
                  className="border-slate-200 h-10 rounded px-3 text-xs" 
                  value={emailConfirmPass}
                  onChange={(e) => setEmailConfirmPass(e.target.value)}
                />
              </div>
              
              <div className="flex items-start gap-2.5 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-primary leading-normal font-medium">
                  We will send a verification link to the new email. The change will finalize automatically once verified.
                </p>
              </div>

              <Button 
                className="w-full font-bold h-10 rounded-lg shadow-sm bg-primary hover:bg-primary/95 text-white text-xs" 
                onClick={handleUpdateEmail}
                disabled={isUpdatingEmail}
              >
                {isUpdatingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Verify & Update Email"}
              </Button>
            </CardContent>
          </Card>

          {/* 3. Password Management */}
          <Card className="bg-white border-slate-200 shadow-sm h-fit rounded-xl overflow-hidden md:col-span-2">
            <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Lock className="w-5 h-5" />
                <CardTitle className="text-lg font-headline font-bold">Access Credentials</CardTitle>
              </div>
              <CardDescription className="text-xs">Ensure your account is protected by a strong, secure password.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="old-pass" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Existing Password</Label>
                  <Input 
                    id="old-pass" 
                    type="password" 
                    placeholder="••••••••" 
                    className="border-slate-200 h-10 rounded px-3 text-xs" 
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-pass" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">New Password</Label>
                  <Input 
                    id="new-pass" 
                    type="password" 
                    placeholder="Minimum 6 characters..." 
                    className="border-slate-200 h-10 rounded px-3 text-xs" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-pass" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Confirm New Password</Label>
                  <Input 
                    id="confirm-pass" 
                    type="password" 
                    placeholder="Confirm new password..." 
                    className="border-slate-200 h-10 rounded px-3 text-xs" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button 
                  className="font-bold h-10 px-6 rounded-lg bg-slate-900 hover:bg-black text-white shadow-sm text-xs" 
                  onClick={handleUpdatePassword}
                  disabled={isUpdatingPassword}
                >
                  {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Commit Password Change"}
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardShell>
  )
}
