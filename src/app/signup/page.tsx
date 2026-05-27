
"use client"

import Link from "next/link"
import { Globe, User, Mail, Lock, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"

export default function SignupPage() {
  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault()
    toast({
      title: "Account created",
      description: "Welcome to EduSphere! Please verify your email to continue.",
    })
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-xl shadow-primary/20 mb-2">
            <Globe className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-headline font-bold text-slate-900 tracking-tight">EduSphere Portal</h1>
          <p className="text-slate-500 text-sm font-medium">Enterprise Infrastructure Management</p>
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
            <CardDescription className="text-xs">Join our network of managed educational institutions</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Full Profile Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input id="name" placeholder="Sagar Poudel" required className="pl-10 h-11 border-slate-200 focus:ring-primary/10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Work Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input id="email" type="email" placeholder="admin@institution.edu.np" required className="pl-10 h-11 border-slate-200 focus:ring-primary/10" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input id="password" type="password" placeholder="••••••••" required className="pl-10 h-11 border-slate-200 focus:ring-primary/10" />
                </div>
              </div>
              <Button type="submit" className="w-full font-bold h-12 shadow-lg shadow-primary/20 text-sm mt-4">
                Create Platform Account
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
      </div>
    </div>
  )
}
