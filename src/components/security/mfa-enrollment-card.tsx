"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import QRCode from "qrcode"

const StepUpMfaDialog = dynamic(
  () => import("@/components/security/step-up-mfa-dialog").then((m) => m.StepUpMfaDialog),
  { ssr: false }
)
import { useUser } from "@/firebase"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Smartphone,
  KeyRound,
  Mail,
  Trash2,
  Copy,
  Check,
  Plus,
} from "lucide-react"

function sanitizeMfaMessage(input: unknown, fallback = "Action could not be completed. Please try again."): string {
  const raw = typeof input === "string" ? input : (input as any)?.message || ""
  if (!raw) return fallback
  if (/webauthn|fido2|totp|firebase|firestore|stalwart|jmap|notallowederror|abort|securityerror/i.test(raw)) {
    if (/cancel|notallowederror|abort/i.test(raw)) {
      return "Verification was cancelled or timed out."
    }
    return fallback
  }
  return raw
}

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

export function MfaEnrollmentCard() {
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // TOTP
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [pendingSecret, setPendingSecret] = useState<string | null>(null)
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [totpVerifyCode, setTotpVerifyCode] = useState("")
  const [secretCopied, setSecretCopied] = useState(false)

  useEffect(() => {
    if (!otpauthUri) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(otpauthUri, { width: 176, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [otpauthUri])

  // Passkeys
  const [passkeys, setPasskeys] = useState<Array<{ id: string; label: string; createdAt: string }>>([])
  const [passkeyLabel, setPasskeyLabel] = useState("")
  const [showAddPasskey, setShowAddPasskey] = useState(false)

  // Secondary email
  const [secondaryEmail, setSecondaryEmail] = useState("")
  const [secondaryVerified, setSecondaryVerified] = useState(false)
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [emailVerifyCode, setEmailVerifyCode] = useState("")

  const loadStatus = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/auth/mfa", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data?.ok && data.mfa) {
        setTotpEnabled(Boolean(data.mfa.totpEnabled))
        setPasskeys(Array.isArray(data.mfa.passkeys) ? data.mfa.passkeys : [])
        setSecondaryEmail(data.mfa.secondaryEmail || "")
        setSecondaryVerified(Boolean(data.mfa.secondaryEmailVerified))
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const callMfa = async (payload: Record<string, unknown>) => {
    if (!user) throw new Error("Not signed in")
    const token = await user.getIdToken()
    const res = await fetch("/api/auth/mfa", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) {
      const rawErr = String(data.error || "")
      if (rawErr.includes("MFA_STEP_UP_REQUIRED")) {
        throw new Error(rawErr)
      }
      throw new Error(sanitizeMfaMessage(data.error, "Verification request failed."))
    }
    return data
  }

  const [stepUpOpen, setStepUpOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    | null
    | { type: "totp_setup" | "totp_disable" | "passkey_register" | "secondary_email_send"; label: string }
    | { type: "passkey_remove"; id: string; label: string }
  >(null)

  const handleStartTotp = async (stepUpToken?: string) => {
    setBusy(true)
    try {
      const data = await callMfa({
        action: "totp_setup",
        ...(stepUpToken ? { stepUpToken } : {}),
      })
      setPendingSecret(data.secret)
      setOtpauthUri(data.otpauthUri)
    } catch (err: any) {
      if (String(err?.message || "").includes("MFA_STEP_UP_REQUIRED")) {
        setPendingAction({ type: "totp_setup", label: "configure your authenticator app" })
        setStepUpOpen(true)
        return
      }
      toast({
        variant: "destructive",
        title: "Setup Failed",
        description: sanitizeMfaMessage(err, "Could not start authenticator setup."),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleEnableTotp = async () => {
    setBusy(true)
    try {
      await callMfa({ action: "totp_enable", code: totpVerifyCode })
      setPendingSecret(null)
      setOtpauthUri(null)
      setTotpVerifyCode("")
      toast({
        title: "Authenticator Enabled",
        description: "6-digit verification codes are now active on your account.",
      })
      await loadStatus()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Invalid Code",
        description: sanitizeMfaMessage(err, "Invalid 6-digit verification code."),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDisableTotp = async (stepUpToken?: string) => {
    setBusy(true)
    try {
      await callMfa({
        action: "totp_disable",
        ...(stepUpToken ? { stepUpToken } : {}),
      })
      toast({ title: "Authenticator Disabled" })
      await loadStatus()
    } catch (err: any) {
      if (String(err?.message || "").includes("MFA_STEP_UP_REQUIRED")) {
        setPendingAction({ type: "totp_disable", label: "disable your authenticator app" })
        setStepUpOpen(true)
        return
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: sanitizeMfaMessage(err, "Could not disable authenticator."),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleRegisterPasskey = async (stepUpToken?: string) => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      toast({
        variant: "destructive",
        title: "Unsupported Browser",
        description: "Passkeys are not supported in this browser.",
      })
      return
    }
    setBusy(true)
    try {
      const opt = await callMfa({
        action: "passkey_register_options",
        ...(stepUpToken ? { stepUpToken } : {}),
      })
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: b64uToBuf(opt.challenge),
          rp: opt.rp,
          user: {
            id: b64uToBuf(opt.user.id),
            name: opt.user.name,
            displayName: opt.user.displayName,
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: { userVerification: "preferred" },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null
      if (!cred) throw new Error("Cancelled")
      const resp = cred.response as AuthenticatorAttestationResponse
      const publicKeyBuf = typeof resp.getPublicKey === "function" ? resp.getPublicKey() : null
      const publicKeyAlgorithm =
        typeof resp.getPublicKeyAlgorithm === "function" ? resp.getPublicKeyAlgorithm() : -7
      const authDataBuf =
        typeof resp.getAuthenticatorData === "function" ? resp.getAuthenticatorData() : null
      if (!publicKeyBuf) {
        throw new Error("Your browser did not provide a WebAuthn public key for this passkey.")
      }
      await callMfa({
        action: "passkey_register_verify",
        credentialId: bufToB64u(cred.rawId),
        clientDataJSON: bufToB64u(resp.clientDataJSON),
        publicKeySpki: bufToB64u(publicKeyBuf),
        publicKeyAlgorithm,
        ...(authDataBuf ? { authenticatorData: bufToB64u(authDataBuf) } : {}),
        label: passkeyLabel.trim() || "Security Key",
      })
      toast({
        title: "Passkey Registered",
        description: "Your passkey is ready for sign-in and verification.",
      })
      setPasskeyLabel("")
      setShowAddPasskey(false)
      await loadStatus()
    } catch (err: any) {
      if (String(err?.message || "").includes("MFA_STEP_UP_REQUIRED")) {
        setPendingAction({ type: "passkey_register", label: "register a new passkey" })
        setStepUpOpen(true)
        return
      }
      toast({
        variant: "destructive",
        title: "Passkey Registration Failed",
        description: sanitizeMfaMessage(err, "Could not register passkey."),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleRemovePasskey = async (id: string, stepUpToken?: string) => {
    setBusy(true)
    try {
      await callMfa({
        action: "passkey_remove",
        credentialId: id,
        ...(stepUpToken ? { stepUpToken } : {}),
      })
      toast({ title: "Passkey Removed" })
      await loadStatus()
    } catch (err: any) {
      if (String(err?.message || "").includes("MFA_STEP_UP_REQUIRED")) {
        setPendingAction({ type: "passkey_remove", id, label: "remove a passkey" })
        setStepUpOpen(true)
        return
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: sanitizeMfaMessage(err, "Could not remove passkey."),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleSendSecondaryEmail = async (stepUpToken?: string) => {
    setBusy(true)
    try {
      await callMfa({
        action: "secondary_email_send",
        secondaryEmail,
        ...(stepUpToken ? { stepUpToken } : {}),
      })
      setEmailCodeSent(true)
      toast({
        title: "Verification Code Sent",
        description: `Sent a 6-digit code to ${secondaryEmail}.`,
      })
    } catch (err: any) {
      if (String(err?.message || "").includes("MFA_STEP_UP_REQUIRED")) {
        setPendingAction({ type: "secondary_email_send", label: "update your recovery email" })
        setStepUpOpen(true)
        return
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: sanitizeMfaMessage(err, "Could not send verification email."),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleVerifySecondaryEmail = async () => {
    setBusy(true)
    try {
      await callMfa({ action: "secondary_email_verify", code: emailVerifyCode })
      setEmailCodeSent(false)
      setEmailVerifyCode("")
      toast({
        title: "Secondary Email Verified",
        description: "Backup email is now active for verification.",
      })
      await loadStatus()
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Invalid Code",
        description: sanitizeMfaMessage(err, "Invalid verification code."),
      })
    } finally {
      setBusy(false)
    }
  }

  const enrolledCount =
    (totpEnabled ? 1 : 0) + (passkeys.length > 0 ? 1 : 0) + (secondaryVerified ? 1 : 0)

  return (
    <Card className="bg-white border border-slate-200/80 shadow-none rounded-xl overflow-hidden">
      <CardHeader className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-sm font-headline font-semibold text-slate-900">
            2-Step Verification (MFA)
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Protect your account and sensitive administrative actions with a second verification step
          </CardDescription>
        </div>
        {loading ? (
          <Skeleton className="h-5 w-32 rounded-md" />
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`h-2 w-2 rounded-full ${
                enrolledCount > 0 ? "bg-emerald-600" : "bg-amber-500"
              }`}
            />
            <span className="text-xs font-medium text-slate-700">
              {enrolledCount > 0
                ? `${enrolledCount} ${enrolledCount === 1 ? "method" : "methods"} active`
                : "No methods enrolled"}
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0 divide-y divide-slate-100">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="p-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                  <div className="space-y-2 flex-1 max-w-md">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3 w-72" />
                  </div>
                </div>
                <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* 1. Authenticator App */}
            <div className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Smartphone className="w-4 h-4 text-slate-700" strokeWidth={1.5} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Authenticator App
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                          totpEnabled ? "text-emerald-700" : "text-slate-400"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            totpEnabled ? "bg-emerald-600" : "bg-slate-300"
                          }`}
                        />
                        {totpEnabled ? "Configured" : "Not configured"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Generate time-based 6-digit verification codes using your mobile or desktop authenticator app
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:pl-4 shrink-0">
                  {totpEnabled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleDisableTotp()}
                      disabled={busy}
                      className="h-8 text-xs border-slate-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </Button>
                  ) : !pendingSecret ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleStartTotp()}
                      disabled={busy}
                      className="h-8 text-xs border-slate-200"
                    >
                      Set up authenticator
                    </Button>
                  ) : null}
                </div>
              </div>

              {pendingSecret && (
                <div className="ml-0 sm:ml-12 p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {qrDataUrl && (
                      <div className="p-2 rounded-lg bg-white border border-slate-200 shrink-0">
                        <img
                          src={qrDataUrl}
                          alt="Authenticator QR Code"
                          className="w-36 h-36"
                        />
                      </div>
                    )}
                    <div className="space-y-2 flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800">
                        1. Scan the QR code with your authenticator app
                      </p>
                      <p className="text-xs text-slate-500">
                        Can’t scan the barcode? Enter this setup key manually:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 font-mono text-xs text-slate-800 select-all break-all">
                          {pendingSecret}
                        </code>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 shrink-0 border-slate-200"
                          onClick={() => {
                            navigator.clipboard.writeText(pendingSecret)
                            setSecretCopied(true)
                            setTimeout(() => setSecretCopied(false), 1500)
                          }}
                        >
                          {secretCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-600" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div className="space-y-1.5 flex-1 max-w-xs">
                      <Label className="text-xs font-medium text-slate-700">
                        2. Enter the 6-digit code shown in your app
                      </Label>
                      <Input
                        value={totpVerifyCode}
                        onChange={(e) => setTotpVerifyCode(e.target.value)}
                        placeholder="000000"
                        maxLength={6}
                        className="h-9 font-mono text-xs tracking-widest bg-white border-slate-200"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPendingSecret(null)
                          setOtpauthUri(null)
                          setTotpVerifyCode("")
                        }}
                        className="h-9 text-xs text-slate-600"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleEnableTotp}
                        disabled={busy || totpVerifyCode.trim().length < 6}
                        className="h-9 text-xs bg-primary hover:bg-primary/90 text-white"
                      >
                        Verify & Save
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Passkeys & Security Keys */}
            <div className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                    <KeyRound className="w-4 h-4 text-slate-700" strokeWidth={1.5} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Passkeys & Security Keys
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {passkeys.length} registered
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Sign in with Touch ID, Face ID, Windows Hello, or a hardware security key
                    </p>
                  </div>
                </div>

                {!showAddPasskey && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPasskeyLabel("")
                      setShowAddPasskey(true)
                    }}
                    disabled={busy}
                    className="h-8 text-xs border-slate-200 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add a passkey
                  </Button>
                )}
              </div>

              {showAddPasskey && (
                <div className="ml-0 sm:ml-12 p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-xs font-medium text-slate-700">
                      Passkey or device name
                    </Label>
                    <Input
                      value={passkeyLabel}
                      onChange={(e) => setPasskeyLabel(e.target.value)}
                      placeholder="Enter device name"
                      className="h-9 text-xs bg-white border-slate-200"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPasskeyLabel("")
                        setShowAddPasskey(false)
                      }}
                      className="h-9 text-xs text-slate-600"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleRegisterPasskey()}
                      disabled={busy}
                      className="h-9 text-xs bg-primary hover:bg-primary/90 text-white"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {passkeys.length > 0 && (
                <div className="ml-0 sm:ml-12 divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
                  {passkeys.map((pk) => (
                    <div
                      key={pk.id}
                      className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{pk.label}</span>
                        {pk.createdAt && (
                          <span className="text-[11px] font-mono text-slate-400">
                            Added {new Date(pk.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-rose-600"
                        onClick={() => handleRemovePasskey(pk.id)}
                        disabled={busy}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Backup Recovery Email */}
            <div className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-slate-700" strokeWidth={1.5} />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        Recovery Email
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                          secondaryVerified ? "text-emerald-700" : "text-slate-400"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            secondaryVerified ? "bg-emerald-600" : "bg-slate-300"
                          }`}
                        />
                        {secondaryVerified ? "Verified" : "Unverified"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Receive one-time verification codes at a secondary email address if you don’t have your device
                    </p>
                  </div>
                </div>
              </div>

              <div className="ml-0 sm:ml-12 space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-md">
                  <Input
                    type="email"
                    value={secondaryEmail}
                    onChange={(e) => setSecondaryEmail(e.target.value)}
                    placeholder="backup@example.com"
                    className="h-9 text-xs bg-white border-slate-200"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleSendSecondaryEmail()}
                    disabled={busy || !secondaryEmail.includes("@")}
                    className="h-9 text-xs border-slate-200 shrink-0"
                  >
                    {secondaryVerified ? "Update & Verify" : "Send Verification Code"}
                  </Button>
                </div>

                {emailCodeSent && (
                  <div className="flex items-center gap-2 max-w-xs">
                    <Input
                      value={emailVerifyCode}
                      onChange={(e) => setEmailVerifyCode(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      className="h-9 font-mono text-xs tracking-widest bg-white border-slate-200"
                    />
                    <Button
                      size="sm"
                      onClick={handleVerifySecondaryEmail}
                      disabled={busy || emailVerifyCode.trim().length < 6}
                      className="h-9 text-xs bg-primary hover:bg-primary/90 text-white shrink-0"
                    >
                      Verify
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
      <StepUpMfaDialog
        open={stepUpOpen}
        onOpenChange={(open) => {
          setStepUpOpen(open)
          if (!open) setPendingAction(null)
        }}
        actionLabel={pendingAction?.label || "modify your security factors"}
        onVerified={(token) => {
          const act = pendingAction
          setPendingAction(null)
          if (!act) return
          if (act.type === "totp_setup") void handleStartTotp(token)
          else if (act.type === "totp_disable") void handleDisableTotp(token)
          else if (act.type === "passkey_register") void handleRegisterPasskey(token)
          else if (act.type === "passkey_remove") void handleRemovePasskey(act.id, token)
          else if (act.type === "secondary_email_send") void handleSendSecondaryEmail(token)
        }}
      />
    </Card>
  )
}
