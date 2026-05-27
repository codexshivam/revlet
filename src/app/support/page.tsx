
"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Mail, Phone, MessageSquare, Send } from "lucide-react"

export default function SupportPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-headline font-bold text-slate-900">Platform Contact Center</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-headline font-bold">Contact Channels</CardTitle>
                <CardDescription className="text-xs">Direct lines to our support desk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Support Email</p>
                    <p className="text-sm font-bold text-slate-900">support@edusphere.np</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Dedicated Hotline</p>
                    <p className="text-sm font-bold text-slate-900">+977 1 4567890</p>
                  </div>
                </div>

                <div className="p-4 bg-primary rounded-lg text-white shadow-lg shadow-primary/20">
                  <h4 className="font-bold text-sm mb-1">Standard Support Hours</h4>
                  <p className="text-[10px] opacity-80 leading-relaxed">
                    Sunday – Friday, 9:00 AM – 6:00 PM NPT. Emergency responses for infrastructure outages are handled 24/7.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-2 bg-white border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center gap-2 text-primary">
                <MessageSquare className="w-5 h-5" />
                <CardTitle className="text-lg font-headline font-bold">Open a Support Ticket</CardTitle>
              </div>
              <CardDescription className="text-xs">Describe your issue in detail and our team will get back to you within 4 business hours.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="text-xs font-bold text-slate-700 uppercase">Ticket Subject</Label>
                  <Input id="subject" placeholder="e.g. DNS Propagation Issue" className="border-slate-200" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category" className="text-xs font-bold text-slate-700 uppercase">Category</Label>
                  <Input id="category" placeholder="Technical Support" className="border-slate-200" />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="message" className="text-xs font-bold text-slate-700 uppercase">Detailed Description</Label>
                <Textarea id="message" placeholder="Please provide specific details, including domain names and steps to reproduce any errors..." className="min-h-[150px] border-slate-200" />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-medium">
                  By submitting, you agree to our Service Level Agreement (SLA).
                </p>
                <Button className="font-bold h-11 px-8 gap-2 shadow-lg shadow-primary/20">
                  <Send className="w-4 h-4" />
                  Submit Ticket
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  )
}
