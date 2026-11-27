"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/layout/dashboard-shell"
import { MfaEnrollmentCard } from "@/components/security/mfa-enrollment-card"

const StepUpMfaDialog = dynamic(
  () => import("@/components/security/step-up-mfa-dialog").then((m) => m.StepUpMfaDialog),
  { ssr: false }
)
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, LogOut, Info, Download, Trash2 } from "lucide-react"
import { exportPersonalAccountData, deletePersonalAccount } from "@/app/actions/account-privacy"
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

  // Data & Privacy (export & erasure) state
  const [isExportingData, setIsExportingData] = useState(false)
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("")
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [privacyStepUpAction, setPrivacyStepUpAction] = useState<"export" | "delete" | null>(null)

  const handleExportAccountData = async (stepUpToken?: string) => {
    if (!user) return
    setIsExportingData(true)
    try {
      const idToken = await user.getIdToken()
      const res = await exportPersonalAccountData(idToken, stepUpToken)
      if (!res.success) {
        if (res.error?.includes("MFA_STEP_UP_REQUIRED")) {
          setPrivacyStepUpAction("export")
          return
        }
        throw new Error(res.error || "Could not export personal data.")
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `revlet-account-export-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({
        title: "Account data exported",
        description: "Your personal account export has been downloaded.",
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: err?.message || "Could not export account data.",
      })
    } finally {
      setIsExportingData(false)
    }
  }

  const handleDeletePersonalAccount = async (stepUpToken?: string) => {
    if (!user) return
    setIsDeletingAccount(true)
    try {
      const idToken = await user.getIdToken()
      const res = await deletePersonalAccount(idToken, deleteConfirmEmail, stepUpToken)
      if (!res.success) {
        if (res.error?.includes("MFA_STEP_UP_REQUIRED")) {
          setPrivacyStepUpAction("delete")
          return
        }
        throw new Error(res.error || "Could not delete account.")
      }
      toast({
        title: "Account deleted",
        description: "Your personal account and profile data have been permanently erased.",
      })
      await signOut(auth).catch(() => {})
      router.replace("/login")
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Account deletion failed",
        description: err?.message || "Could not delete personal account.",
      })
    } finally {
      setIsDeletingAccount(false)
    }
  }

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

  const [emailStepUpOpen, setEmailStepUpOpen] = useState(false)
  const [pendingEmailChange, setPendingEmailChange] = useState<string | null>(null)

  const handleUpdateEmail = async (stepUpToken?: string) => {
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

      // Force token refresh so server receives fresh auth_time
      const idToken = await user.getIdToken(true)
      const targetEmail = newEmail.trim()
      const customRes = await fetch("/api/auth/action-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          type: "change_email",
          newEmail: targetEmail,
          ...(stepUpToken ? { stepUpToken } : {}),
        }),
      })
      const customData = await customRes.json().catch(() => ({}))
      if (!customRes.ok || !customData?.ok) {
        if (typeof customData?.error === "string" && customData.error.includes("MFA_STEP_UP_REQUIRED")) {
          setEmailStepUpOpen(true)
          return
        }
        if (customData?.code === "auth/email-already-exists") {
          throw { code: "auth/email-already-in-use" }
        }
        throw new Error(customData?.error || "Could not dispatch email change confirmation.")
      }

      setPendingEmailChange(targetEmail)
      toast({
        title: "Verification sent",
        description: `A confirmation link from accounts@revlet.me was sent to ${targetEmail}, and a security notice was sent to your current address.`,
      })
      setNewEmail("")
      setEmailConfirmPass("")
    } catch (error: any) {
      let errorMessage = error?.message || "Could not update email. Please try again."

      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
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

    if (newPassword.length < 12) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "New password must be at least 12 characters long.",
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

      const idToken = await user.getIdToken(true)
      try {
        await fetch("/api/auth/action-email", {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ type: "password_updated" }),
        })
      } catch {
        // Non-blocking notification
      }

      toast({
        title: "Password updated",
        description: "Your password has been changed.",
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (error: any) {
      let errorMessage = "Could not update password. Please try again."

      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        errorMessage = "Your current password is invalid."
      } else if (error.code === "auth/weak-password") {
        errorMessage = "The new password is too weak. Please use at least 12 characters."
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
      // Clear server-side MFA session cookie + workspace cookies alongside Firebase sign-out
      await fetch("/api/auth/mfa", { method: "DELETE" }).catch(() => {})
      if (typeof document !== "undefined") {
        document.cookie = "revlet_session_hint=; path=/; max-age=0; samesite=lax"
        document.cookie = "revlet_last_org=; path=/; max-age=0; samesite=lax"
      }
      await signOut(auth)
      toast({
        title: "Signed out",
        description: "You have been signed out of your account.",
      })
      router.replace("/login")
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
        <div className="border-b border-slate-200/80 pb-5">
          <h1 className="text-2xl sm:text-3xl font-headline font-semibold text-slate-900 tracking-tight">
            Account Settings
          </h1>
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

            {pendingEmailChange && (
              <div className="flex items-center justify-between gap-2 p-3 bg-amber-50/80 rounded-lg border border-amber-200 text-xs text-amber-950">
                <span>
                  Pending verification for <span className="font-mono font-medium">{pendingEmailChange}</span>.
                </span>
                <button
                  type="button"
                  onClick={() => setPendingEmailChange(null)}
                  className="text-amber-800 hover:underline font-medium shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="pt-1 flex justify-start">
              <Button
                onClick={() => void handleUpdateEmail()}
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
              Protect your administrative account with a strong password of at least 12 characters
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
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="h-9 text-base sm:text-xs border-slate-200 rounded-lg"
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
                  autoComplete="new-password"
                  placeholder="Minimum 12 characters"
                  className="h-9 text-base sm:text-xs border-slate-200 rounded-lg"
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
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  className="h-9 text-base sm:text-xs border-slate-200 rounded-lg"
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
                  newPassword.length < 12 ||
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
        <MfaEnrollmentCard />

        {/* 5. Data & Privacy (Personal Export & Erasure) */}
        <Card className="rounded-xl border border-slate-200/80 shadow-none bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-headline font-semibold text-slate-900">
              Data &amp; Privacy
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Download a machine-readable copy of your personal account data or permanently erase your account. Organization-owned records require ownership transfer or organization deletion first.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => void handleExportAccountData()}
              disabled={isExportingData}
              className="h-9 text-xs font-medium rounded-lg border-slate-200"
            >
              {isExportingData ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <Download className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              )}
              Export Personal Data (JSON)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmEmail("")
                setIsDeleteAccountOpen(true)
              }}
              className="h-9 text-xs font-medium rounded-lg border-rose-200 text-destructive hover:bg-rose-50 hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              Delete Personal Account
            </Button>
          </CardContent>
        </Card>

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

      <StepUpMfaDialog
        open={emailStepUpOpen}
        onOpenChange={setEmailStepUpOpen}
        actionLabel="change your account email address"
        onVerified={(token) => {
          void handleUpdateEmail(token)
        }}
      />

      <AlertDialog open={isDeleteAccountOpen} onOpenChange={setIsDeleteAccountOpen}>
        <AlertDialogContent className="bg-white border border-slate-200 rounded-xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline font-semibold text-base text-slate-900">
              Delete Personal Account
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p>
                  This permanently erases your personal Revlet profile, MFA factors, and memberships in shared workspaces. If you still own any organization, delete or transfer it first.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-700">
                    Type <span className="font-mono">{user?.email}</span> to confirm:
                  </Label>
                  <Input
                    value={deleteConfirmEmail}
                    onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                    placeholder={user?.email || "you@example.com"}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel disabled={isDeletingAccount} className="h-9 text-xs font-medium rounded-lg">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={
                isDeletingAccount ||
                !user?.email ||
                deleteConfirmEmail.trim().toLowerCase() !== user.email.toLowerCase()
              }
              onClick={() => void handleDeletePersonalAccount()}
              className="h-9 text-xs font-medium rounded-lg"
            >
              {isDeletingAccount && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Permanently Delete Account
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StepUpMfaDialog
        open={Boolean(privacyStepUpAction)}
        onOpenChange={(open) => { if (!open) setPrivacyStepUpAction(null) }}
        actionLabel={
          privacyStepUpAction === "delete"
            ? "permanently delete your personal account"
            : "export your personal account data"
        }
        onVerified={(token) => {
          const act = privacyStepUpAction
          setPrivacyStepUpAction(null)
          if (act === "export") {
            void handleExportAccountData(token)
          } else if (act === "delete") {
            void handleDeletePersonalAccount(token)
          }
        }}
      />
    </DashboardShell>
  )
}
