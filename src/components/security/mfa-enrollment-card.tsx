"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Smartphone, KeyRound, Mail, ShieldCheck, Loader2, Trash2, CheckCircle2 } from "lucide-react"
import { useUser } from "@/firebase"
import { toast } from "@/hooks/use-toast"

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

export function MfaEnrollmentCard() {
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [totpUri, setTotpUri] = useState<string | null>(null)
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState("")
  const [passkeys, setPasskeys] = useState<Array<{ id: string; label: string; createdAt: string }>>([])
  const [passkeyLabel, setPasskeyLabel] = useState("MacBook / Security Key")
  const [secondaryEmail, setSecondaryEmail] = useState("")
  const [secondaryEmailVerified, setSecondaryEmailVerified] = useState(false)
  const [emailOtpSent, setEmailOtpSent] = useState(false)
  const [emailOtpCode, setEmailOtpCode] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const loadMfaStatus = useCallback(async () => {
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
        setSecondaryEmailVerified(Boolean(data.mfa.secondaryEmailVerified))
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadMfaStatus()
  }, [loadMfaStatus])

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
    if (!res.ok || !data.ok) throw new Error(data.error || "MFA action failed")
    return data
  }

  const handleStartTotp = async () => {
    setBusy("totp")
    try {
      const data = await callMfa({ action: "totp_setup" })
      setTotpSecret(data.secret)
      setTotpUri(data.otpauthUri)
      if (data.otpauthUri) {
        const qr = await QRCode.toDataURL(data.otpauthUri, { width: 176, margin: 1 })
        setTotpQrDataUrl(qr)
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message })
    } finally {
      setBusy(null)
    }
  }

  const handleEnableTotp = async () => {
    setBusy("totp")
    try {
      await callMfa({ action: "totp_enable", code: totpCode })
      setTotpSecret(null)
      setTotpUri(null)
      setTotpQrDataUrl(null)
      setTotpCode("")
      toast({ title: "Authenticator App Enabled" })
      await loadMfaStatus()
    } catch (err: any) {
      toast({ variant: "destructive", title: "Invalid code", description: err?.message })
    } finally {
      setBusy(null)
    }
  }

  const handleDisableTotp = async () => {
    if (!totpCode.trim()) {
      toast({ variant: "destructive", title: "Code required", description: "Enter your current 6-digit code to disable." })
      return
    }
    setBusy("totp")
    try {
      await callMfa({ action: "totp_disable", code: totpCode })
      setTotpCode("")
      toast({ title: "Authenticator App Disabled" })
      await loadMfaStatus()
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message })
    } finally {
      setBusy(null)
    }
  }

  const handleRegisterPasskey = async () => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      toast({ variant: "destructive", title: "Unsupported", description: "WebAuthn passkeys are not supported in this browser." })
      return
    }
    setBusy("passkey")
    try {
      const opt = await callMfa({ action: "passkey_register_options" })
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: base64UrlToBuffer(opt.challenge),
          rp: opt.rp,
          user: {
            id: base64UrlToBuffer(opt.user.id),
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

      if (!cred) throw new Error("Passkey creation cancelled.")
      const response = cred.response as AuthenticatorAttestationResponse

      await callMfa({
        action: "passkey_register_verify",
        credentialId: bufferToBase64Url(cred.rawId),
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        label: passkeyLabel.trim() || "Security Passkey",
      })
      toast({ title: "Passkey Registered" })
      await loadMfaStatus()
    } catch (err: any) {
      toast({ variant: "destructive", title: "Passkey Error", description: err?.message })
    } finally {
      setBusy(null)
    }
  }

  const handleRemovePasskey = async (credentialId: string) => {
    setBusy(`pk-${credentialId}`)
    try {
      await callMfa({ action: "passkey_remove", credentialId })
      toast({ title: "Passkey Removed" })
      await loadMfaStatus()
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message })
    } finally {
      setBusy(null)
    }
  }

  const handleSendSecondaryEmail = async () => {
    if (!secondaryEmail.includes("@")) {
      toast({ variant: "destructive", title: "Invalid email", description: "Enter a valid secondary email address." })
      return
    }
    setBusy("email")
    try {
      await callMfa({ action: "secondary_email_send", secondaryEmail })
      setEmailOtpSent(true)
      toast({ title: "Verification code sent", description: `Check ${secondaryEmail}` })
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message })
    } finally {
      setBusy(null)
    }
  }

  const handleVerifySecondaryEmail = async () => {
    setBusy("email")
    try {
      await callMfa({ action: "secondary_email_verify", code: emailOtpCode })
      setEmailOtpSent(false)
      setEmailOtpCode("")
      toast({ title: "Secondary Email Verified" })
      await loadMfaStatus()
    } catch (err: any) {
      toast({ variant: "destructive", title: "Invalid code", description: err?.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          Multi-Factor Authentication (Step-Up MFA)
        </CardTitle>
        <CardDescription className="text-xs">
          Configure Authenticator App, Passkey, and Secondary Email for sensitive admin & compliance actions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading MFA factors...
          </div>
        ) : (
          <>
            {/* 1. Authenticator App (TOTP) */}
            <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-700" />
                  <div>
                    <p className="text-sm font-medium">Authenticator App (TOTP)</p>
                    <p className="text-xs text-muted-foreground">Google Authenticator, 1Password, Authy</p>
                  </div>
                </div>
                <Badge variant={totpEnabled ? "default" : "secondary"}>
                  {totpEnabled ? "Enrolled" : "Not Enrolled"}
                </Badge>
              </div>

              {!totpEnabled && !totpSecret && (
                <Button size="sm" variant="outline" onClick={handleStartTotp} disabled={busy === "totp"}>
                  Set up Authenticator App
                </Button>
              )}

              {totpSecret && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Scan this QR code with your authenticator app, or enter the setup key manually:
                  </p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {totpQrDataUrl && (
                      <div className="p-2 rounded-lg bg-white border border-slate-200 shrink-0">
                        <img src={totpQrDataUrl} alt="Authenticator QR Code" className="w-40 h-40" />
                      </div>
                    )}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-slate-600">Manual Setup Key</div>
                      <div className="p-2.5 rounded bg-background border font-mono text-xs break-all select-all">
                        {totpSecret}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      className="max-w-[160px] font-mono"
                    />
                    <Button size="sm" onClick={handleEnableTotp} disabled={busy === "totp"}>
                      Verify & Enable
                    </Button>
                  </div>
                </div>
              )}

              {totpEnabled && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="Enter 6-digit code to disable"
                    maxLength={6}
                    className="max-w-[210px] font-mono h-8 text-xs"
                  />
                  <Button size="sm" variant="destructive" onClick={handleDisableTotp} disabled={busy === "totp"}>
                    Disable
                  </Button>
                </div>
              )}
            </div>

            {/* 2. Passkeys (WebAuthn) */}
            <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-slate-700" />
                  <div>
                    <p className="text-sm font-medium">Passkeys & Hardware Keys</p>
                    <p className="text-xs text-muted-foreground">Touch ID, Face ID, YubiKey (FIDO2 / WebAuthn)</p>
                  </div>
                </div>
                <Badge variant={passkeys.length > 0 ? "default" : "secondary"}>
                  {passkeys.length} Registered
                </Badge>
              </div>

              {passkeys.length > 0 && (
                <div className="space-y-2">
                  {passkeys.map((pk) => (
                    <div key={pk.id} className="flex items-center justify-between p-2 rounded bg-background border text-xs">
                      <span className="font-medium">{pk.label}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleRemovePasskey(pk.id)}
                        disabled={busy === `pk-${pk.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Input
                  value={passkeyLabel}
                  onChange={(e) => setPasskeyLabel(e.target.value)}
                  placeholder="Passkey name"
                  className="max-w-[220px] h-8 text-xs"
                />
                <Button size="sm" variant="outline" onClick={handleRegisterPasskey} disabled={busy === "passkey"}>
                  Register Passkey
                </Button>
              </div>
            </div>

            {/* 3. Secondary Recovery Email */}
            <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-700" />
                  <div>
                    <p className="text-sm font-medium">Secondary Recovery Email</p>
                    <p className="text-xs text-muted-foreground">Backup 6-digit email verification for Step-Up MFA</p>
                  </div>
                </div>
                {secondaryEmailVerified ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary">Not Verified</Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={secondaryEmail}
                  onChange={(e) => setSecondaryEmail(e.target.value)}
                  placeholder="backup@domain.com"
                  className="max-w-[260px] h-8 text-xs"
                />
                <Button size="sm" variant="outline" onClick={handleSendSecondaryEmail} disabled={busy === "email"}>
                  Send Code
                </Button>
              </div>

              {emailOtpSent && (
                <div className="flex items-center gap-2">
                  <Input
                    value={emailOtpCode}
                    onChange={(e) => setEmailOtpCode(e.target.value)}
                    placeholder="6-digit email code"
                    maxLength={6}
                    className="max-w-[160px] h-8 text-xs font-mono"
                  />
                  <Button size="sm" onClick={handleVerifySecondaryEmail} disabled={busy === "email"}>
                    Verify Email
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
