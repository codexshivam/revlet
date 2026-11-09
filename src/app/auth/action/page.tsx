"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck,
  MailCheck
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthFrame } from "@/components/layout/auth-frame"
import { useAuth } from "@/firebase"
import { 
  verifyPasswordResetCode, 
  confirmPasswordReset, 
  applyActionCode, 
  checkActionCode 
} from "firebase/auth"

function AuthActionHandler() {
  const router = useRouter()
  const auth = useAuth()
  const searchParams = useSearchParams()

  const mode = searchParams.get("mode")
  const oobCode = searchParams.get("oobCode")
  const continueUrl = searchParams.get("continueUrl") || "/login"

  // State management
  const [status, setStatus] = React.useState<"loading" | "ready" | "success" | "error">("loading")
  const [targetEmail, setTargetEmail] = React.useState<string>("")
  const [errorMessage, setErrorMessage] = React.useState<string>("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Verify the incoming action code on mount
  React.useEffect(() => {
    if (!oobCode || !mode) {
      setStatus("error")
      setErrorMessage("No verification code or action mode was provided in the link.")
      return
    }

    let isMounted = true

    async function handleAction() {
      try {
        if (mode === "resetPassword") {
          // Verify code and get the associated email
          const email = await verifyPasswordResetCode(auth, oobCode!)
          if (isMounted) {
            setTargetEmail(email)
            setStatus("ready")
          }
        } else if (mode === "verifyEmail") {
          // Apply action code to verify email address
          await applyActionCode(auth, oobCode!)
          if (isMounted) {
            setStatus("success")
          }
        } else if (mode === "recoverEmail") {
          // Restore previous email address
          await checkActionCode(auth, oobCode!)
          await applyActionCode(auth, oobCode!)
          if (isMounted) {
            setStatus("success")
          }
        } else {
          if (isMounted) {
            setStatus("error")
            setErrorMessage(`Unsupported action mode: ${mode}`)
          }
        }
      } catch (err: any) {
        if (!isMounted) return
        setStatus("error")
        if (err?.code === "auth/expired-action-code") {
          setErrorMessage("This link has expired. For security, links are only valid for a limited time.")
        } else if (err?.code === "auth/invalid-action-code") {
          setErrorMessage("This link is invalid or has already been used. Please request a new link.")
        } else if (err?.code === "auth/user-disabled") {
          setErrorMessage("This account has been disabled. Please contact an administrator.")
        } else {
          setErrorMessage(err?.message || "Failed to process the authentication request.")
        }
      }
    }

    handleAction()

    return () => {
      isMounted = false
    }
  }, [auth, mode, oobCode])

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oobCode) return

    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.")
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please ensure both fields are identical.")
      return
    }

    setIsSubmitting(true)
    setErrorMessage("")

    try {
      await confirmPasswordReset(auth, oobCode, newPassword)
      setStatus("success")
    } catch (err: any) {
      if (err?.code === "auth/weak-password") {
        setErrorMessage("Password is too weak. Please use a mix of uppercase letters, numbers, and symbols.")
      } else if (err?.code === "auth/expired-action-code") {
        setStatus("error")
        setErrorMessage("Your reset session expired. Please request a new password reset link.")
      } else {
        setErrorMessage(err?.message || "Failed to set new password.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // 1. Loading State
  if (status === "loading") {
    return (
      <div className="w-full max-w-md p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center space-y-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto text-blue-600" />
        <div className="space-y-1">
          <h2 className="font-headline font-bold text-base text-slate-900">Verifying Security Token</h2>
          <p className="text-xs text-slate-500">Connecting to Revlet Identity Services...</p>
        </div>
      </div>
    )
  }

  // 2. Error State
  if (status === "error") {
    return (
      <div className="w-full max-w-md p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-100">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-headline font-bold text-base text-slate-900">Invalid or Expired Link</h2>
            <p className="text-xs text-slate-500">Security Verification</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed">
          {errorMessage || "The action link you clicked is invalid or has already expired. For security, links can only be used once."}
        </div>

        <div className="space-y-2">
          <Link href="/login" className="block">
            <Button className="w-full h-10 text-xs font-bold rounded-lg bg-primary hover:bg-primary/95 text-white">
              Back to Sign In
            </Button>
          </Link>
          <Link href="/support" className="block text-center text-xs text-slate-500 hover:text-slate-800 transition-colors py-1">
            Need help? Contact support
          </Link>
        </div>
      </div>
    )
  }

  // 3. Success State (for all modes)
  if (status === "success") {
    const isReset = mode === "resetPassword"
    const isVerification = mode === "verifyEmail"

    return (
      <div className="w-full max-w-md p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
          {isVerification ? <MailCheck className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
        </div>

        <div className="space-y-1.5">
          <h2 className="font-headline font-bold text-lg text-slate-900">
            {isReset ? "Password Updated" : isVerification ? "Email Verified" : "Action Completed"}
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {isReset 
              ? "Your account password has been successfully changed. You can now sign in with your new credentials."
              : isVerification
                ? "Your email address has been successfully verified for your Revlet workspace."
                : "Your account credentials have been updated."}
          </p>
        </div>

        <Link href={continueUrl || "/login"} className="block">
          <Button className="w-full h-10 text-xs font-bold rounded-lg bg-primary hover:bg-primary/95 text-white gap-2">
            <span>Continue to Sign In</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    )
  }

  // 4. Ready State: Reset Password Form
  if (mode === "resetPassword") {
    return (
      <div className="w-full max-w-md p-8 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider mb-1">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Account Security</span>
          </div>
          <h1 className="font-headline font-bold text-xl text-slate-900">Reset Your Password</h1>
          {targetEmail && (
            <p className="text-xs text-slate-500">
              Create a new password for <span className="font-semibold text-slate-700">{targetEmail}</span>
            </p>
          )}
        </div>

        <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-xs font-bold text-slate-700">
              New Password
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter at least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10 text-xs pr-10 border-slate-200 font-medium"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-xs font-bold text-slate-700">
              Confirm New Password
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-10 text-xs pr-10 border-slate-200 font-medium"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">Password Requirements:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li className={newPassword.length >= 8 ? "text-emerald-600 font-medium" : ""}>
                Minimum of 8 characters
              </li>
              <li className={newPassword && newPassword === confirmPassword ? "text-emerald-600 font-medium" : ""}>
                Both password fields must match
              </li>
            </ul>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !newPassword || !confirmPassword}
            className="w-full h-10 text-xs font-bold rounded-lg bg-primary hover:bg-primary/95 text-white shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Updating Password...
              </>
            ) : (
              "Save New Password"
            )}
          </Button>
        </form>
      </div>
    )
  }

  return null
}

export default function AuthActionPage() {
  return (
    <AuthFrame>
      <React.Suspense
        fallback={
          <div className="w-full max-w-md p-8 bg-white border border-slate-200 rounded-2xl shadow-sm text-center space-y-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto text-blue-600" />
            <div className="space-y-1">
              <h2 className="font-headline font-bold text-base text-slate-900">Loading</h2>
              <p className="text-xs text-slate-500">Preparing verification view...</p>
            </div>
          </div>
        }
      >
        <AuthActionHandler />
      </React.Suspense>
    </AuthFrame>
  )
}
