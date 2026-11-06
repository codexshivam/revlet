
"use client"

import { useState } from "react"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Mail, Loader2, Info } from "lucide-react"
import { useUser, useAuth } from "@/firebase"
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail } from "firebase/auth"
import { toast } from "@/hooks/use-toast"

export default function SettingsPage() {
  const { user } = useUser()
  const auth = useAuth()
  
  // Email state
  const [newEmail, setNewEmail] = useState("")
  const [emailConfirmPass, setEmailConfirmPass] = useState("")
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)

  // Password state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

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
      // Re-authenticate user before sensitive operation
      const credential = EmailAuthProvider.credential(user.email!, emailConfirmPass)
      await reauthenticateWithCredential(user, credential)
      
      // Send verification to the new email
      await verifyBeforeUpdateEmail(user, newEmail)
      
      toast({ 
        title: "Verification Sent", 
        description: "A verification link has been sent to your new email address. The change will take effect only after you verify the email." 
      })
      setNewEmail("")
      setEmailConfirmPass("")
    } catch (error: any) {
      let errorMessage = "We couldn't update your email. Please try again."
      
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
      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email!, currentPassword)
      await reauthenticateWithCredential(user, credential)
      
      await updatePassword(user, newPassword)
      toast({ 
        title: "Password Updated", 
        description: "Your security credentials have been successfully updated." 
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      let errorMessage = "We couldn't update your password. Please try again."

      if (error.code === "auth/wrong-password") {
        errorMessage = "Your current password is invalid."
      } else if (error.code === "auth/weak-password") {
        errorMessage = "The new password is too weak. Please use at least 6 characters."
      }

      toast({ 
        variant: "destructive", 
        title: "Security Update Failed", 
        description: errorMessage
      })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col gap-1 px-1 sm:px-0">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Management</span>
          <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">Account Security</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <Card className="bg-white border-slate-200 shadow-sm h-fit rounded-xl overflow-hidden">
            <CardHeader className="p-4 sm:p-6 md:p-8 pb-3 sm:pb-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Mail className="w-5 h-5" />
                <CardTitle className="text-lg font-headline font-bold">Administrative Email</CardTitle>
              </div>
              <CardDescription className="text-xs">Update your primary contact. Verification is required for changes to apply.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 md:p-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-email" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Currently Active</Label>
                <Input id="current-email" value={user?.email || "Loading..."} disabled className="bg-slate-50 border-slate-200 text-xs h-10 rounded px-3" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-email" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Proposed New Email</Label>
                <Input 
                  id="new-email" 
                  placeholder="new.admin@organization.com" 
                  className="border-slate-200 h-10 rounded px-3" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verify-pass" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Confirm Identity (Current Password)</Label>
                <Input 
                  id="verify-pass" 
                  type="password" 
                  placeholder="Enter current password..." 
                  className="border-slate-200 h-10 rounded px-3" 
                  value={emailConfirmPass}
                  onChange={(e) => setEmailConfirmPass(e.target.value)}
                />
              </div>
              
              <div className="flex items-start gap-2.5 p-3 bg-blue-50/50 rounded-lg border border-blue-100 mb-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-primary leading-normal font-medium">
                  We will send a verification link to the new email. The change will finalize automatically once verified.
                </p>
              </div>

              <Button 
                className="w-full font-bold h-11 rounded-lg shadow-lg shadow-primary/10 bg-primary hover:bg-primary/95 text-white" 
                onClick={handleUpdateEmail}
                disabled={isUpdatingEmail}
              >
                {isUpdatingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Verify & Update Email"}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-sm h-fit rounded-xl overflow-hidden">
            <CardHeader className="p-4 sm:p-6 md:p-8 pb-3 sm:pb-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Lock className="w-5 h-5" />
                <CardTitle className="text-lg font-headline font-bold">Access Credentials</CardTitle>
              </div>
              <CardDescription className="text-xs">Ensure your account is protected by a rotating strong password.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 md:p-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="old-pass" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Existing Password</Label>
                <Input 
                  id="old-pass" 
                  type="password" 
                  placeholder="••••••••" 
                  className="border-slate-200 h-10 rounded px-3" 
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-pass" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">New Secure Password</Label>
                <Input 
                  id="new-pass" 
                  type="password" 
                  placeholder="Minimum 6 characters..." 
                  className="border-slate-200 h-10 rounded px-3" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass" className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block">Re-type New Password</Label>
                <Input 
                  id="confirm-pass" 
                  type="password" 
                  placeholder="Confirm new password..." 
                  className="border-slate-200 h-10 rounded px-3" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button 
                className="w-full font-bold h-11 rounded-lg bg-slate-900 hover:bg-black text-white shadow-lg shadow-slate-900/10" 
                onClick={handleUpdatePassword}
                disabled={isUpdatingPassword}
              >
                {isUpdatingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Commit Password Change"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
