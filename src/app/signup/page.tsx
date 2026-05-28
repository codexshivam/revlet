
"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { User, Mail, Lock, ChevronLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { useState } from "react"
import { useAuth } from "@/firebase"
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth"

export default function SignupPage() {
  const router = useRouter()
  const auth = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  })

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
        description: "Please fill in all the details.",
      })
      return
    }

    setIsLoading(true)
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password)
      await updateProfile(userCredential.user, {
        displayName: formData.name
      })
      toast({
        title: "Account created",
        description: "Welcome to Revlet! Your profile is ready.",
      })
      router.push("/account/home")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: getFriendlyErrorMessage(error.code),
      })
    } finally {
      setIsLoading(false)
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
            <div className="flex items-center gap-1 text-[11px] font-bold text-primary uppercase tracking-wider mb-1">
              <Link href="/login" className="flex items-center hover:underline">
                <ChevronLeft className="w-3 h-3 mr-0.5" />
                Back to Login
              </Link>
            </div>
            <CardTitle className="text-xl font-headline font-bold">Create Account</CardTitle>
            <CardDescription className="text-xs">Join our network of managed organizations</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Full Profile Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input 
                    id="name" 
                    placeholder="Sagar Poudel" 
                    required 
                    className="pl-10 h-11 border-slate-200 focus:ring-primary/10"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Work Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="admin@yourcompany.com" 
                    required 
                    className="pl-10 h-11 border-slate-200 focus:ring-primary/10"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••" 
                    required 
                    className="pl-10 h-11 border-slate-200 focus:ring-primary/10"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full font-bold h-12 shadow-lg shadow-primary/20 text-sm mt-4" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Create Platform Account"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-6 pt-2 pb-8">
            <p className="text-[10px] text-slate-400 text-center font-medium leading-relaxed px-4">
              By clicking "Create Platform Account", you agree to our <button className="underline font-bold hover:text-slate-600">Terms of Service</button> and <button className="underline font-bold hover:text-slate-600">Privacy Policy</button>.
            </p>
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100" />
              </div>
            </div>
            <p className="text-sm text-slate-500 text-center font-medium">
              Already have an account? <Link href="/login" className="text-primary font-bold hover:underline transition-colors">Sign in</Link>
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
}
