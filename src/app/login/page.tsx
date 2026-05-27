
"use client"

import Link from "next/link"
import { Globe, Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-[400px] border-slate-200 shadow-xl">
        <CardHeader className="space-y-4 flex flex-col items-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Globe className="text-white w-7 h-7" />
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl font-headline font-bold">EduSphere Portal</CardTitle>
            <CardDescription>Enter credentials to manage institutional infrastructure</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Administrative Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input id="email" type="email" placeholder="admin@institution.edu.np" className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Security Password</Label>
              <Link href="#" className="text-xs text-primary hover:underline font-medium">Forgot password?</Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input id="password" type="password" placeholder="••••••••" className="pl-10" />
            </div>
          </div>
          <Button asChild className="w-full font-bold h-11 shadow-lg shadow-primary/10">
            <Link href="/account/home">Secure Login</Link>
          </Button>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 font-bold tracking-widest">New Institution?</span>
            </div>
          </div>
          <Button variant="outline" asChild className="w-full font-bold border-slate-200">
            <Link href="/signup">Register Your School/College</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
