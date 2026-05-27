
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ShieldAlert, Lock, Mail } from "lucide-react"

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold text-slate-900">Security & Account Settings</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="bg-white border-slate-200 shadow-sm h-fit">
            <CardHeader>
              <div className="flex items-center gap-2 text-primary mb-1">
                <Mail className="w-5 h-5" />
                <CardTitle className="text-lg font-headline font-bold">Change Email Address</CardTitle>
              </div>
              <CardDescription className="text-xs">Update your primary administrative contact email.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-email" className="text-xs font-bold text-slate-500 uppercase">Current Email</Label>
                <Input id="current-email" defaultValue="admin@kvm.edu.np" disabled className="bg-slate-50 border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-email" className="text-xs font-bold text-slate-700 uppercase">New Email Address</Label>
                <Input id="new-email" placeholder="Enter new email..." className="border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verify-pass" className="text-xs font-bold text-slate-700 uppercase">Account Password Verification</Label>
                <Input id="verify-pass" type="password" placeholder="Confirm with password..." className="border-slate-200" />
              </div>
              <Button className="w-full font-bold h-11">Update Email</Button>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-sm h-fit">
            <CardHeader>
              <div className="flex items-center gap-2 text-primary mb-1">
                <Lock className="w-5 h-5" />
                <CardTitle className="text-lg font-headline font-bold">Update Security Password</CardTitle>
              </div>
              <CardDescription className="text-xs">Ensure your account uses a strong, unique password.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="old-pass" className="text-xs font-bold text-slate-700 uppercase">Current Password</Label>
                <Input id="old-pass" type="password" placeholder="••••••••" className="border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-pass" className="text-xs font-bold text-slate-700 uppercase">New Password</Label>
                <Input id="new-pass" type="password" placeholder="New password..." className="border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass" className="text-xs font-bold text-slate-700 uppercase">Confirm New Password</Label>
                <Input id="confirm-pass" type="password" placeholder="Repeat new password..." className="border-slate-200" />
              </div>
              <Button className="w-full font-bold h-11 bg-slate-900 hover:bg-black text-white">Update Password</Button>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-red-50 border-red-100 border-dashed">
          <CardContent className="p-6 flex items-center gap-4">
            <ShieldAlert className="w-6 h-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-red-900">Security Notice</h4>
              <p className="text-xs text-red-700/80">Updating critical credentials will invalidate active sessions on other devices. You will be required to re-authenticate.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}
