"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, LogOut, Info } from "lucide-react"
import { useUser, useAuth, useFirestore } from "@/firebase"
import {
  updatePassword,
  updateProfile,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
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

  // Sign out state
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleUpdateName = async () => {
    if (!user || !name.trim()) {
      toast({
        variant: "destructive",
        title: "Name required",
        description: "Please enter your name before saving.",
      })
      return
    }

    setIsUpdatingName(true)
    try {
      await updateProfile(user, { displayName: name.trim() })

      if (db) {
        const userRef = doc(db, "users", user.uid)
        await setDoc(
          userRef,
          {
            displayName: name.trim(),
            email: user.email || "",
          },
          { merge: true }
        )
      }

      toast({
        title: "Profile updated",
        description: "Your display name has been saved.",
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Could not update your display name.",
      })
    } finally {
      setIsUpdatingName(false)
    }
  }

  const handleUpdateEmail = async () => {
    if (!user || !newEmail.trim() || !emailConfirmPass) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please provide both your new email and current password.",
      })
      return
    }

    setIsUpdatingEmail(true)
    try {
      const credential = EmailAuthProvider.credential(user.email!, emailConfirmPass)
      await reauthenticateWithCredential(user, credential)

      await verifyBeforeUpdateEmail(user, newEmail.trim())

      toast({
        title: "Verification sent",
        description:
          "A verification link has been sent to your new email address. Changes will apply after confirmation.",
      })
      setNewEmail("")
      setEmailConfirmPass("")
    } catch (error: any) {
      let errorMessage = "Could not update email. Please try again."

      if (error.code === "auth/wrong-password") {
        errorMessage = "Your current password is invalid."
      } else if (error.code === "auth/email-already-in-use") {
        errorMessage = "This email address is already in use by another account."
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "The email address provided is not valid."
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many attempts. Please try again later."
      }

      toast({
        variant: "destructive",
        title: "Update failed",
        description: errorMessage,
      })
    } finally {
      setIsUpdatingEmail(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!user || !currentPassword || !newPassword || !confirmPassword) {
      toast({
        variant: "destructive",
        title: "Incomplete form",
        description: "Please fill in all password fields.",
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "New password must be at least 6 characters long.",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "New password and confirmation must match.",
      })
      return
    }

    setIsUpdatingPassword(true)
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPassword)
      await reauthenticateWithCredential(user, credential)

      await updatePassword(user, newPassword)

      toast({
        title: "Password updated",
        description: "Your password has been changed.",
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      let errorMessage = "Could not update password. Please try again."

      if (error.code === "auth/wrong-password") {
        errorMessage = "Your current password is invalid."
      } else if (error.code === "auth/weak-password") {
        errorMessage = "The new password is too weak. Please use at least 6 characters."
      }

      toast({
        variant: "destructive",
        title: "Update failed",
        description: errorMessage,
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
        title: "Signed out",
        description: "You have been signed out of your account.",
      })
      router.push("/login")
    } catch {
      toast({
        variant: "destructive",
        title: "Sign out failed",
        description: "Could not sign out. Please try again.",
      })
      setIsLoggingOut(false)
    }
  }

  return (
    <DashboardShell>
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-headline font-semibold text-slate-900 tracking-tight">
              Settings
            </h1>
            <p className="text-xs text-slate-500">
              Profile details, administrative credentials, and session management
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => setIsSignOutOpen(true)}
            disabled={isLoggingOut}
            className="border-slate-200 text-slate-700 hover:text-destructive hover:bg-rose-50 hover:border-rose-200 text-xs font-medium h-9 px-4 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
            <span>Sign Out</span>
          </Button>
        </div>

        {/* 1. Profile Details */}
        <Card className="bg-white border border-slate-200/80 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-sm font-headline font-semibold text-slate-900">
              Profile Details
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Display name shown across your organizations and administrative activities
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 space-y-4">
            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="display-name" className="text-xs font-medium text-slate-700">
                Display Name
              </Label>
              <Input
                id="display-name"
                placeholder="Alex Morgan"
                className="h-9 text-xs border-slate-200 rounded-lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="readonly-email" className="text-xs font-medium text-slate-700">
                Current Account Email
              </Label>
              <Input
                id="readonly-email"
                value={user?.email || ""}
                disabled
                className="h-9 text-xs font-mono bg-slate-50 border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
              />
            </div>

            <div className="pt-2 flex justify-start">
              <Button
                onClick={handleUpdateName}
                disabled={isUpdatingName || !name.trim()}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium text-xs h-9 px-4 rounded-lg transition-colors"
              >
                {isUpdatingName && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" strokeWidth={1.5} />
                )}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 2. Administrative Email Change */}
        <Card className="bg-white border border-slate-200/80 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-sm font-headline font-semibold text-slate-900">
              Administrative Email
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Update your primary login address. A verification link will be sent to confirm ownership
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-email" className="text-xs font-medium text-slate-700">
                  New Email Address
                </Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="admin@example.com"
                  className="h-9 text-xs border-slate-200 rounded-lg"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verify-pass" className="text-xs font-medium text-slate-700">
                  Current Password
                </Label>
                <Input
                  id="verify-pass"
                  type="password"
                  placeholder="••••••••"
                  className="h-9 text-xs border-slate-200 rounded-lg"
                  value={emailConfirmPass}
                  onChange={(e) => setEmailConfirmPass(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs text-slate-600">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" strokeWidth={1.5} />
              <p className="leading-relaxed">
                A confirmation link will be delivered to the new address. Your account email remains unchanged until verified.
              </p>
            </div>

            <div className="pt-1 flex justify-start">
              <Button
                onClick={handleUpdateEmail}
                disabled={isUpdatingEmail || !newEmail.trim() || !emailConfirmPass}
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium text-xs h-9 px-4 rounded-lg transition-colors"
              >
                {isUpdatingEmail && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" strokeWidth={1.5} />
                )}
                Send Verification
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3. Password and Security */}
        <Card className="bg-white border border-slate-200/80 shadow-none rounded-xl overflow-hidden">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-sm font-headline font-semibold text-slate-900">
              Password and Security
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Protect your administrative account with a strong password of at least 6 characters
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 space-y-4">
            <div className="space-y-1.5 max-w-sm">
              <Label htmlFor="old-pass" className="text-xs font-medium text-slate-700">
                Current Password
              </Label>
              <Input
                id="old-pass"
                type="password"
                placeholder="••••••••"
                className="h-9 text-xs border-slate-200 rounded-lg"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-pass" className="text-xs font-medium text-slate-700">
                  New Password
                </Label>
                <Input
                  id="new-pass"
                  type="password"
                  placeholder="Minimum 6 characters"
                  className="h-9 text-xs border-slate-200 rounded-lg"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass" className="text-xs font-medium text-slate-700">
                  Confirm New Password
                </Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  placeholder="Re-enter password"
                  className="h-9 text-xs border-slate-200 rounded-lg"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-1 flex justify-start">
              <Button
                onClick={handleUpdatePassword}
                disabled={
                  isUpdatingPassword ||
                  !currentPassword ||
                  newPassword.length < 6 ||
                  newPassword !== confirmPassword
                }
                className="bg-primary hover:bg-primary/95 !text-white text-white font-medium text-xs h-9 px-4 rounded-lg transition-colors"
              >
                {isUpdatingPassword && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" strokeWidth={1.5} />
                )}
                Update Password
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 4. Active Session */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-headline font-semibold text-slate-900">
              Active Session
            </h3>
            <p className="text-xs text-slate-500">
              Currently signed in as{" "}
              <span className="font-mono text-slate-700">{user?.email || "Administrator"}</span>
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsSignOutOpen(true)}
            disabled={isLoggingOut}
            className="border-slate-200 text-destructive hover:bg-rose-50 hover:text-destructive text-xs font-medium h-9 px-4 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
            <span>Sign Out</span>
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog for Sign Out */}
      <AlertDialog open={isSignOutOpen} onOpenChange={setIsSignOutOpen}>
        <AlertDialogContent className="bg-white border border-slate-200 rounded-xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
              Sign Out
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to sign out? You will need to sign back in to access your organizations and services.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel
              disabled={isLoggingOut}
              className="h-9 text-xs font-medium rounded-lg"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="h-9 text-xs font-medium bg-destructive hover:bg-destructive/90 text-white rounded-lg"
            >
              {isLoggingOut && (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" strokeWidth={1.5} />
              )}
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}
