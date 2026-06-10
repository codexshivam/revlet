"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"
import { useAuth, useUser } from "@/firebase"
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth"

export default function LoginPage() {
  const router = useRouter()
  const auth = useAuth()
  const { user, loading: authLoading } = useUser()
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [isResetOpen, setIsResetOpen] = useState(false)

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
      case "auth/invalid-email":
        return "The email address provided is not valid."
      case "auth/user-disabled":
        return "This account has been disabled by an administrator."
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password. Please try again."
      case "auth/too-many-requests":
        return "Too many failed login attempts. Please try again later or reset your password."
      case "auth/network-request-failed":
        return "A network error occurred. Please check your internet connection."
      default:
        return "An unexpected error occurred during authentication."
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast({
        variant: "destructive",
        title: "Missing credentials",
        description: (
          <span className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>Please enter both email and password.</span>
          </span>
        ),
      })
      return
    }

    setIsLoading(true)
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      
      // Reactive Sync: Keep user profile index up to date
      try {
        const { getFirestore } = await import("firebase/firestore")
        const db = getFirestore(auth.app, "itmanager")
        const { syncUserOrganizations } = await import("@/firebase")
        await syncUserOrganizations(
          db, 
          userCredential.user.uid, 
          userCredential.user.email || "", 
          userCredential.user.displayName || ""
        )
      } catch (e) {
        console.error("Error executing user sync at login:", e)
      }

      toast({
        title: "Login Successful",
        description: (
          <span className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Welcome back! Redirecting to your dashboard...</span>
          </span>
        ),
      })
      router.push("/account/home")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) {
      toast({
        variant: "destructive",
        title: "Email required",
        description: (
          <span className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>Please enter your work email to reset.</span>
          </span>
        ),
      })
      return
    }
    try {
      await sendPasswordResetEmail(auth, resetEmail)
      toast({
        title: "Reset link sent",
        description: (
          <span className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Please check your email for reset instructions.</span>
          </span>
        ),
      })
      setIsResetOpen(false)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: (
          <span className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>
              {error.code === "auth/user-not-found" 
                ? "No account found with this email address." 
                : getFriendlyErrorMessage(error.code)}
            </span>
          </span>
        ),
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-slate-100/50 to-blue-50/30 flex flex-col items-center justify-center p-4 sm:p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-[480px] space-y-6 sm:space-y-8">
        
        {/* LOGO */}
        <div className="text-center select-none">
          <h1 className="text-2xl sm:text-3xl font-headline font-bold tracking-[0.15em] text-[#191c1e] ml-[0.15em] uppercase">
            REVLET
          </h1>
        </div>

        {/* CARD CONTAINER */}
        <div className="bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl p-6 sm:p-10 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 via-primary to-primary/30" />
          
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-headline font-bold text-[#191c1e] tracking-tight">
              Welcome back
            </h2>
            <p className="text-xs text-[#45464d] font-normal leading-normal px-2">
              Enter your credentials to access the administrative dashboard.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* WORK EMAIL */}
            <div className="space-y-2">
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
                className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal px-3 placeholder-slate-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* SECURITY PASSWORD */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label 
                  htmlFor="password" 
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block"
                >
                  Security Password
                </Label>
                
                <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
                  <DialogTrigger asChild>
                    <button 
                      type="button" 
                      className="text-[10px] text-slate-500 hover:text-[#191c1e] transition-colors font-bold uppercase tracking-wider"
                    >
                      Forgot password?
                    </button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100vw-32px)] max-w-[380px] border border-slate-100 shadow-[0_12px_32px_rgba(0,0,0,0.04)] rounded-xl p-6 bg-white animate-in zoom-in duration-300">
                    <DialogHeader className="space-y-2 text-left">
                      <DialogTitle className="font-headline font-semibold text-lg text-[#191c1e]">
                        Reset your password
                      </DialogTitle>
                      <DialogDescription className="text-xs text-[#45464d] leading-relaxed font-normal">
                        Enter your work email and we will dispatch a secure reset link.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleForgotPassword} className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="reset-email" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Work Email
                        </Label>
                        <Input 
                          id="reset-email" 
                          type="email" 
                          placeholder="hello@world.com" 
                          required 
                          className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white text-xs font-normal rounded px-3"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                        />
                      </div>
                      <DialogFooter className="pt-2">
                        <Button 
                          type="submit" 
                          className="w-full font-semibold h-10 bg-primary hover:bg-primary/95 text-white rounded text-xs transition-all shadow-sm"
                        >
                          Send Reset Link
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* PASSWORD INPUT & EYE TOGGLE */}
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••••" 
                  className="h-10 border-[#c6c6cd] focus-visible:ring-primary/20 bg-white rounded text-xs font-normal pl-3 pr-10 placeholder-slate-300"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              className="w-full font-semibold h-11 bg-primary hover:bg-primary/95 text-white text-xs gap-2 rounded-lg mt-6 transition-all shadow-[0px_4px_12px_rgba(37,99,235,0.1)] flex items-center justify-center"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  Access Dashboard
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          {/* DIVIDER */}
          <div className="border-t border-[#eceef0] my-5 sm:my-6"></div>

          {/* LINK TO SIGNUP */}
          <div className="text-center">
            <p className="text-xs text-[#45464d] font-normal">
              New user?{" "}
              <Link 
                href="/signup" 
                className="text-[#191c1e] font-bold hover:underline transition-colors"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center select-none px-4 space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-normal">
            © 2026 REVLET PLATFORM • HELLO@REVLET.ME
          </div>
        </div>
      </div>
    </div>
  )
}
