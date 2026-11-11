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

export default function SignupPage() {
  const router = useRouter()
  const auth = useAuth()
  const db = useFirestore()
  const { user, loading: authLoading } = useUser()

  const [step, setStep] = useState<1 | 2>(1)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Step 1: User Account Form
  const [userFormData, setUserFormData] = useState({
    name: "",
    email: "",
    password: "",
  })

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
          } else {
            setCreatedUserData({
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || "",
            })
            setStep(2)
          }
        } catch {
          router.push("/account/home")
        }
      }
      checkExistingOrgs()
    }
  }, [user, authLoading, router, step, createdUserData, db])

  // Handle Step 1: Create User in Firebase Auth and Firestore
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

    if (userFormData.password.length < 6) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
      })
      return
    }

    setIsLoading(true)
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        userFormData.email.trim(),
        userFormData.password
      )

      await updateProfile(userCredential.user, {
        displayName: userFormData.name.trim(),
      })

      if (db) {
        const userRef = doc(db, "users", userCredential.user.uid)
        await setDoc(
          userRef,
          {
            uid: userCredential.user.uid,
            email: userCredential.user.email || userFormData.email.trim(),
            displayName: userFormData.name.trim(),
            numOrganizations: 0,
            organizations: [],
            createdAt: serverTimestamp(),
          },
          { merge: true }
        )
      }

      setCreatedUserData({
        uid: userCredential.user.uid,
        email: userCredential.user.email || userFormData.email.trim(),
        displayName: userFormData.name.trim(),
      })

      toast({
        title: "Account created",
        description: "Now let's configure your primary organization.",
      })

      setStep(2)
    } catch (error: any) {
      let friendlyError = "Unable to register your account. Please try again."
      if (error.code === "auth/email-already-in-use") {
        friendlyError = "This email is already registered. Try signing in instead."
      } else if (error.code === "auth/invalid-email") {
        friendlyError = "Please enter a valid email address."
      } else if (error.code === "auth/weak-password") {
        friendlyError = "Your password must be at least 6 characters long."
      }

      toast({
        variant: "destructive",
        title: "Registration failed",
        description: friendlyError,
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Step 2: Create First Organization in Firestore
  const handleOrgCreation = async (e: React.FormEvent) => {
    e.preventDefault()

    const activeUser =
      createdUserData ||
      (user
        ? {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "",
          }
        : null)

    if (!activeUser) {
      toast({
        variant: "destructive",
        title: "Session expired",
        description: "Please sign in again to complete organization setup.",
      })
      router.push("/login")
      return
    }

    if (!orgFormData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Organization name required",
        description: "Please enter your organization's name.",
      })
      return
    }

    setIsLoading(true)
    try {
      if (!db) throw new Error("Database connection unavailable")

      const cleanName = orgFormData.name.trim()
      const rawDomain = orgFormData.domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
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
        isEducation: false,
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

      if (typeof window !== "undefined") {
        localStorage.setItem("revlet_active_org_id", newOrgDoc.id)
      }

      toast({
        title: "Organization ready",
        description: `Welcome to Revlet. ${cleanName} is ready for management.`,
      })

      router.push("/account/home")
    } catch {
      toast({
        variant: "destructive",
        title: "Setup failed",
        description: "We could not register your organization. Please check details and try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthFrame>
      <div className="w-full max-w-[400px] bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm animate-in fade-in duration-300">
        {/* Step Indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-3">
          <span className="font-medium text-slate-900">
            {step === 1 ? "1. Your account" : "2. Organization setup"}
          </span>
          <span className="tabular-nums">Step {step} of 2</span>
        </div>

        {/* STEP 1: USER ACCOUNT REGISTRATION */}
        {step === 1 && (
          <>
            <div className="space-y-1 text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Create an account
              </h1>
              <p className="text-xs text-slate-500">
                Register as an administrator to manage your infrastructure.
              </p>
            </div>

            <form onSubmit={handleUserSignup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium text-slate-700">
                  Full name
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
                  Work email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@institution.edu"
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

              <Button
                type="submit"
                className="w-full h-10 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg mt-2 shadow-none flex items-center justify-center gap-2"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isLoading ? "Creating account..." : "Continue to organization setup"}
              </Button>
            </form>

            <p className="text-xs text-slate-400 text-center leading-relaxed pt-1">
              By continuing, you agree to our{" "}
              <a
                href="https://revlet.me/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-700 hover:underline"
              >
                terms of service
              </a>{" "}
              and{" "}
              <a
                href="https://revlet.me/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-700 hover:underline"
              >
                privacy policy
              </a>
              .
            </p>

            <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-slate-900 font-medium hover:underline transition-colors"
              >
                Sign in
              </Link>
            </div>
          </>
        )}

        {/* STEP 2: FIRST ORGANIZATION SETUP */}
        {step === 2 && (
          <>
            <div className="space-y-1 text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Create organization
              </h1>
              <p className="text-xs text-slate-500">
                Set up your primary organization to activate management tools and domain services.
              </p>
            </div>

            <form onSubmit={handleOrgCreation} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-name" className="text-xs font-medium text-slate-700">
                  Organization name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="org-name"
                  placeholder="Acme Academy or Apex Labs"
                  required
                  className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                  value={orgFormData.name}
                  onChange={(e) => setOrgFormData({ ...orgFormData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="org-domain" className="text-xs font-medium text-slate-700">
                  Primary domain (optional)
                </Label>
                <Input
                  id="org-domain"
                  placeholder="institution.edu"
                  className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg font-mono"
                  value={orgFormData.domain}
                  onChange={(e) => setOrgFormData({ ...orgFormData, domain: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="org-phone" className="text-xs font-medium text-slate-700">
                    Phone (optional)
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
                    City / address (optional)
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
                {isLoading ? "Creating organization..." : "Complete setup"}
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthFrame>
  )
}
