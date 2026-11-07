"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, Building2, Globe, Phone, MapPin } from "lucide-react"
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
    password: ""
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
    address: ""
  })

  // If user is already authenticated and visits /signup:
  useEffect(() => {
    if (!authLoading && user && step === 1 && !createdUserData) {
      // Check if user already has an organization
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
            // User exists but has no organization - guide them directly to Step 2
            setCreatedUserData({
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || ""
            })
            setStep(2)
          }
        } catch (e) {
          router.push("/account/home")
        }
      }
      checkExistingOrgs()
    }
  }, [user, authLoading, router, step, createdUserData, db])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="font-bold text-sm uppercase tracking-widest text-slate-900 font-headline animate-pulse">
          REVLET
        </div>
      </div>
    )
  }

  // Handle Step 1: Create User in Firebase Auth and Firestore
  const handleUserSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userFormData.name.trim() || !userFormData.email.trim() || !userFormData.password) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please complete all profile details to continue."
      })
      return
    }

    if (userFormData.password.length < 6) {
      toast({
        variant: "destructive",
        title: "Weak Password",
        description: "Password must be at least 6 characters long."
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
        displayName: userFormData.name.trim()
      })

      // Create user document in Firestore /users/{userId}
      if (db) {
        const userRef = doc(db, "users", userCredential.user.uid)
        await setDoc(userRef, {
          uid: userCredential.user.uid,
          email: userCredential.user.email || userFormData.email.trim(),
          displayName: userFormData.name.trim(),
          numOrganizations: 0,
          organizations: [],
          createdAt: serverTimestamp()
        }, { merge: true })
      }

      setCreatedUserData({
        uid: userCredential.user.uid,
        email: userCredential.user.email || userFormData.email.trim(),
        displayName: userFormData.name.trim()
      })

      toast({
        title: "Account Created",
        description: "Your user profile is ready. Now let's set up your primary organization."
      })

      // Move to Step 2
      setStep(2)
    } catch (error: any) {
      let friendlyError = "Unable to register your account. Please try again."
      if (error.code === "auth/email-already-in-use") {
        friendlyError = "This email address is already registered. Try signing in instead."
      } else if (error.code === "auth/invalid-email") {
        friendlyError = "Please enter a valid email address."
      } else if (error.code === "auth/weak-password") {
        friendlyError = "Your password must be at least 6 characters long."
      }

      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: friendlyError
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Step 2: Create First Organization in Firestore
  const handleOrgCreation = async (e: React.FormEvent) => {
    e.preventDefault()

    const activeUser = createdUserData || (user ? {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || ""
    } : null)

    if (!activeUser) {
      toast({
        variant: "destructive",
        title: "Session Expired",
        description: "Please sign in again to complete organization setup."
      })
      router.push("/login")
      return
    }

    if (!orgFormData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Organization Name Required",
        description: "Please enter your organization's legal or registered name."
      })
      return
    }

    setIsLoading(true)
    try {
      if (!db) throw new Error("Database connection unavailable")

      const cleanName = orgFormData.name.trim()
      const rawDomain = orgFormData.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      const codePrefix = cleanName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "REV")
      const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
      const orgCode = `${codePrefix}-${uniqueSuffix}`

      // Create organization in Firestore
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
        createdAt: serverTimestamp()
      })

      // Sync user organizations document
      await syncUserOrganizations(
        db, 
        activeUser.uid, 
        activeUser.email, 
        activeUser.displayName
      )

      // Set active organization in browser local storage
      if (typeof window !== "undefined") {
        localStorage.setItem("revlet_active_org_id", newOrgDoc.id)
      }

      toast({
        title: "Setup Complete",
        description: `Welcome to Revlet! ${cleanName} is ready for management.`
      })

      router.push("/account/home")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Setup Failed",
        description: "We could not register your organization. Please verify the information and try again."
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthFrame>
      <div className="w-full max-w-[460px] bg-white border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl p-6 sm:p-10 space-y-6 animate-in fade-in duration-300">
        
        {/* Step Indicator */}
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 border-b border-slate-100 pb-3">
          <span className="flex items-center gap-1.5 text-slate-800">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">
              {step}
            </span>
            {step === 1 ? "Step 1: Your Account" : "Step 2: Organization Setup"}
          </span>
          <span>Step {step} of 2</span>
        </div>

        {/* STEP 1: USER ACCOUNT REGISTRATION */}
        {step === 1 && (
          <>
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-headline font-bold text-[#191c1e] tracking-tight">
                Create Account
              </h1>
              <p className="text-xs sm:text-sm text-[#45464d] font-normal leading-normal max-w-[320px] mx-auto">
                Join our network of managed organizations.
              </p>
            </div>

            <form onSubmit={handleUserSignup} className="space-y-4">
              <div className="space-y-1.5">
                <Label 
                  htmlFor="name" 
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block"
                >
                  Full Name
                </Label>
                <Input 
                  id="name" 
                  placeholder="Alex Morgan" 
                  required
                  className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal px-3 placeholder-slate-400"
                  value={userFormData.name}
                  onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label 
                  htmlFor="email" 
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block"
                >
                  Work Email
                </Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="admin@organization.com" 
                  required
                  className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal px-3 placeholder-slate-400"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label 
                  htmlFor="password" 
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block"
                >
                  Password
                </Label>
                
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    placeholder="••••••••••" 
                    required
                    className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal pl-3 pr-10 placeholder-slate-300"
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
                className="w-full font-semibold h-11 bg-primary hover:bg-primary/95 text-white text-xs gap-2 rounded-lg mt-6 transition-all shadow-[0px_4px_12px_rgba(37,99,235,0.1)] flex items-center justify-center"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    Continue to Organization Setup
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            <p className="text-[10px] text-[#45464d] text-center font-normal leading-normal px-2 tracking-wide pt-1">
              By clicking &quot;Continue&quot;, you agree to our{" "}
              <a 
                href="https://revlet.me/terms/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline font-bold hover:text-[#191c1e] transition-colors"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a 
                href="https://revlet.me/privacy/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline font-bold hover:text-[#191c1e] transition-colors"
              >
                Privacy Policy
              </a>
              .
            </p>

            <div className="border-t border-[#eceef0] my-5 sm:my-6"></div>

            <div className="text-center">
              <p className="text-xs sm:text-sm text-[#45464d] font-normal">
                Already have an account?{" "}
                <Link 
                  href="/login" 
                  className="text-[#191c1e] font-bold hover:underline transition-colors"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </>
        )}

        {/* STEP 2: FIRST ORGANIZATION SETUP */}
        {step === 2 && (
          <>
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-headline font-bold text-[#191c1e] tracking-tight">
                Create Organization
              </h1>
              <p className="text-xs sm:text-sm text-[#45464d] font-normal leading-normal max-w-[340px] mx-auto">
                Set up your primary organization to activate management tools and domain services.
              </p>
            </div>

            <form onSubmit={handleOrgCreation} className="space-y-4">
              <div className="space-y-1.5">
                <Label 
                  htmlFor="org-name" 
                  className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block"
                >
                  Organization Name <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input 
                    id="org-name" 
                    placeholder="Acme Corporation or Apex Academy" 
                    required
                    className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal pl-9 pr-3 placeholder-slate-400"
                    value={orgFormData.name}
                    onChange={(e) => setOrgFormData({ ...orgFormData, name: e.target.value })}
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label 
                  htmlFor="org-domain" 
                  className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block"
                >
                  Primary Domain (Optional)
                </Label>
                <div className="relative">
                  <Input 
                    id="org-domain" 
                    placeholder="acme.com" 
                    className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal pl-9 pr-3 placeholder-slate-400"
                    value={orgFormData.domain}
                    onChange={(e) => setOrgFormData({ ...orgFormData, domain: e.target.value })}
                  />
                  <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label 
                    htmlFor="org-phone" 
                    className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block"
                  >
                    Phone (Optional)
                  </Label>
                  <div className="relative">
                    <Input 
                      id="org-phone" 
                      placeholder="+977 1 234567" 
                      className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal pl-9 pr-3 placeholder-slate-400"
                      value={orgFormData.phone}
                      onChange={(e) => setOrgFormData({ ...orgFormData, phone: e.target.value })}
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label 
                    htmlFor="org-address" 
                    className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block"
                  >
                    City / Address (Optional)
                  </Label>
                  <div className="relative">
                    <Input 
                      id="org-address" 
                      placeholder="Kathmandu" 
                      className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal pl-9 pr-3 placeholder-slate-400"
                      value={orgFormData.address}
                      onChange={(e) => setOrgFormData({ ...orgFormData, address: e.target.value })}
                    />
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full font-semibold h-11 bg-primary hover:bg-primary/95 text-white text-xs gap-2 rounded-lg mt-6 transition-all shadow-[0px_4px_12px_rgba(37,99,235,0.1)] flex items-center justify-center"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    Complete Signup & Enter Dashboard
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          </>
        )}

      </div>
    </AuthFrame>
  )
}
