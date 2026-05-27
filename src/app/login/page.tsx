
"use client"

import Link from "next/link"
import { Globe, Lock, Mail, ChevronRight } from "lucide-react"
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

export default function LoginPage() {
  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault()
    toast({
      title: "Reset link sent",
      description: "Please check your email for instructions to reset your password.",
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
            <CardTitle className="text-xl font-headline font-bold">Welcome back</CardTitle>
            <CardDescription className="text-xs">Enter your administrative credentials to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Work Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input id="email" type="email" placeholder="admin@institution.edu.np" className="pl-10 h-11 border-slate-200 focus:ring-primary/10" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Security Password</Label>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="text-[11px] text-primary hover:underline font-bold uppercase tracking-tight">Forgot password?</button>
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
                        <Input id="reset-email" type="email" placeholder="admin@institution.edu.np" required />
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
                <Input id="password" type="password" placeholder="••••••••" className="pl-10 h-11 border-slate-200 focus:ring-primary/10" />
              </div>
            </div>
            <Button asChild className="w-full font-bold h-12 shadow-lg shadow-primary/20 text-sm group">
              <Link href="/account/home">
                Secure Login
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
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
              New institution? <Link href="/signup" className="text-primary font-bold hover:underline transition-colors">Register here</Link>
            </p>
          </CardFooter>
        </Card>
        
        <div className="text-center">
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">
            © 2024 EduSphere IT Solutions • Support Desk: 1660-01-45678
          </p>
        </div>
      </div>
    </div>
  )
}
