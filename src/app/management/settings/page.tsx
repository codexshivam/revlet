"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Mail, Loader2, Info, User, LogOut, ShieldCheck } from "lucide-react"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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

  // Sign out popup & loading state
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
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
    } catch {
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
    if (!user || !newEmail.trim() || !emailConfirmPass) {
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
      
      await verifyBeforeUpdateEmail(user, newEmail.trim())
      
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

    if (newPassword.length < 6) {
      toast({ 
        variant: "destructive", 
        title: "Password Too Short", 
        description: "The new password must be at least 6 characters long." 
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
    } catch {
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
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-300">
        
        {/* Header with Title and Sign Out Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
          <div>
            <h1 className="text-2xl sm:text-3xl font-headline font-bold text-slate-900 tracking-tight">Settings</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
              Manage your profile details, administrative credentials, and session.
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setIsSignOutOpen(true)}
            disabled={isLoggingOut}
            className="border-slate-200 text-slate-700 hover:text-red-600 hover:bg-red-50 hover:border-red-200 font-semibold text-xs h-9 px-4 gap-2 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </Button>
        </div>

        {/* 1. Profile Details */}
        <Card className="bg-white border border-slate-200/80 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900">
              <User className="w-4 h-4 text-slate-600" />
              <CardTitle className="text-base font-bold">Profile Details</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Update your full name as shown across your organizations and administrative activities.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display-name" className="text-xs font-semibold text-slate-700">Display Name</Label>
              <Input 
                id="display-name" 
                placeholder="e.g. Alex Morgan" 
                className="h-10 text-sm border-slate-200 rounded-lg max-w-lg" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-[11px] text-slate-400">This will be your visible identity in teams and activity feeds.</p>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="readonly-email" className="text-xs font-semibold text-slate-700">Account Email</Label>
              <Input 
                id="readonly-email" 
                value={user?.email || "Loading..."} 
                disabled 
                className="h-10 text-sm bg-slate-50 border-slate-200 rounded-lg max-w-lg text-slate-500 cursor-not-allowed" 
              />
              <p className="text-[11px] text-slate-400">To change your login email address, use the Administrative Email section below.</p>
            </div>
          </CardContent>
          <CardFooter className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end items-center">
            <Button 
              onClick={handleUpdateName}
              disabled={isUpdatingName}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 px-4 rounded-lg shadow-sm"
            >
              {isUpdatingName && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
              Save Profile Name
            </Button>
          </CardFooter>
        </Card>

        {/* 2. Administrative Email Change */}
        <Card className="bg-white border border-slate-200/80 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900">
              <Mail className="w-4 h-4 text-slate-600" />
              <CardTitle className="text-base font-bold">Administrative Email</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Update your primary email address. A verification link will be sent to the new email address to confirm ownership.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-email" className="text-xs font-semibold text-slate-700">New Email Address</Label>
                <Input 
                  id="new-email" 
                  type="email"
                  placeholder="admin@organization.com" 
                  className="h-10 text-sm border-slate-200 rounded-lg" 
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verify-pass" className="text-xs font-semibold text-slate-700">Current Password</Label>
                <Input 
                  id="verify-pass" 
                  type="password" 
                  placeholder="Enter current password..." 
                  className="h-10 text-sm border-slate-200 rounded-lg" 
                  value={emailConfirmPass}
                  onChange={(e) => setEmailConfirmPass(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex items-start gap-2.5 p-3 bg-blue-50/60 rounded-lg border border-blue-100 text-blue-900">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 leading-relaxed font-normal">
                We will send a confirmation email with a verification link to your new address. Your account email will remain unchanged until you click the confirmation link.
              </p>
            </div>
          </CardContent>
          <CardFooter className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end items-center">
            <Button 
              onClick={handleUpdateEmail}
              disabled={isUpdatingEmail}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 px-4 rounded-lg shadow-sm"
            >
              {isUpdatingEmail && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
              Verify & Update Email
            </Button>
          </CardFooter>
        </Card>

        {/* 3. Access Credentials & Security */}
        <Card className="bg-white border border-slate-200/80 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900">
              <Lock className="w-4 h-4 text-slate-600" />
              <CardTitle className="text-base font-bold">Password & Security</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Ensure your account is protected by a strong, unique password of at least 6 characters.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="old-pass" className="text-xs font-semibold text-slate-700">Existing Password</Label>
              <Input 
                id="old-pass" 
                type="password" 
                placeholder="••••••••" 
                className="h-10 text-sm border-slate-200 rounded-lg" 
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="new-pass" className="text-xs font-semibold text-slate-700">New Password</Label>
                <Input 
                  id="new-pass" 
                  type="password" 
                  placeholder="Minimum 6 characters..." 
                  className="h-10 text-sm border-slate-200 rounded-lg" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass" className="text-xs font-semibold text-slate-700">Confirm New Password</Label>
                <Input 
                  id="confirm-pass" 
                  type="password" 
                  placeholder="Re-enter new password..." 
                  className="h-10 text-sm border-slate-200 rounded-lg" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="px-5 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end items-center">
            <Button 
              onClick={handleUpdatePassword}
              disabled={isUpdatingPassword}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 px-4 rounded-lg shadow-sm"
            >
              {isUpdatingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />}
              Commit Password Change
            </Button>
          </CardFooter>
        </Card>

        {/* 4. Active Session */}
        <Card className="bg-white border border-slate-200/80 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              <CardTitle className="text-base font-bold">Session & Sign Out</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Manage your active administrative session on this browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-800">
                  Currently signed in as <span className="font-semibold text-slate-900">{user?.email || "Administrator"}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Signing out will end your session on this device. You will need to sign back in to access the platform.
                </p>
              </div>
              <Button 
                variant="outline"
                onClick={() => setIsSignOutOpen(true)}
                disabled={isLoggingOut}
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 font-semibold text-xs h-9 px-4 rounded-lg shrink-0 gap-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Confirmation Dialog for Sign Out */}
      <AlertDialog open={isSignOutOpen} onOpenChange={setIsSignOutOpen}>
        <AlertDialogContent className="bg-white border-slate-200 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-900">
              Sign out of Revlet?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-500 leading-relaxed">
              Are you sure you want to sign out? You will need to log back in with your credentials to access your organizations and services.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 pt-2">
            <AlertDialogCancel disabled={isLoggingOut} className="border-slate-200 text-slate-700 hover:bg-slate-50">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="bg-red-600 hover:bg-red-700 text-white font-medium gap-2"
            >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span>Sign Out</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}
