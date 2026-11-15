"use client"

import React, { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth"
import { useAuth } from "@/firebase"
import { AuthFrame } from "@/components/layout/auth-frame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MailCheck,
  ShieldAlert,
} from "lucide-react"

function AuthActionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const auth = useAuth()

  const mode = searchParams.get("mode") || ""
  const oobCode = searchParams.get("oobCode") || ""
  const continueUrl = searchParams.get("continueUrl") || "/login"

  const [status, setStatus] = useState<"verifying" | "ready" | "submitting" | "success" | "error">("verifying")
  const [accountEmail, setAccountEmail] = useState<string>("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [successTitle, setSuccessTitle] = useState<string>("Action Completed")
  const [successDescription, setSuccessDescription] = useState<string>("")

  useEffect(() => {
    if (!oobCode || !mode) {
      setStatus("error")
      setErrorMessage("This security link is missing required verification parameters.")
      return
    }

    let cancelled = false

    const processCode = async () => {
      try {
        if (mode === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, oobCode)
          if (cancelled) return
          setAccountEmail(email)
          setStatus("ready")
          return
        }

        if (mode === "verifyEmail" || mode === "verifyAndChangeEmail") {
          const info = await checkActionCode(auth, oobCode)
          await applyActionCode(auth, oobCode)
          if (cancelled) return
          const targetEmail = info?.data?.email || ""
          setAccountEmail(targetEmail)
          setSuccessTitle(
            mode === "verifyAndChangeEmail"
              ? "Email Address Updated"
              : "Email Address Verified"
          )
          setSuccessDescription(
            targetEmail
              ? `Your email address (${targetEmail}) has been verified and activated on your Revlet account.`
              : "Your email address has been verified and activated on your Revlet account."
          )
          setStatus("success")
          return
        }

        if (mode === "recoverEmail") {
          const info = await checkActionCode(auth, oobCode)
          await applyActionCode(auth, oobCode)
          if (cancelled) return
          const restoredEmail = info?.data?.email || ""
          setAccountEmail(restoredEmail)
          setSuccessTitle("Account Email Restored")
          setSuccessDescription(
            restoredEmail
              ? `Your primary login email has been restored to ${restoredEmail}.`
              : "Your primary login email has been restored."
          )
          setStatus("success")
          return
        }

        setStatus("error")
        setErrorMessage("Unsupported authentication action mode.")
      } catch (err: any) {
        if (cancelled) return
        setStatus("error")
        if (err?.code === "auth/expired-action-code") {
          setErrorMessage("This security link has expired. Please request a new link.")
        } else if (err?.code === "auth/invalid-action-code") {
          setErrorMessage("This security link is invalid or has already been used.")
        } else {
          setErrorMessage("Unable to verify this security link. Please request a new one.")
        }
      }
    }

    void processCode()
    return () => {
      cancelled = true
    }
  }, [auth, mode, oobCode])

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Please choose a password with at least 6 characters.",
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

    setStatus("submitting")
    try {
      await confirmPasswordReset(auth, oobCode, newPassword)
      setSuccessTitle("Password Updated")
      setSuccessDescription(
        accountEmail
          ? `Your password for ${accountEmail} has been updated. You can now sign in with your new password.`
          : "Your password has been updated. You can now sign in with your new password."
      )
      setStatus("success")
      toast({
        title: "Password reset complete",
        description: "You can now sign in with your new password.",
      })
    } catch (err: any) {
      setStatus("ready")
      toast({
        variant: "destructive",
        title: "Password reset failed",
        description:
          err?.code === "auth/weak-password"
            ? "Please choose a stronger password (at least 6 characters)."
            : "This reset link has expired or was already used.",
      })
    }
  }

  const handleContinue = () => {
    try {
      const parsed = new URL(continueUrl, window.location.origin)
      if (parsed.origin === window.location.origin) {
        router.push(parsed.pathname + parsed.search)
        return
      }
    } catch {
      // Fallback to /login
    }
    router.push("/login")
  }

  return (
    <AuthFrame>
      <div className="w-full max-w-[400px] bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm animate-in fade-in duration-300">
        {status === "verifying" && (
          <div className="py-10 text-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h1 className="text-base font-semibold text-slate-900">
                Verifying Security Link
              </h1>
              <p className="text-xs text-slate-500">
                Please wait while we validate your request...
              </p>
            </div>
          </div>
        )}

        {(status === "ready" || status === "submitting") && mode === "resetPassword" && (
          <>
            <div className="space-y-1.5">
              <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 mb-2">
                <KeyRound className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                Set New Password
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                {accountEmail ? (
                  <>
                    Choose a new password for{" "}
                    <span className="font-mono font-medium text-slate-800">{accountEmail}</span>.
                  </>
                ) : (
                  "Choose a strong new password for your Revlet account."
                )}
              </p>
            </div>

            <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs font-medium text-slate-700">
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-10 text-xs rounded-lg border-slate-200 pr-10"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-medium text-slate-700">
                  Confirm New Password
                </Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-10 text-xs rounded-lg border-slate-200"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={status === "submitting"}
                className="w-full h-10 bg-primary hover:bg-primary/95 text-white font-medium text-xs rounded-lg transition-colors"
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Updating Password...
                  </>
                ) : (
                  "Save New Password"
                )}
              </Button>
            </form>
          </>
        )}

        {status === "success" && (
          <div className="space-y-5 text-center py-2">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 mx-auto">
              {mode === "resetPassword" ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <MailCheck className="w-5 h-5" />
              )}
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold text-slate-900">{successTitle}</h1>
              <p className="text-xs text-slate-500 leading-relaxed">{successDescription}</p>
            </div>
            <Button
              type="button"
              onClick={handleContinue}
              className="w-full h-10 bg-primary hover:bg-primary/95 text-white font-medium text-xs rounded-lg"
            >
              Continue
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-5 text-center py-2">
            <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 mx-auto">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold text-slate-900">
                Verification Link Invalid
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">{errorMessage}</p>
            </div>
            <div className="pt-1">
              <Link href="/login" className="block w-full">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 border-slate-200 text-xs font-medium rounded-lg"
                >
                  Return to Sign In
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthFrame>
  )
}

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <span className="text-sm font-semibold text-slate-900">Revlet</span>
        </div>
      }
    >
      <AuthActionContent />
    </Suspense>
  )
}
