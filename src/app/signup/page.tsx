"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"
import { useAuth, useUser, useFirestore, syncUserOrganizations } from "@/firebase"
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth"
import { collection, addDoc, doc, setDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore"
import { AuthFrame } from "@/components/layout/auth-frame"
import { TurnstileWidget } from "@/components/security/turnstile-widget"
import { checkAndClaimInvitations } from "@/app/actions/team"

export default function SignupPage() {
  const router = useRouter()
  const auth = useAuth()
  const db = useFirestore()
  const { user, loading: authLoading } = useUser()

  const [step, setStep] = useState<1 | 2>(1)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  // Step 1: User Account Form
  const [userFormData, setUserFormData] = useState({
    name: "",
    email: "",
    password: "",
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = sessionStorage.getItem("revlet_prefill_signup")
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && (parsed.email || parsed.password)) {
        setUserFormData((prev) => ({
          ...prev,
          email: typeof parsed.email === "string" ? parsed.email : prev.email,
          password: typeof parsed.password === "string" ? parsed.password : prev.password,
        }))
      }
      sessionStorage.removeItem("revlet_prefill_signup")
    } catch {
      // Ignore malformed prefill payload
    }
  }, [])

  // Stored state for created auth credentials across steps
  const [createdUserData, setCreatedUserData] = useState<{
    uid: string
    email: string
    displayName: string
  } | null>(null)

  // Step 2: Organization Form
  const [orgFormData, setOrgFormData] = useState({
    name: "",
    domain: "",
    phone: "",
    address: "",
  })

  // If user is already authenticated and visits /signup:
  useEffect(() => {
    if (!authLoading && user && step === 1 && !createdUserData) {
      const checkExistingOrgs = async () => {
        try {
          if (!db) return
          const q = query(
            collection(db, "organizations"),
            where("ownerId", "==", user.uid)
          )
          const snap = await getDocs(q)
          if (!snap.empty) {
            router.push("/account/home")
            return
          }

          // Check if the user has pending or active team invitations
          const idToken = await user.getIdToken()
          const inviteRes = await checkAndClaimInvitations(idToken)
          if (inviteRes.success && inviteRes.data?.hasInvitations) {
            router.push("/account/home")
            return
          }

          setCreatedUserData({
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "",
          })
          setStep(2)
        } catch {
          router.push("/account/home")
        }
      }
      checkExistingOrgs()
    }
  }, [user, authLoading, router, step, createdUserData, db])

  // Handle Step 1: Validate User Details and proceed to Step 2 (account is created after Step 2)
  const handleUserSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userFormData.name.trim() || !userFormData.email.trim() || !userFormData.password) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please complete all profile fields to continue.",
      })
      return
    }

    if (userFormData.password.length < 12) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 12 characters long.",
      })
      return
    }

    if (!turnstileToken) {
      toast({
        variant: "destructive",
        title: "Security check required",
        description: "Please complete the Cloudflare Turnstile verification to continue.",
      })
      return
    }

    setIsLoading(true)
    try {
      const verifyRes = await fetch("/api/auth/turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken, action: "signup" }),
      })
      const verifyData = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok || !verifyData.ok) {
        setTurnstileResetKey((k) => k + 1)
        toast({
          variant: "destructive",
          title: "Security verification failed",
          description: verifyData.error || "Please complete the security check again.",
        })
        return
      }

      const checkRes = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userFormData.email.trim() }),
      })
      if (checkRes.ok) {
        const checkData = await checkRes.json().catch(() => ({}))
        if (checkData.ok && checkData.exists === true) {
          toast({
            variant: "destructive",
            title: "Email already registered",
            description: "This email is already registered. Try signing in instead.",
          })
          return
        }
      }

      setStep(2)
    } catch {
      setStep(2)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Step 2: Create User Account + First Organization together, then send welcome email
  const handleOrgCreation = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!orgFormData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Organization name required",
        description: "Please enter your organization's name.",
      })
      return
    }

    const cleanName = orgFormData.name.trim()
    const rawDomain = orgFormData.domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")

    if (!rawDomain || !rawDomain.includes(".")) {
      toast({
        variant: "destructive",
        title: "Valid domain required",
        description: "Please enter your primary domain name (e.g. example.com).",
      })
      return
    }

    setIsLoading(true)
    try {
      if (!db) throw new Error("Database connection unavailable")

      let activeUser =
        createdUserData ||
        (user
          ? {
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || "",
            }
          : null)
      let idToken = ""

      if (!activeUser) {
        if (!userFormData.name.trim() || !userFormData.email.trim() || !userFormData.password) {
          toast({
            variant: "destructive",
            title: "Missing account details",
            description: "Please complete your account details first.",
          })
          setStep(1)
          return
        }

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          userFormData.email.trim(),
          userFormData.password
        )

        await updateProfile(userCredential.user, {
          displayName: userFormData.name.trim(),
        })

        const userEmail = userCredential.user.email || userFormData.email.trim()
        const displayName = userFormData.name.trim()

        const userRef = doc(db, "users", userCredential.user.uid)
        await setDoc(
          userRef,
          {
            uid: userCredential.user.uid,
            email: userEmail,
            displayName,
            numOrganizations: 0,
            organizations: [],
            createdAt: serverTimestamp(),
          },
          { merge: true }
        )

        activeUser = {
          uid: userCredential.user.uid,
          email: userEmail,
          displayName,
        }
        setCreatedUserData(activeUser)
        idToken = await userCredential.user.getIdToken()
        await checkAndClaimInvitations(idToken).catch(() => {})
      } else if (user) {
        idToken = await user.getIdToken()
      }

      const codePrefix = cleanName
        .substring(0, 3)
        .toUpperCase()
        .replace(/[^A-Z]/g, "REV")
      const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
      const orgCode = `${codePrefix}-${uniqueSuffix}`

      const orgsRef = collection(db, "organizations")
      const newOrgDoc = await addDoc(orgsRef, {
        name: cleanName,
        domain: rawDomain,
        address: orgFormData.address.trim(),
        phone: orgFormData.phone.trim(),
        currentEmail: activeUser.email,
        contactName: activeUser.displayName || cleanName,
        contactEmail: activeUser.email,
        contactPhone: orgFormData.phone.trim(),
        description: "",
        code: orgCode,
        ownerId: activeUser.uid,
        status: "Active",
        memberEmails: [activeUser.email.toLowerCase().trim()],
        createdAt: serverTimestamp(),
      })

      await syncUserOrganizations(
        db,
        activeUser.uid,
        activeUser.email,
        activeUser.displayName
      )

      if (idToken) {
        await Promise.allSettled([
          fetch("/api/auth/action-email", {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              type: "verify_email",
              email: activeUser.email,
            }),
          }),
          fetch("/api/auth/action-email", {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              type: "welcome",
              email: activeUser.email,
              displayName: activeUser.displayName || cleanName,
            }),
          }),
        ])
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("revlet_active_org_id", newOrgDoc.id)
      }

      toast({
        title: "Account & organization ready",
        description: `Welcome to Revlet. ${cleanName} is ready for management.`,
      })

      router.push("/account/home")
    } catch (error: any) {
      let friendlyError = "We could not complete registration. Please check your details and try again."
      if (error?.code === "auth/email-already-in-use") {
        friendlyError = "This email is already registered. Try signing in instead."
        setStep(1)
      } else if (error?.code === "auth/invalid-email") {
        friendlyError = "Please enter a valid email address."
        setStep(1)
      } else if (error?.code === "auth/weak-password") {
        friendlyError = "Your password must be at least 6 characters long."
        setStep(1)
      }
      toast({
        variant: "destructive",
        title: "Setup failed",
        description: friendlyError,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthFrame>
      <div className="w-full max-w-[520px] bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm animate-in fade-in duration-300">
        {/* Step Indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-3">
          <span className="font-medium text-slate-900">
            {step === 1 ? "1. Your Account" : "2. Organization Setup"}
          </span>
          <span className="tabular-nums">Step {step} of 2</span>
        </div>

        {/* STEP 1: USER ACCOUNT REGISTRATION */}
        {step === 1 && (
          <>
            <div className="space-y-1 text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Create your Revlet Platform account
              </h1>
              <p className="text-xs text-slate-500">
                Register as an administrator to manage your organization.
              </p>
            </div>

            <form onSubmit={handleUserSignup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium text-slate-700">
                  Full Name
                </Label>
                <Input
                  id="name"
                  placeholder="Alex Morgan"
                  required
                  autoComplete="name"
                  className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                  value={userFormData.name}
                  onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-slate-700">
                  Work Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  required
                  autoComplete="email"
                  className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-slate-700">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    required
                    autoComplete="new-password"
                    className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg pr-10"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <TurnstileWidget
                action="signup"
                resetKey={turnstileResetKey}
                onToken={setTurnstileToken}
              />

              <Button
                type="submit"
                className="w-full h-10 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg mt-2 shadow-none flex items-center justify-center gap-2"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isLoading ? "Checking..." : "Continue to Organization Setup"}
              </Button>
            </form>

            <p className="text-xs text-slate-400 text-center leading-relaxed pt-1">
              By continuing, you agree to our{" "}
              <a
                href="https://revlet.me/terms/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-700 hover:underline"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="https://revlet.me/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-700 hover:underline"
              >
                Privacy Policy
              </a>
              .
            </p>

            <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-slate-900 font-medium hover:underline transition-colors"
              >
                Sign In
              </Link>
            </div>
          </>
        )}

        {/* STEP 2: FIRST ORGANIZATION SETUP */}
        {step === 2 && (
          <>
            <div className="space-y-1 text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Create Organization
              </h1>
              <p className="text-xs text-slate-500">
                Set up your primary organization to activate management tools and domain services.
              </p>
            </div>

            <form onSubmit={handleOrgCreation} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-name" className="text-xs font-medium text-slate-700">
                  Organization Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="org-name"
                  placeholder="Example Company"
                  required
                  className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                  value={orgFormData.name}
                  onChange={(e) => setOrgFormData({ ...orgFormData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="org-domain" className="text-xs font-medium text-slate-700">
                  Primary Domain <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="org-domain"
                  placeholder="example.com"
                  required
                  className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg font-mono"
                  value={orgFormData.domain}
                  onChange={(e) => setOrgFormData({ ...orgFormData, domain: e.target.value })}
                />
                <p className="text-[11px] text-amber-700 font-medium">
                  This domain name cannot be changed later after registration.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="org-phone" className="text-xs font-medium text-slate-700">
                    Phone (Optional)
                  </Label>
                  <Input
                    id="org-phone"
                    placeholder="+1 555 0100"
                    className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                    value={orgFormData.phone}
                    onChange={(e) => setOrgFormData({ ...orgFormData, phone: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="org-address" className="text-xs font-medium text-slate-700">
                    City / Address (Optional)
                  </Label>
                  <Input
                    id="org-address"
                    placeholder="San Francisco, CA"
                    className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                    value={orgFormData.address}
                    onChange={(e) => setOrgFormData({ ...orgFormData, address: e.target.value })}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-10 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg mt-2 shadow-none flex items-center justify-center gap-2"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isLoading ? "Creating Organization..." : "Complete Setup"}
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthFrame>
  )
}
