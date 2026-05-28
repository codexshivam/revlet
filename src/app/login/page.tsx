"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Lock, Mail, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useState } from "react"
import { useAuth } from "@/firebase"
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth"

export default function LoginPage() {
  const router = useRouter()
  const auth = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [resetEmail, setResetEmail] = useState("")

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
        description: "Please enter both email and password.",
      })
      return
    }

    setIsLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      toast({
        title: "Login Successful",
        description: "Redirecting to your dashboard...",
      })
      router.push("/account/home")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: getFriendlyErrorMessage(error.code),
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) {
      toast({ variant: "destructive", title: "Email required" })
      return
    }
    try {
      await sendPasswordResetEmail(auth, resetEmail)
      toast({
        title: "Reset link sent",
        description: "Please check your email for instructions to reset your password.",
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.code === "auth/user-not-found" 
          ? "No account found with this email address." 
          : getFriendlyErrorMessage(error.code),
      })
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <h1 className="text-4xl font-body font-black tracking-[0.2em] text-slate-900 mb-1 ml-[0.2em]">REVLET</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest max-w-[280px]">Enterprise Tech Infrastructure Management</p>
        </div>

        <Card className="border-slate-200 shadow-2xl shadow-slate-200/50 bg-white">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-headline font-bold">Welcome back</CardTitle>
            <CardDescription className="text-xs">Enter your administrative credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Work Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="admin@yourcompany.com" 
                    className="pl-10 h-11 border-slate-200 focus:ring-primary/10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Security Password</Label>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <button type="button" className="text-[11px] text-primary hover:underline font-bold uppercase tracking-tight">Forgot password?</button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[400px]">
                      <DialogHeader>
                        <DialogTitle className="font-headline">Reset your password</DialogTitle>
                        <DialogDescription>
                          Enter your email address and we'll send you a link to reset your password.
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleForgotPassword} className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Work Email</Label>
                          <Input 
                            id="reset-email" 
                            type="email" 
                            placeholder="admin@yourcompany.com" 
                            required 
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                          />
                        </div>
                        <DialogFooter>
                          <Button type="submit" className="w-full font-bold">Send Reset Link</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••" 
                    className="pl-10 h-11 border-slate-200 focus:ring-primary/10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full font-bold h-12 shadow-lg shadow-primary/20 text-sm group" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Secure Login
                    <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-6 pt-2 pb-8">
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-[0.2em] text-slate-400">
                <span className="bg-white px-3">Authentication Required</span>
              </div>
            </div>
            <p className="text-sm text-slate-500 text-center font-medium">
              New organization? <Link href="/signup" className="text-primary font-bold hover:underline transition-colors">Register here</Link>
            </p>
          </CardFooter>
        </Card>
        
        <div className="text-center">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
            © 2026 Revlet Platform • hello@revlet.me
          </p>
        </div>
      </div>
    </div>
  )