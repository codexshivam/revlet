"use client"

import { useEffect, useState } from "react"
import { useUser } from "@/firebase"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShieldCheck, KeyRound, Mail, Smartphone, Loader2, AlertCircle } from "lucide-react"
import Link from "next/link"

interface StepUpMfaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  actionLabel?: string
  onVerified: (stepUpToken: string) => void
}

function sanitizeMfaError(input: unknown, fallback = "Verification failed. Please try again."): string {
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

export function StepUpMfaDialog({
  open,
  onOpenChange,
  actionLabel = "This action requires additional verification.",
  onVerified,
}: StepUpMfaDialogProps) {
  const { user } = useUser()
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [passkeyCount, setPasskeyCount] = useState(0)
  const [secondaryEmail, setSecondaryEmail] = useState("")
  const [secondaryEmailVerified, setSecondaryEmailVerified] = useState(false)

  const [activeTab, setActiveTab] = useState<"totp" | "passkey" | "email">("totp")
  const [totpCode, setTotpCode] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !user) return
    let cancelled = false
    setError(null)
    setTotpCode("")
    setEmailCode("")
    setEmailCodeSent(false)
    setLoadingStatus(true)

    user
      .getIdToken()
      .then((token) =>
        fetch("/api/auth/mfa", {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.ok && data.mfa) {
          const tEnabled = Boolean(data.mfa.totpEnabled)
          const pCount = Array.isArray(data.mfa.passkeys) ? data.mfa.passkeys.length : 0
          const sVerified = Boolean(data.mfa.secondaryEmailVerified)
          setTotpEnabled(tEnabled)
          setPasskeyCount(pCount)
          setSecondaryEmail(data.mfa.secondaryEmail || "")
          setSecondaryEmailVerified(sVerified)
          if (tEnabled) setActiveTab("totp")
          else if (pCount > 0) setActiveTab("passkey")
          else if (sVerified) setActiveTab("email")
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingStatus(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, user])

  const handleVerifyTotp = async () => {
    if (!user || !totpCode.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "step_up_verify",
          method: "totp",
          code: totpCode.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok || !data.stepUpToken) {
        throw new Error(data.error || "Invalid verification code")
      }
      onVerified(data.stepUpToken)
      onOpenChange(false)
    } catch (err: any) {
      setError(sanitizeMfaError(err, "Verification failed"))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifyPasskey = async () => {
    if (!user) return
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setError("Passkeys are not supported in this browser.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const optRes = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "passkey_assert_options" }),
      })
      const optData = await optRes.json()
      if (!optRes.ok || !optData.ok) {
        throw new Error(optData.error || "Could not start passkey verification")
      }

      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge: b64uToBuf(optData.challenge),
          ...(optData.rpId ? { rpId: optData.rpId } : {}),
          allowCredentials: (optData.allowCredentials || []).map((c: any) => ({
            id: b64uToBuf(c.id),
            type: "public-key",
          })),
          timeout: 60000,
          userVerification: "preferred",
        },
      })) as PublicKeyCredential | null

      if (!cred) throw new Error("Passkey verification cancelled")
      const resp = cred.response as AuthenticatorAssertionResponse

      const verifyRes = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "step_up_verify",
          method: "passkey",
          credentialId: bufToB64u(cred.rawId),
          clientDataJSON: bufToB64u(resp.clientDataJSON),
          authenticatorData: bufToB64u(resp.authenticatorData),
          signature: bufToB64u(resp.signature),
        }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok || !verifyData.ok || !verifyData.stepUpToken) {
        throw new Error(verifyData.error || "Passkey verification failed")
      }
      onVerified(verifyData.stepUpToken)
      onOpenChange(false)
    } catch (err: any) {
      setError(sanitizeMfaError(err, "Passkey verification failed"))
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendSecondaryEmailCode = async () => {
    if (!user) return
    setSubmitting(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "secondary_email_send" }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not send verification email")
      setEmailCodeSent(true)
    } catch (err: any) {
      setError(sanitizeMfaError(err, "Failed to send email code"))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifySecondaryEmailCode = async () => {
    if (!user || !emailCode.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "step_up_verify",
          method: "secondary_email",
          code: emailCode.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok || !data.stepUpToken) {
        throw new Error(data.error || "Invalid email code")
      }
      onVerified(data.stepUpToken)
      onOpenChange(false)
    } catch (err: any) {
      setError(sanitizeMfaError(err, "Verification failed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5 text-zinc-900" />
            Verification Required
          </DialogTitle>
          <DialogDescription className="text-xs">{actionLabel}</DialogDescription>
        </DialogHeader>

        {loadingStatus ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking verification methods...
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="totp" className="text-xs gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                Authenticator
              </TabsTrigger>
              <TabsTrigger value="passkey" className="text-xs gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                Passkey
              </TabsTrigger>
              <TabsTrigger value="email" className="text-xs gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                Backup Email
              </TabsTrigger>
            </TabsList>

            {error && (
              <div className="mt-3 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <TabsContent value="totp" className="space-y-3 pt-3">
              {!totpEnabled ? (
                <div className="text-xs text-muted-foreground space-y-2 p-3 rounded-md bg-muted/50 border">
                  <p>Authenticator App is not enrolled yet on your account.</p>
                  <Link href="/management/settings" className="text-zinc-900 font-medium underline inline-block hover:text-zinc-700">
                    Enroll in Account Settings →
                  </Link>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">6-Digit Authenticator Code</Label>
                    <Input
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      className="font-mono tracking-widest text-center"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleVerifyTotp}
                    disabled={submitting || totpCode.trim().length < 6}
                    className="w-full"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Verify Authenticator Code
                  </Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="passkey" className="space-y-3 pt-3">
              {passkeyCount === 0 ? (
                <div className="text-xs text-muted-foreground space-y-2 p-3 rounded-md bg-muted/50 border">
                  <p>No Passkeys registered on your account.</p>
                  <Link href="/management/settings" className="text-zinc-900 font-medium underline inline-block hover:text-zinc-700">
                    Register a Passkey in Account Settings →
                  </Link>
                </div>
              ) : (
                <Button type="button" onClick={handleVerifyPasskey} disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                  Use Passkey / Biometrics
                </Button>
              )}
            </TabsContent>

            <TabsContent value="email" className="space-y-3 pt-3">
              {!secondaryEmailVerified ? (
                <div className="text-xs text-muted-foreground space-y-2 p-3 rounded-md bg-muted/50 border">
                  <p>No verified secondary email configured.</p>
                  <Link href="/management/settings" className="text-zinc-900 font-medium underline inline-block hover:text-zinc-700">
                    Configure Secondary Email in Account Settings →
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Send a one-time code to <span className="font-medium text-foreground">{secondaryEmail}</span>.
                  </p>
                  {!emailCodeSent ? (
                    <Button type="button" variant="outline" onClick={handleSendSecondaryEmailCode} disabled={submitting} className="w-full">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Send Verification Code
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-xs">6-Digit Email Code</Label>
                      <Input
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        className="font-mono tracking-widest text-center"
                      />
                      <Button
                        type="button"
                        onClick={handleVerifySecondaryEmailCode}
                        disabled={submitting || emailCode.trim().length < 6}
                        className="w-full"
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Verify Email Code
                      </Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
