"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Smartphone, KeyRound, Mail, Loader2, Trash2, Copy, Check } from "lucide-react"
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
  const [showDisableTotp, setShowDisableTotp] = useState(false)
  const [showAddPasskey, setShowAddPasskey] = useState(false)
  const [showEditEmail, setShowEditEmail] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)
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

  const activeFactorCount =
    (totpEnabled ? 1 : 0) + (passkeys.length > 0 ? 1 : 0) + (secondaryEmailVerified ? 1 : 0)

  const handleCopySecret = async () => {
    if (!totpSecret) return
    try {
      await navigator.clipboard.writeText(totpSecret)
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 1800)
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-slate-900">Multi-Factor Authentication</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Verify sign-ins and sensitive admin actions with a second factor
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-slate-600 tabular-nums shrink-0">
          <span
            className={`h-2 w-2 rounded-full ${
              activeFactorCount > 0 ? "bg-emerald-500" : "bg-slate-300"
            }`}
            aria-hidden="true"
          />
          <span>
            {activeFactorCount > 0
              ? `${activeFactorCount} ${activeFactorCount === 1 ? "factor" : "factors"} active`
              : "No factors configured"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-8 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          <span>Loading security factors</span>
        </div>
      ) : (
        <div className="divide-y divide-slate-200/80">
          {/* 1. Authenticator App (TOTP) */}
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">Authenticator app</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          totpEnabled ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      {totpEnabled ? "Active" : "Not set up"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Time-based codes from Google Authenticator, 1Password, or Authy
                  </p>
                </div>
              </div>

              <div className="shrink-0 pl-11 sm:pl-0">
                {!totpEnabled && !totpSecret && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs rounded-lg border-slate-200"
                    onClick={handleStartTotp}
                    disabled={busy === "totp"}
                  >
                    {busy === "totp" ? "Starting..." : "Set up"}
                  </Button>
                )}
                {totpEnabled && !showDisableTotp && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-slate-600 hover:text-rose-600 rounded-lg"
                    onClick={() => {
                      setTotpCode("")
                      setShowDisableTotp(true)
                    }}
                  >
                    Disable
                  </Button>
                )}
              </div>
            </div>

            {totpSecret && (
              <div className="ml-0 sm:ml-11 p-4 rounded-xl border border-slate-200/80 bg-slate-50/70 space-y-4">
                <div className="flex flex-col sm:flex-row items-start gap-5">
                  {totpQrDataUrl && (
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 shrink-0">
                      <img src={totpQrDataUrl} alt="Authenticator QR Code" className="w-36 h-36" />
                    </div>
                  )}
                  <div className="space-y-3 flex-1 min-w-0">
                    <div>
                      <p className="text-xs font-medium text-slate-900">1. Scan QR code or copy setup key</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Open your authenticator app and scan the code, or paste the key below
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/80 font-mono text-xs text-slate-700 break-all select-all flex-1">
                        {totpSecret}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-xs border-slate-200 shrink-0"
                        onClick={handleCopySecret}
                      >
                        {copiedSecret ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.5} />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
                        )}
                      </Button>
                    </div>
                    <div className="pt-1 space-y-2">
                      <p className="text-xs font-medium text-slate-900">2. Enter the 6-digit code</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value)}
                          placeholder="000000"
                          maxLength={6}
                          className="w-32 h-8 text-xs font-mono tabular-nums bg-white"
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs rounded-lg"
                          onClick={handleEnableTotp}
                          disabled={busy === "totp"}
                        >
                          Verify and enable
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-slate-500"
                          onClick={() => {
                            setTotpSecret(null)
                            setTotpUri(null)
                            setTotpQrDataUrl(null)
                            setTotpCode("")
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {totpEnabled && showDisableTotp && (
              <div className="ml-0 sm:ml-11 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 flex flex-wrap items-center gap-2">
                <Input
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="Current 6-digit code"
                  maxLength={6}
                  className="w-40 h-8 text-xs font-mono tabular-nums bg-white"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs rounded-lg"
                  onClick={async () => {
                    await handleDisableTotp()
                    setShowDisableTotp(false)
                  }}
                  disabled={busy === "totp"}
                >
                  Confirm disable
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-slate-500"
                  onClick={() => {
                    setShowDisableTotp(false)
                    setTotpCode("")
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* 2. Passkeys (WebAuthn) */}
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                  <KeyRound className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">Passkeys &amp; security keys</span>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {passkeys.length} registered
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sign in with Touch ID, Face ID, or a FIDO2 hardware key
                  </p>
                </div>
              </div>

              <div className="shrink-0 pl-11 sm:pl-0">
                {!showAddPasskey && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs rounded-lg border-slate-200"
                    onClick={() => setShowAddPasskey(true)}
                  >
                    Add passkey
                  </Button>
                )}
              </div>
            </div>

            {passkeys.length > 0 && (
              <div className="ml-0 sm:ml-11 divide-y divide-slate-200/80 rounded-lg border border-slate-200/80 bg-slate-50/40">
                {passkeys.map((pk) => (
                  <div key={pk.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-slate-800 truncate">{pk.label}</span>
                      {pk.createdAt && (
                        <span className="text-slate-400 font-mono text-[11px] tabular-nums hidden sm:inline">
                          {new Date(pk.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-slate-400 hover:text-rose-600"
                      onClick={() => handleRemovePasskey(pk.id)}
                      disabled={busy === `pk-${pk.id}`}
                      title="Remove passkey"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {showAddPasskey && (
              <div className="ml-0 sm:ml-11 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 flex flex-wrap items-center gap-2">
                <Input
                  value={passkeyLabel}
                  onChange={(e) => setPasskeyLabel(e.target.value)}
                  placeholder="Device name (e.g. MacBook Pro)"
                  className="w-56 h-8 text-xs bg-white"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs rounded-lg"
                  onClick={async () => {
                    await handleRegisterPasskey()
                    setShowAddPasskey(false)
                  }}
                  disabled={busy === "passkey"}
                >
                  {busy === "passkey" ? "Waiting for device..." : "Register"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-slate-500"
                  onClick={() => setShowAddPasskey(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* 3. Secondary Recovery Email */}
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg border border-slate-200/80 bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Mail className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">Secondary recovery email</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          secondaryEmailVerified ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      />
                      {secondaryEmailVerified ? "Verified" : "Not verified"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {secondaryEmailVerified && secondaryEmail
                      ? `Backup 6-digit codes sent to ${secondaryEmail}`
                      : "Receive a backup 6-digit verification code by email"}
                  </p>
                </div>
              </div>

              <div className="shrink-0 pl-11 sm:pl-0">
                {!showEditEmail && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs rounded-lg border-slate-200"
                    onClick={() => setShowEditEmail(true)}
                  >
                    {secondaryEmailVerified ? "Change" : "Add email"}
                  </Button>
                )}
              </div>
            </div>

            {showEditEmail && (
              <div className="ml-0 sm:ml-11 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="email"
                    value={secondaryEmail}
                    onChange={(e) => setSecondaryEmail(e.target.value)}
                    placeholder="backup@domain.com"
                    className="w-60 h-8 text-xs bg-white"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-slate-200 bg-white"
                    onClick={handleSendSecondaryEmail}
                    disabled={busy === "email"}
                  >
                    Send code
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-slate-500"
                    onClick={() => {
                      setShowEditEmail(false)
                      setEmailOtpSent(false)
                      setEmailOtpCode("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>

                {emailOtpSent && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80">
                    <Input
                      value={emailOtpCode}
                      onChange={(e) => setEmailOtpCode(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      className="w-36 h-8 text-xs font-mono tabular-nums bg-white"
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs rounded-lg"
                      onClick={async () => {
                        await handleVerifySecondaryEmail()
                        setShowEditEmail(false)
                      }}
                      disabled={busy === "email"}
                    >
                      Verify email
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
