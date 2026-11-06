"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"
import { useAuth, useUser } from "@/firebase"
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth"
import { AuthFrame } from "@/components/layout/auth-frame"

export default function SignupPage() {
  const router = useRouter()
  const auth = useAuth()
  const { user, loading: authLoading } = useUser()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  })

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/account/home")
    }
  }, [user, authLoading, router])

  if (authLoading || user) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:16px_16px] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="font-bold text-xs uppercase tracking-wider text-slate-800 font-headline">
            REVLET
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            <span>Securing session...</span>
          </div>
        </div>
      </div>
    )
  }

  const getFriendlyErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case "auth/email-already-in-use":
        return "This email address is already registered. Try logging in instead."
      case "auth/invalid-email":
        return "The email address provided is not valid."
      case "auth/weak-password":
        return "Your password must be at least 6 characters long."
      case "auth/operation-not-allowed":
        return "Email and password accounts are not enabled. Please contact support."
      default:
        return "An unexpected error occurred. Please try again later."
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email || !formData.password) {
      toast({
        variant: "destructive",
        title: "Required fields missing",
        description: (
          <span className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>Please fill in all the details.</span>
          </span>
        ),
      })
      return
    }

    setIsLoading(true)
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password)
      await updateProfile(userCredential.user, {
        displayName: formData.name
      })

      // Reactive Sync: Initialize /users/{userId} document and sync pending organization relationships
      try {
        const { getFirestore } = await import("firebase/firestore")
        const db = getFirestore(auth.app, "itmanager")
        const { syncUserOrganizations } = await import("@/firebase")
        await syncUserOrganizations(
          db, 
          userCredential.user.uid, 
          userCredential.user.email || "", 
          formData.name
        )
      } catch (e) {
        console.error("Error executing user sync at signup:", e)
      }

      toast({
        title: "Account created",
        description: (
          <span className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Welcome to Revlet! Your profile is ready.</span>
          </span>
        ),
      })
      router.push("/account/home")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: (
          <span className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{getFriendlyErrorMessage(error.code)}</span>
          </span>
        ),
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthFrame>
      <div className="w-full max-w-[420px] mx-auto space-y-6 animate-in fade-in duration-300">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-headline font-bold text-[#191c1e] tracking-tight">
            Create Account
          </h1>
          <p className="text-xs sm:text-sm text-[#45464d] font-normal leading-normal max-w-[320px] mx-auto">
            Join our network of managed institutions.
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {/* FULL PROFILE NAME */}
          <div className="space-y-1.5">
            <Label 
              htmlFor="name" 
              className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block"
            >
              Full Profile Name
            </Label>
            <Input 
              id="name" 
              placeholder="Alex Morgan" 
              required
              className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal px-3 placeholder-slate-400"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* WORK EMAIL */}
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
              placeholder="hello@world.com" 
              required
              className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal px-3 placeholder-slate-400"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          {/* NEW SECURE PASSWORD */}
          <div className="space-y-1.5">
            <Label 
              htmlFor="password" 
              className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block"
            >
              New Secure Password
            </Label>
            
            <div className="relative">
              <Input 
                id="password" 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••••" 
                required
                className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs sm:text-sm font-normal pl-3 pr-10 placeholder-slate-300"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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

          {/* SUBMIT BUTTON */}
          <Button 
            type="submit" 
            className="w-full font-semibold h-11 bg-primary hover:bg-primary/95 text-white text-xs gap-2 rounded-lg mt-6 transition-all shadow-[0px_4px_12px_rgba(37,99,235,0.1)] flex items-center justify-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                Create Account
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>

        {/* LEGAL TERMS INFO */}
        <p className="text-[10px] text-[#45464d] text-center font-normal leading-normal px-2 tracking-wide pt-1">
          By clicking &quot;Create Account&quot;, you agree to our{" "}
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

        {/* DIVIDER */}
        <div className="border-t border-[#eceef0] my-5 sm:my-6"></div>

        {/* LINK TO LOGIN */}
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
      </div>
    </AuthFrame>
  )
}
