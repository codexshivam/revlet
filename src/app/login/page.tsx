"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
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
import { AuthFrame } from "@/components/layout/auth-frame"

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
  const [isResetLoading, setIsResetLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/account/home")
    }
  }, [user, authLoading, router])

  if (user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="text-xs font-medium text-slate-400">
          Redirecting to console...
        </div>
      </div>
    )
  }

  const getFriendlyErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case "auth/invalid-email":
        return "The email address is not valid."
      case "auth/user-disabled":
        return "This account has been disabled by an administrator."
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password. Please try again."
      case "auth/too-many-requests":
        return "Too many failed attempts. Please try again later or reset your password."
      case "auth/network-request-failed":
        return "Network connection issue. Please check your internet connection."
      default:
        return "An unexpected error occurred during authentication."
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      toast({
        variant: "destructive",
        title: "Missing credentials",
        description: "Please enter both email and password.",
      })
      return
    }

    setIsLoading(true)
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password)

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
        title: "Signed in",
        description: "Redirecting to your dashboard...",
      })
      router.push("/account/home")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication failed",
        description: getFriendlyErrorMessage(error.code),
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Email required",
        description: "Please enter your work email to receive reset instructions.",
      })
      return
    }

    setIsResetLoading(true)
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim())
      toast({
        title: "Reset link sent",
        description: "Check your email for password reset instructions.",
      })
      setIsResetOpen(false)
      setResetEmail("")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description:
          error.code === "auth/user-not-found"
            ? "No account found with this email address."
            : getFriendlyErrorMessage(error.code),
      })
    } finally {
      setIsResetLoading(false)
    }
  }

  return (
    <AuthFrame>
      <div className="w-full max-w-[400px] bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm animate-in fade-in duration-300">
        <div className="space-y-1 text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
            Sign in to Revlet
          </h1>
          <p className="text-xs text-slate-500">
            Enter your credentials to access the management console.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-slate-700">
              Work email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@institution.edu"
              className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium text-slate-700">
                Password
              </Label>

              <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    Forgot password?
                  </button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100vw-32px)] max-w-[380px] border border-slate-200 rounded-xl p-6 bg-white">
                  <DialogHeader className="space-y-1.5 text-left">
                    <DialogTitle className="text-base font-semibold text-slate-900">
                      Reset your password
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      Enter your work email and we will send you a secure password reset link.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleForgotPassword} className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-email" className="text-xs font-medium text-slate-700">
                        Work email
                      </Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="admin@institution.edu"
                        required
                        className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                      />
                    </div>
                    <DialogFooter className="pt-2">
                      <Button
                        type="submit"
                        disabled={isResetLoading}
                        className="w-full h-9 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg shadow-none flex items-center justify-center gap-2"
                      >
                        {isResetLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {isResetLoading ? "Sending link..." : "Send reset link"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="h-10 text-sm border-slate-200 focus-visible:ring-primary/20 bg-white rounded-lg pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          <Button
            type="submit"
            className="w-full h-10 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg mt-2 shadow-none flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
          New to Revlet?{" "}
          <Link
            href="/signup"
            className="text-slate-900 font-medium hover:underline transition-colors"
          >
            Create an account
          </Link>
        </div>
      </div>
    </AuthFrame>
  )
}
