
"use client"

import Link from "next/link"
import { Globe, Building2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-[500px] border-slate-200 shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-headline font-bold">Register Institution</CardTitle>
          <CardDescription>Join the EduSphere network to centralize your IT infrastructure</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inst-name">Institution Name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input id="inst-name" placeholder="e.g. KV Mandir" className="pl-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-type">Institution Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school">School</SelectItem>
                  <SelectItem value="college">College</SelectItem>
                  <SelectItem value="university">University</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain">Primary domain managed</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input id="domain" placeholder="institution.edu.np" className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-name">Full Admin Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input id="admin-name" placeholder="Sagar Poudel" className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work Email</Label>
            <Input id="email" type="email" placeholder="admin@domain.edu.np" />
          </div>
          <Button asChild className="w-full font-bold h-11 shadow-lg shadow-primary/10">
            <Link href="/account/home">Create Platform Account</Link>
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-slate-100 pt-6">
          <p className="text-sm text-slate-500">
            Already registered? <Link href="/login" className="text-primary font-bold hover:underline">Sign in here</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
