"use client"

import { useEffect, useState } from "react"
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
import { ShieldCheck, Smartphone, KeyRound, Mail, Loader2, AlertCircle } from "lucide-react"
import { useUser } from "@/firebase"
import Link from "next/link"

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let str = ""
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlToBuffer(b64u: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64u.length % 4)) % 4)
  const b64 = (b64u + pad).replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr.buffer
}

interface StepUpMfaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  actionLabel?: string
  onVerified: (stepUpToken: string) => void
}

export function StepUpMfaDialog({
  open,
  onOpenChange,
  actionLabel = "Complete this sensitive administrative action",
  onVerified,
}: StepUpMfaDialogProps) {
  const { user } = useUser()
  const [activeTab, setActiveTab] = useState<"totp" | "passkey" | "email">("totp")
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [passkeyCount, setPasskeyCount] = useState(0)
  const [secondaryEmail, setSecondaryEmail] = useState("")
  const [secondaryEmailVerified, setSecondaryEmailVerified] = useState(false)

  const [totpCode, setTotpCode] = useState("")
  const [emailCode, setEmailCode] = useState("")
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !user) return
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
        if (data?.ok && data.mfa) {
          setTotpEnabled(Boolean(data.mfa.totpEnabled))
          setPasskeyCount(Array.isArray(data.mfa.passkeys) ? data.mfa.passkeys.length : 0)
          setSecondaryEmail(data.mfa.secondaryEmail || "")
          setSecondaryEmailVerified(Boolean(data.mfa.secondaryEmailVerified))
          if (data.mfa.totpEnabled) setActiveTab("totp")
          else if (Array.isArray(data.mfa.passkeys) && data.mfa.passkeys.length > 0) setActiveTab("passkey")
          else setActiveTab("email")
        }
      })
      .catch(() => {})
      .finally(() => setLoadingStatus(false))
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
        body: JSON.stringify({ action: "step_up_verify", method: "totp", code: totpCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok || !data.stepUpToken) {
        throw new Error(data.error || "Verification failed")
      }
      onVerified(data.stepUpToken)
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || "Invalid authenticator code")
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifyPasskey = async () => {
    if (!user) return
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setError("Passkeys (WebAuthn) are not supported in this browser.")
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
      if (!optRes.ok || !optData.ok) throw new Error(optData.error || "Could not start passkey prompt")

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: base64UrlToBuffer(optData.challenge),
          allowCredentials: (optData.allowCredentials || []).map((c: any) => ({
            id: base64UrlToBuffer(c.id),
            type: "public-key",
          })),
          userVerification: "preferred",
          timeout: 60000,
        },
      })) as PublicKeyCredential | null

      if (!assertion) throw new Error("Passkey prompt was cancelled.")
      const response = assertion.response as AuthenticatorAssertionResponse

      const verRes = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "step_up_verify",
          method: "passkey",
          credentialId: bufferToBase64Url(assertion.rawId),
          clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        }),
      })
      const verData = await verRes.json()
      if (!verRes.ok || !verData.ok || !verData.stepUpToken) {
        throw new Error(verData.error || "Passkey verification failed")
      }
      onVerified(verData.stepUpToken)
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || "Passkey verification failed")
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
      setError(err?.message || "Failed to send email code")
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
      setError(err?.message || "Verification failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Step-Up MFA Verification Required
          </DialogTitle>
          <DialogDescription className="text-xs">{actionLabel}</DialogDescription>
        </DialogHeader>

        {loadingStatus ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking enrolled MFA factors...
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
                  <Link href="/management/settings" className="text-blue-600 font-medium underline inline-block">
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
                  <Link href="/management/settings" className="text-blue-600 font-medium underline inline-block">
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
                  <Link href="/management/settings" className="text-blue-600 font-medium underline inline-block">
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
