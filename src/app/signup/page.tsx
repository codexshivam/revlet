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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-[10px] text-slate-500 animate-pulse font-semibold uppercase tracking-widest">
            Securing session...
          </p>
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-[540px] space-y-6 sm:space-y-8">
        
        {/* LOGO */}
        <div className="text-center select-none">
          <h1 className="text-[20px] sm:text-[22px] font-headline font-bold tracking-[0.1em] text-[#191c1e] ml-[0.1em]">
            REVLET
          </h1>
        </div>

        {/* CARD CONTAINER */}
        <div className="bg-white border border-[#eceef0] shadow-[0px_4px_12px_rgba(15,23,42,0.03)] rounded-lg p-6 sm:p-10 space-y-5 sm:space-y-6">
          
          <div className="text-center space-y-2">
            <h2 className="text-[22px] sm:text-[24px] font-headline font-semibold text-[#191c1e] tracking-tight">
              Create Account
            </h2>
            <p className="text-xs text-[#45464d] font-normal leading-normal max-w-[320px] mx-auto px-2">
              Join our network of managed institutions.
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4 sm:space-y-5">
            {/* FULL PROFILE NAME */}
            <div className="space-y-2">
              <Label 
                htmlFor="name" 
                className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block"
              >
                Full Profile Name
              </Label>
              <Input 
                id="name" 
                placeholder="Sagar Poudel" 
                required
                className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3 placeholder-slate-400"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* WORK EMAIL */}
            <div className="space-y-2">
              <Label 
                htmlFor="email" 
                className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block"
              >
                Work Email
              </Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="hello@world.com" 
                required
                className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3 placeholder-slate-400"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            {/* NEW SECURE PASSWORD */}
            <div className="space-y-2">
              <Label 
                htmlFor="password" 
                className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block"
              >
                New Secure Password
              </Label>
              
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••••" 
                  required
                  className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal pl-3 pr-10 placeholder-slate-300"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
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
              className="w-full font-semibold h-10 bg-primary hover:bg-primary/95 text-white text-xs gap-2 rounded mt-6 transition-all shadow-[0px_4px_12px_rgba(37,99,235,0.15)] flex items-center justify-center"
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
            By clicking "Create Account", you agree to our{" "}
            <button className="underline font-semibold hover:text-[#191c1e] transition-colors">
              Terms of Service
            </button>{" "}
            and{" "}
            <button className="underline font-semibold hover:text-[#191c1e] transition-colors">
              Privacy Policy
            </button>
            .
          </p>

          {/* DIVIDER */}
          <div className="border-t border-[#eceef0] my-5 sm:my-6"></div>

          {/* LINK TO LOGIN */}
          <div className="text-center">
            <p className="text-xs text-[#45464d] font-normal">
              Already have an account?{" "}
              <Link 
                href="/login" 
                className="text-[#191c1e] font-semibold hover:underline transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] select-none px-4 leading-normal">
          © 2026 REVLET PLATFORM • HELLO@REVLET.ME
        </div>
      </div>
    </div>
  )
}
