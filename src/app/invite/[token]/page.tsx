"use client"

import { useActiveOrg } from "@/hooks/use-active-org"
import { useEffect, useState, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth"
import { doc, serverTimestamp, setDoc } from "firebase/firestore"
import { CheckCircle2, Loader2, Mail, ShieldCheck, AlertTriangle, LogOut, ArrowRight } from "lucide-react"
import { AuthFrame } from "@/components/layout/auth-frame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth, useFirestore, useUser } from "@/firebase"
import { toast } from "@/hooks/use-toast"
import { acceptInvitationByToken, getInvitationByToken } from "@/app/actions/team"

const StepUpMfaDialog = dynamic(
  () => import("@/components/security/step-up-mfa-dialog").then((m) => m.StepUpMfaDialog),
  { ssr: false }
)

type InviteOffer =
  | { state: "loading" }
  | { state: "not_found" | "expired" | "revoked" }
  | { state: "accepted"; orgId?: string; primaryPerms?: string[]; email?: string }
  | {
      state: "valid"
      inviteId: string
      email: string
      inviterName: string
      inviterEmail: string
      isPrivileged: boolean
      orgs: Array<{ id: string; name: string; domain: string; permissions: string[] }>
    }

export default function JoinWorkspaceInvitePage() {
  const params = useParams<{ token: string }>()
  const rawToken = typeof params?.token === "string" ? decodeURIComponent(params.token) : ""
  const router = useRouter()
  const { setActiveOrgId } = useActiveOrg()
  const auth = useAuth()
  const db = useFirestore()
  const { user, loading: userLoading } = useUser()

  const [offer, setOffer] = useState<InviteOffer>({ state: "loading" })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [autoClaiming, setAutoClaiming] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)
  const [stepUpOpen, setStepUpOpen] = useState(false)
  const autoClaimedRef = useRef(false)

  const loadOffer = useCallback(async () => {
    setLoadError(null)
    setOffer({ state: "loading" })
    const res = await getInvitationByToken(rawToken)
    if (!res.success || !res.data) {
      setLoadError(res.error || "Could not load this invitation.")
      return
    }
    setOffer(res.data as InviteOffer)
  }, [rawToken])

  useEffect(() => {
    if (rawToken) void loadOffer()
  }, [rawToken, loadOffer])

  const routeToAcceptedWorkspace = useCallback(
    (orgId: string, perms: string[]) => {
      setActiveOrgId(orgId)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("revlet-orgs-refresh"))
      }
      const onlyDns = perms.length > 0 && perms.every((p) => p.startsWith("DNS:"))
      const onlyEmail = perms.length > 0 && perms.every((p) => p.startsWith("Email:"))
      if (onlyDns) {
        router.replace("/services/dns")
      } else if (onlyEmail) {
        router.replace("/services/email")
      } else {
        router.replace("/account/home")
      }
    },
    [router, setActiveOrgId]
  )

  const handleAccept = useCallback(
    async (stepUpToken?: string) => {
      if (!user || offer.state !== "valid") return
      setBusy(true)
      try {
        await user.reload()
        const idToken = await user.getIdToken(true)
        const res = await acceptInvitationByToken(idToken, rawToken, stepUpToken)
        if (!res.success) {
          if (typeof res.error === "string" && res.error.includes("MFA_STEP_UP_REQUIRED")) {
            setStepUpOpen(true)
            return
          }
          throw new Error(res.error || "Could not accept invitation.")
        }
        if (!res.data) throw new Error("Could not accept invitation.")
        toast({
          title: "Joined workspace",
          description: `Opening ${offer.orgs.map((o) => o.name).join(", ")}.`,
        })
        routeToAcceptedWorkspace(res.data.primaryOrgId, res.data.primaryPerms || [])
      } catch (err: any) {
        setAutoClaiming(false)
        toast({
          variant: "destructive",
          title: "Acceptance failed",
          description: err?.message || "Could not accept invitation.",
        })
      } finally {
        setBusy(false)
      }
    },
    [user, offer, rawToken, routeToAcceptedWorkspace]
  )

  // Scoped auto-claim:
  // 1) Routine (non-privileged) valid invite + matching verified user => auto-claim this exact token immediately.
  // 2) Already-accepted invite + matching signed-in user => reopen the workspace immediately.
  useEffect(() => {
    if (userLoading || !user || autoClaimedRef.current) return
    const userEmail = (user.email || "").toLowerCase().trim()

    if (offer.state === "accepted" && offer.orgId && (!offer.email || offer.email === userEmail)) {
      autoClaimedRef.current = true
      routeToAcceptedWorkspace(offer.orgId, offer.primaryPerms || [])
      return
    }

    if (
      offer.state === "valid" &&
      !offer.isPrivileged &&
      user.emailVerified &&
      userEmail === offer.email
    ) {
      autoClaimedRef.current = true
      setAutoClaiming(true)
      void handleAccept()
    }
  }, [user, userLoading, offer, handleAccept, routeToAcceptedWorkspace])

  const handleCreateAccountForInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (offer.state !== "valid") return
    if (!fullName.trim()) {
      toast({ variant: "destructive", title: "Name required", description: "Please enter your full name." })
      return
    }
    if (password.length < 12) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 12 characters long.",
      })
      return
    }
    setBusy(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, offer.email, password)
      await updateProfile(cred.user, { displayName: fullName.trim() })
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          email: offer.email,
          displayName: fullName.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      const idToken = await cred.user.getIdToken(true)
      await fetch("/api/auth/action-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ type: "verify_email", email: offer.email }),
      })
      setVerificationSent(true)
      toast({
        title: "Account created — verify your email",
        description: `We sent a verification link to ${offer.email}. Verify it, then click Check again to join automatically.`,
      })
    } catch (err: any) {
      const msg =
        err?.code === "auth/email-already-in-use"
          ? "An account already exists for this email. Sign in to accept the invitation."
          : err?.message || "Could not create account."
      toast({ variant: "destructive", title: "Sign up failed", description: msg })
    } finally {
      setBusy(false)
    }
  }

  const handleResendVerification = async () => {
    if (!user) return
    setBusy(true)
    try {
      const idToken = await user.getIdToken(true)
      await fetch("/api/auth/action-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ type: "verify_email", email: user.email }),
      })
      setVerificationSent(true)
      toast({ title: "Verification email sent", description: `Check ${user.email} for the confirmation link.` })
    } catch {
      toast({ variant: "destructive", title: "Could not send email", description: "Please try again." })
    } finally {
      setBusy(false)
    }
  }

  const handleReloadAndCheckVerification = async () => {
    if (!user) return
    setBusy(true)
    try {
      await user.reload()
      await user.getIdToken(true)
      if (auth.currentUser?.emailVerified) {
        if (offer.state === "valid" && !offer.isPrivileged) {
          setAutoClaiming(true)
          await handleAccept()
        }
      } else {
        toast({
          title: "Not verified yet",
          description: "Please click the verification link in your email inbox, then check again.",
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleSwitchAccount = async () => {
    setBusy(true)
    try {
      await fetch("/api/auth/mfa", { method: "DELETE" }).catch(() => {})
      await signOut(auth)
      router.replace(`/login?next=${encodeURIComponent(`/invite/${rawToken}`)}`)
    } finally {
      setBusy(false)
    }
  }

  const primaryOrgName = offer.state === "valid" ? offer.orgs[0]?.name || "Revlet Workspace" : "Revlet"

  return (
    <AuthFrame>
      <div className="space-y-5">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-headline font-semibold text-slate-900 tracking-tight">
            {offer.state === "valid" ? `Join ${primaryOrgName}` : "Workspace Invitation"}
          </h1>
          <p className="text-xs text-slate-500">
            {offer.state === "valid"
              ? `${offer.inviterName} invited ${offer.email} to collaborate on Revlet.`
              : "Review your Revlet workspace invitation."}
          </p>
        </div>

        {loadError ? (
          <div className="space-y-4 text-center py-4">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <p className="text-sm text-slate-700">{loadError}</p>
            <Button onClick={() => void loadOffer()} variant="outline" className="h-9 text-xs">
              Retry
            </Button>
          </div>
        ) : offer.state === "loading" || userLoading || autoClaiming ? (
          <div className="py-10 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{autoClaiming ? `Joining ${primaryOrgName}...` : "Loading invitation..."}</span>
          </div>
        ) : offer.state === "not_found" || offer.state === "expired" || offer.state === "revoked" ? (
          <div className="space-y-4 text-center py-4">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                {offer.state === "expired"
                  ? "Invitation expired"
                  : offer.state === "revoked"
                  ? "Invitation revoked"
                  : "Invitation unavailable"}
              </p>
              <p className="text-xs text-slate-500">
                {offer.state === "expired"
                  ? "Ask your workspace administrator to resend a fresh invitation link."
                  : "This invitation is no longer active. Contact your workspace administrator."}
              </p>
            </div>
            <Button asChild variant="outline" className="h-9 text-xs">
              <Link href="/login">Go to Sign In</Link>
            </Button>
          </div>
        ) : offer.state === "accepted" ? (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">Invitation already accepted</p>
              <p className="text-xs text-slate-500">Sign in to open your workspace.</p>
            </div>
            <Button asChild className="h-9 text-xs bg-primary text-white">
              <Link href="/account/home">Open Workspace</Link>
            </Button>
          </div>
        ) : offer.state === "valid" ? (
          <div className="space-y-5">
            {/* Offered Grants Summary */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2.5 text-xs">
              <p className="font-semibold text-slate-800">Offered workspace access</p>
              {offer.orgs.map((o) => (
                <div key={o.id} className="rounded-lg bg-white border border-slate-200 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{o.name}</span>
                    {o.domain && <span className="font-mono text-[11px] text-slate-500">{o.domain}</span>}
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Permissions: {o.permissions.join(", ") || "Member"}
                  </p>
                </div>
              ))}
            </div>

            {!user ? (
              <div className="space-y-4">
                <form onSubmit={handleCreateAccountForInvite} className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-700">Invited Email</Label>
                    <Input value={offer.email} disabled className="h-9 text-xs bg-slate-100 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="invite-name" className="text-xs text-slate-700">Full Name</Label>
                    <Input
                      id="invite-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Maya Patel"
                      autoComplete="name"
                      className="h-9 text-base sm:text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="invite-pass" className="text-xs text-slate-700">Create Password</Label>
                    <Input
                      id="invite-pass"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 12 characters"
                      autoComplete="new-password"
                      className="h-9 text-base sm:text-xs"
                    />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full h-9 text-xs bg-primary text-white">
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    Create Account to Join {primaryOrgName}
                  </Button>
                </form>

                <div className="text-center pt-1">
                  <Link
                    href={`/login?next=${encodeURIComponent(`/invite/${rawToken}`)}`}
                    className="text-xs font-medium text-slate-700 hover:text-slate-950 underline"
                  >
                    Already have a Revlet account? Sign in to accept
                  </Link>
                </div>
              </div>
            ) : (user.email || "").toLowerCase().trim() !== offer.email ? (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs">
                <p className="text-amber-950">
                  You are signed in as <span className="font-mono font-semibold">{user.email}</span>, but this invitation is for{" "}
                  <span className="font-mono font-semibold">{offer.email}</span>.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleSwitchAccount()}
                  className="w-full h-9 text-xs bg-white gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Switch Account
                </Button>
              </div>
            ) : !user.emailVerified ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                <div className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">Verify your email to join</p>
                    <p className="text-slate-600">
                      {verificationSent
                        ? `Check ${offer.email} and click the verification link, then click Check again below.`
                        : `Your account email (${offer.email}) must be verified before joining ${primaryOrgName}.`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleReloadAndCheckVerification()}
                    className="flex-1 h-9 text-xs bg-primary text-white"
                  >
                    I&apos;ve verified — Check again
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleResendVerification()}
                    className="h-9 text-xs"
                  >
                    Resend email
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {offer.isPrivileged && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    This invitation grants a privileged administrative role. Explicit confirmation (and 2-Step Verification if enrolled) is required.
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Signed in as verified {offer.email}</span>
                </div>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAccept()}
                  className="w-full h-10 text-xs bg-primary text-white gap-1.5"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Confirm &amp; Join {primaryOrgName}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <StepUpMfaDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionLabel="accept a privileged workspace invitation"
        onVerified={(token) => {
          void handleAccept(token)
        }}
      />
    </AuthFrame>
  )
}
