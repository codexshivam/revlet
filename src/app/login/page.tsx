"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, ShieldCheck, Smartphone, KeyRound, Mail, ChevronDown, ArrowLeft } from "lucide-react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"
import { useAuth, useUser } from "@/firebase"
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth"
import { AuthFrame } from "@/components/layout/auth-frame"

function b64uToBuf(s: string): ArrayBuffer {
  const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"))
  const a = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i)
  return a.buffer
}

function bufToB64u(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let str = ""
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export default function LoginPage() {
  const router = useRouter()
  const auth = useAuth()
  const { user, loading: authLoading } = useUser()
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [isResetLoading, setIsResetLoading] = useState(false)

  // Google-inspired 2-Step Verification / Enforce MFA state
  const [mfaStep, setMfaStep] = useState<"none" | "verify" | "enroll">("none")
  const [mfaMethod, setMfaMethod] = useState<"totp" | "passkey" | "secondary_email">("totp")
  const [showMethodPicker, setShowMethodPicker] = useState(false)
  const [mfaStatus, setMfaStatus] = useState<{
    totpEnabled: boolean
    passkeyCount: number
    secondaryEmail: string
    secondaryEmailVerified: boolean
  } | null>(null)
  const [mfaCode, setMfaCode] = useState("")
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [mfaEmailOtpSent, setMfaEmailOtpSent] = useState(false)
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null)
  const [enrollQr, setEnrollQr] = useState<string | null>(null)

  const evaluateMfaGate = async (firebaseUser: NonNullable<typeof user>) => {
    try {
      const token = await firebaseUser.getIdToken()
      const res = await fetch("/api/auth/mfa", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      const data = await res.json().catch(() => ({}))
      if (data?.ok) {
        if ((data.hasEnrolledMfa || data.enforceMfa) && !data.mfaSessionVerified) {
          const totpOn = Boolean(data.mfa?.totpEnabled)
          const pkCount = Array.isArray(data.mfa?.passkeys) ? data.mfa.passkeys.length : 0
          const secVerified = Boolean(data.mfa?.secondaryEmailVerified)
          setMfaStatus({
            totpEnabled: totpOn,
            passkeyCount: pkCount,
            secondaryEmail: data.mfa?.secondaryEmail || "",
            secondaryEmailVerified: secVerified,
          })
          if (data.hasEnrolledMfa) {
            setMfaMethod(totpOn ? "totp" : pkCount > 0 ? "passkey" : "secondary_email")
            setMfaStep("verify")
          } else {
            setMfaStep("enroll")
            // Pre-generate Authenticator QR code for required enrollment
            const setupRes = await fetch("/api/auth/mfa", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ action: "totp_setup" }),
            })
            const setupData = await setupRes.json().catch(() => ({}))
            if (setupData?.ok && setupData.secret) {
              setEnrollSecret(setupData.secret)
              if (setupData.otpauthUri) {
                QRCode.toDataURL(setupData.otpauthUri, { width: 176, margin: 1 })
                  .then(setEnrollQr)
                  .catch(() => {})
              }
            }
          }
          return
        }
      }
      router.push("/account/home")
    } catch {
      router.push("/account/home")
    }
  }

  useEffect(() => {
    if (!authLoading && user && mfaStep === "none") {
      evaluateMfaGate(user)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  if (user && mfaStep === "none") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="text-xs font-medium text-slate-400">
          Verifying session security...
        </div>
      </div>
    )
  }

  const getFriendlyErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case "auth/invalid-email":
        return "The email address is not valid."
      case "auth/user-disabled":
        return "This account has been disabled by an administrator."
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password. Please try again."
      case "auth/too-many-requests":
        return "Too many failed attempts. Please try again later or reset your password."
      case "auth/network-request-failed":
        return "Network connection issue. Please check your internet connection."
      default:
        return "An unexpected error occurred during authentication."
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast({
        variant: "destructive",
        title: "Missing credentials",
        description: "Please enter both email and password.",
      })
      return
    }

    setIsLoading(true)
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password)

      // Reactive Sync: Keep user profile index up to date
      try {
        const { getFirestore } = await import("firebase/firestore")
        const db = getFirestore(auth.app)
        const { syncUserOrganizations } = await import("@/firebase")
        await syncUserOrganizations(
          db,
          userCredential.user.uid,
          userCredential.user.email || "",
          userCredential.user.displayName || ""
        )
      } catch (e) {
        console.error("Error executing user sync at login:", e)
      }

      await evaluateMfaGate(userCredential.user)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication failed",
        description: getFriendlyErrorMessage(error.code),
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Email required",
        description: "Please enter your work email to receive reset instructions.",
      })
      return
    }

    setIsResetLoading(true)
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim())
      toast({
        title: "Reset link sent",
        description: "Check your email for password reset instructions.",
      })
      setIsResetOpen(false)
      setResetEmail("")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description:
          error.code === "auth/user-not-found"
            ? "No account found with this email address."
            : getFriendlyErrorMessage(error.code),
      })
    } finally {
      setIsResetLoading(false)
    }
  }

  const handleVerifyMfa = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!user) return
    setMfaError(null)
    setMfaBusy(true)
    try {
      const token = await user.getIdToken()
      if (mfaStep === "enroll") {
        const res = await fetch("/api/auth/mfa", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "totp_enable", code: mfaCode }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || "Invalid 6-digit code")
        toast({ title: "2-Step Verification Enabled" })
        router.push("/account/home")
        return
      }

      if (mfaMethod === "passkey") {
        const optRes = await fetch("/api/auth/mfa", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "passkey_assert_options" }),
        })
        const opt = await optRes.json()
        if (!opt.ok) throw new Error(opt.error || "Passkey options failed")
        const cred = (await navigator.credentials.get({
          publicKey: {
            challenge: b64uToBuf(opt.challenge),
            allowCredentials: opt.allowCredentials.map((c: { id: string }) => ({
              id: b64uToBuf(c.id),
              type: "public-key",
            })),
            userVerification: "preferred",
            timeout: 60000,
          },
        })) as PublicKeyCredential | null
        if (!cred) throw new Error("Passkey verification was cancelled")
        const resp = cred.response as AuthenticatorAssertionResponse
        const verRes = await fetch("/api/auth/mfa", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            action: "step_up_verify",
            method: "passkey",
            credentialId: bufToB64u(cred.rawId),
            clientDataJSON: bufToB64u(resp.clientDataJSON),
          }),
        })
        const ver = await verRes.json()
        if (!verRes.ok || !ver.ok) throw new Error(ver.error || "Passkey verification failed")
        router.push("/account/home")
        return
      }

      const verRes = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "step_up_verify",
          method: mfaMethod,
          code: mfaCode,
        }),
      })
      const ver = await verRes.json()
      if (!verRes.ok || !ver.ok) throw new Error(ver.error || "Invalid verification code")
      router.push("/account/home")
    } catch (err: any) {
      setMfaError(err?.message || "Verification failed")
    } finally {
      setMfaBusy(false)
    }
  }

  const handleSendLoginEmailOtp = async () => {
    if (!user) return
    setMfaError(null)
    setMfaBusy(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "secondary_email_send" }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) throw new Error(d.error || "Failed to send code")
      setMfaEmailOtpSent(true)
      toast({ title: "Verification code sent", description: `Check ${mfaStatus?.secondaryEmail}` })
    } catch (err: any) {
      setMfaError(err?.message || "Could not send code")
    } finally {
      setMfaBusy(false)
    }
  }

  const handleSwitchAccount = async () => {
    await fetch("/api/auth/mfa", { method: "DELETE" }).catch(() => {})
    await signOut(auth).catch(() => {})
    setMfaStep("none")
    setMfaCode("")
    setMfaError(null)
  }

  if (user && mfaStep !== "none") {
    return (
      <AuthFrame>
        <div className="w-full max-w-[520px] bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm animate-in fade-in duration-300">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="truncate max-w-[240px]">{user.email}</span>
              </div>
              <button
                type="button"
                onClick={handleSwitchAccount}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Switch account
              </button>
            </div>

            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                {mfaStep === "enroll" ? "Protect your account" : "2-Step Verification"}
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                {mfaStep === "enroll"
                  ? "Your organization requires 2-Step Verification. Scan the QR code below with Google Authenticator, 1Password, or Authy to continue."
                  : "To help keep your account safe, verify it’s really you using your second factor."}
              </p>
            </div>
          </div>

          {mfaError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {mfaError}
            </div>
          )}

          {mfaStep === "enroll" ? (
            <form onSubmit={handleVerifyMfa} className="space-y-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row items-center gap-4">
                {enrollQr && (
                  <div className="p-2 rounded-lg bg-white border border-slate-200 shrink-0">
                    <img src={enrollQr} alt="Authenticator QR Code" className="w-36 h-36" />
                  </div>
                )}
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-800">Manual Setup Key</div>
                  <div className="p-2 rounded bg-white border border-slate-200 font-mono text-xs break-all select-all">
                    {enrollSecret || "Generating key..."}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enroll-code" className="text-xs font-medium text-slate-700">
                  Enter 6-digit code from app
                </Label>
                <Input
                  id="enroll-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  className="h-10 text-sm font-mono tracking-widest border-slate-200 bg-white rounded-lg"
                />
              </div>
              <Button
                type="submit"
                disabled={mfaBusy || mfaCode.trim().length < 6}
                className="w-full h-10 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none"
              >
                {mfaBusy ? "Verifying..." : "Verify & Continue"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {showMethodPicker ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">Choose how you want to sign in:</p>
                  {mfaStatus?.totpEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setMfaMethod("totp")
                        setShowMethodPicker(false)
                        setMfaCode("")
                        setMfaError(null)
                      }}
                      className="w-full p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center gap-3 text-left transition-colors"
                    >
                      <Smartphone className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900">Get a verification code from your Authenticator app</div>
                        <div className="text-[11px] text-slate-500">Google Authenticator, 1Password, or Authy</div>
                      </div>
                    </button>
                  )}
                  {(mfaStatus?.passkeyCount || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMfaMethod("passkey")
                        setShowMethodPicker(false)
                        setMfaError(null)
                      }}
                      className="w-full p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center gap-3 text-left transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900">Use your Passkey or Security Key</div>
                        <div className="text-[11px] text-slate-500">Touch ID, Face ID, or hardware key</div>
                      </div>
                    </button>
                  )}
                  {mfaStatus?.secondaryEmailVerified && (
                    <button
                      type="button"
                      onClick={() => {
                        setMfaMethod("secondary_email")
                        setShowMethodPicker(false)
                        setMfaCode("")
                        setMfaError(null)
                      }}
                      className="w-full p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center gap-3 text-left transition-colors"
                    >
                      <Mail className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900">Get a code at {mfaStatus.secondaryEmail}</div>
                        <div className="text-[11px] text-slate-500">One-time code sent to your recovery email</div>
                      </div>
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleVerifyMfa} className="space-y-4">
                  {mfaMethod === "totp" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="totp-code" className="text-xs font-medium text-slate-700">
                        Enter the 6-digit code from your Authenticator app
                      </Label>
                      <Input
                        id="totp-code"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        placeholder="000000"
                        maxLength={6}
                        autoFocus
                        className="h-10 text-sm font-mono tracking-widest border-slate-200 bg-white rounded-lg"
                      />
                    </div>
                  )}

                  {mfaMethod === "passkey" && (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-center">
                      <KeyRound className="w-6 h-6 text-primary mx-auto" />
                      <p className="text-xs font-medium text-slate-900">Verify with your Passkey</p>
                      <p className="text-[11px] text-slate-500">
                        Click Verify below to complete biometric or hardware security key authentication.
                      </p>
                    </div>
                  )}

                  {mfaMethod === "secondary_email" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="text-xs text-slate-700 truncate">{mfaStatus?.secondaryEmail}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={mfaBusy}
                          onClick={handleSendLoginEmailOtp}
                          className="h-7 text-xs shrink-0"
                        >
                          {mfaEmailOtpSent ? "Resend code" : "Send code"}
                        </Button>
                      </div>
                      <Input
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        placeholder="6-digit email code"
                        maxLength={6}
                        className="h-10 text-sm font-mono tracking-widest border-slate-200 bg-white rounded-lg"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowMethodPicker(true)}
                      className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Try another way
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <Button
                      type="submit"
                      disabled={mfaBusy || (mfaMethod !== "passkey" && mfaCode.trim().length < 6)}
                      className="h-9 px-5 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none"
                    >
                      {mfaBusy ? "Verifying..." : "Next"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame>
      <div className="w-full max-w-[520px] bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm animate-in fade-in duration-300">
        <div className="space-y-1 text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
            Sign In to Revlet
          </h1>
          <p className="text-xs text-slate-500">
            Enter your credentials to access the management console.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-slate-700">
              Work Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@institution.edu"
              className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium text-slate-700">
                Password
              </Label>

              <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100vw-32px)] max-w-[380px] border border-slate-200 rounded-xl p-6 bg-white">
                  <DialogHeader className="space-y-1.5 text-left">
                    <DialogTitle className="text-base font-semibold text-slate-900">
                      Reset Your Password
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      Enter your work email and we will send you a secure password reset link.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleForgotPassword} className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-email" className="text-xs font-medium text-slate-700">
                        Work Email
                      </Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="admin@example.com"
                        required
                        className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                      />
                    </div>
                    <DialogFooter className="pt-2">
                      <Button
                        type="submit"
                        disabled={isResetLoading}
                        className="w-full h-9 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center justify-center gap-2"
                      >
                        {isResetLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {isResetLoading ? "Sending Link..." : "Send Reset Link"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg mt-2 shadow-none flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          New to Revlet?{" "}
          <Link
            href="/signup"
            className="text-slate-900 font-medium hover:underline transition-colors"
          >
            Create an Account
          </Link>
        </div>
      </div>
    </AuthFrame>
  )
}
