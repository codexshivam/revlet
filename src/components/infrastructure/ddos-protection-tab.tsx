"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ShieldCheck,
  Check,
  Loader2,
  RefreshCw,
  Copy,
  CheckCheck,
  Code2,
  AlertTriangle,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import {
  getZoneSecurityLevel,
  setZoneSecurityLevel,
} from "@/app/actions/cloudflare-infrastructure"

interface DdosProtectionTabProps {
  zoneId?: string
  domain?: string
  orgId?: string
  getIdToken: () => Promise<string>
}

export function DdosProtectionTab({ zoneId, domain, orgId, getIdToken }: DdosProtectionTabProps) {
  const [loading, setLoading] = useState(false)
  const [securityLevel, setSecurityLevel] = useState<string>("medium")
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false)

  // Turnstile code snippets copy state
  const [activeSnippetTab, setActiveSnippetTab] = useState<"react" | "html" | "backend">("react")
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  const loadData = useCallback(async () => {
    if (!zoneId || !orgId) return
    setLoading(true)
    try {
      const token = await getIdToken()
      const secRes = await getZoneSecurityLevel(token, orgId, zoneId)
      if (secRes.success && secRes.data?.value) {
        setSecurityLevel(secRes.data.value)
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setLoading(false)
    }
  }, [zoneId, orgId, getIdToken])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleUpdateSecurityLevel = async (level: any) => {
    if (!zoneId || !orgId) return
    setIsUpdatingSecurity(true)
    try {
      const token = await getIdToken()
      const res = await setZoneSecurityLevel(token, orgId, zoneId, level)
      if (res.success) {
        setSecurityLevel(level)
        toast({
          title:
            level === "under_attack"
              ? "Emergency Shield Activated!"
              : "Security Level Updated",
          description:
            level === "under_attack"
              ? "All incoming visitors will now receive an interactive Cloudflare verification challenge."
              : `Edge DDoS defense set to ${level.toUpperCase().replace("_", " ")}.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: res.error || "Could not update security level.",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: err.message,
      })
    } finally {
      setIsUpdatingSecurity(false)
    }
  }

  const reactSnippet = `// Install: npm install @marsidev/react-turnstile
import { Turnstile } from '@marsidev/react-turnstile'

export function SignupForm() {
  const handleVerify = (token: string) => {
    // Send token with form submission to your backend API
    console.log("Turnstile Token:", token)
  }

  return (
    <form action="/api/signup" method="POST">
      <input name="email" type="email" placeholder="you@domain.com" required />
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
        onSuccess={handleVerify}
        options={{ theme: 'light', size: 'flexible' }}
      />
      <button type="submit">Sign Up</button>
    </form>
  )
}`

  const htmlSnippet = `<!-- Add Turnstile API script in your <head> or before </body> -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<!-- Add Turnstile widget container to your form -->
<form action="/login" method="POST">
  <input type="text" name="username" required />
  <input type="password" name="password" required />
  
  <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY" data-theme="light"></div>
  
  <button type="submit">Log In</button>
</form>`

  const backendSnippet = `// app/api/verify-turnstile/route.ts
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { turnstileToken } = await req.json()
  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY!

  const formData = new FormData()
  formData.append('secret', secretKey)
  formData.append('response', turnstileToken)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  })

  const outcome = await res.json()
  if (outcome.success) {
    return NextResponse.json({ verified: true })
  } else {
    return NextResponse.json({ verified: false, errors: outcome['error-codes'] }, { status: 400 })
  }
}`

  const copyCurrentSnippet = () => {
    const text =
      activeSnippetTab === "react"
        ? reactSnippet
        : activeSnippetTab === "html"
        ? htmlSnippet
        : backendSnippet
    navigator.clipboard.writeText(text)
    setCopiedSnippet(true)
    toast({ title: "Copied Code Snippet", description: "Ready to paste into your codebase." })
    setTimeout(() => setCopiedSnippet(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* 1. Emergency Under Attack Shield */}
      <Card
        className={`border shadow-sm rounded-xl overflow-hidden transition-all ${
          securityLevel === "under_attack"
            ? "bg-red-50/70 border-red-300 ring-2 ring-red-500/30"
            : "bg-white border-slate-200/80"
        }`}
      >
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              &quot;I&apos;m Under Attack!&quot; Emergency Shield
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Instantly deploys cryptographic JavaScript challenges to every incoming visitor across all edge points before traffic hits your server.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant={securityLevel === "under_attack" ? "destructive" : "outline"}
              onClick={() =>
                handleUpdateSecurityLevel(
                  securityLevel === "under_attack" ? "medium" : "under_attack"
                )
              }
              disabled={isUpdatingSecurity}
              className={`font-bold text-xs h-9 px-4 rounded-lg gap-2 ${
                securityLevel === "under_attack"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-900"
              }`}
            >
              {isUpdatingSecurity && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {securityLevel === "under_attack"
                  ? "Deactivate Emergency Shield"
                  : "Activate Emergency Shield"}
              </span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 text-xs text-slate-600 leading-relaxed">
          {securityLevel === "under_attack" ? (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-100/70 rounded-xl border border-red-300 text-red-900 font-medium">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-950">Active Layer 7 DDoS Mitigation Engaged</p>
                <p className="text-red-900/90 font-normal mt-0.5">
                  All traffic to {domain || "your domain"} is undergoing interactive edge verification. This suppresses flood attacks and scraper waves while keeping your origin online. Remember to deactivate this mode once the attack has passed so normal visitor latency is restored.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Use this panic button during sudden bot attacks, credential-stuffing surges, or Layer 7 HTTP floods. Deploys worldwide in under 5 seconds.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-black text-xs h-7 gap-1 ml-3 shrink-0 rounded-lg"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh Status</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Security Level Sensitivity */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              Standard Edge Security Level
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Adjust how aggressively Cloudflare reputation algorithms challenge suspicious IP addresses.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              {
                key: "essentially_off",
                label: "Essentially Off",
                desc: "Challenges only the most obvious malicious automated attackers.",
              },
              {
                key: "low",
                label: "Low",
                desc: "Challenges IP addresses with recent threatening behavior in Cloudflare's IP intelligence database.",
              },
              {
                key: "medium",
                label: "Medium (Recommended)",
                desc: "Standard balanced protection recommended for production SaaS and customer-facing websites.",
              },
              {
                key: "high",
                label: "High",
                desc: "Challenges any IP address displaying suspicious behavior within the past 14 days.",
              },
            ].map((lvl) => (
              <button
                key={lvl.key}
                onClick={() => handleUpdateSecurityLevel(lvl.key)}
                disabled={isUpdatingSecurity}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  securityLevel === lvl.key
                    ? "border-amber-600 bg-amber-50/60 shadow-xs ring-1 ring-amber-600"
                    : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900">{lvl.label}</span>
                  {securityLevel === lvl.key && <Check className="w-3.5 h-3.5 text-amber-600" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">{lvl.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 3. Global DDoS Defense Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-5">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900">Layer 3 &amp; 4 DDoS Shield</p>
            <p className="text-[11px] text-slate-500 leading-normal">
              Always active. SYN floods, UDP amplification, and NTP reflection attacks are dropped at edge boundary.
            </p>
          </div>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-5">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900">Anycast 330+ Cities</p>
            <p className="text-[11px] text-slate-500 leading-normal">
              Distributed capacity absorbs 280+ Tbps of peak attack volume without degrading legitimate user traffic.
            </p>
          </div>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl p-5">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900">WAF Managed Rules</p>
            <p className="text-[11px] text-slate-500 leading-normal">
              Automated heuristics block SQL injection, cross-site scripting (XSS), and zero-day vulnerabilities.
            </p>
          </div>
        </Card>
      </div>

      {/* 4. Turnstile Bot Defense In-Panel Integration */}
      <Card className="bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900">
              Turnstile Smart Bot Defense
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Replace annoying puzzle CAPTCHAs with invisible, privacy-first bot mitigation directly on your forms.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copyCurrentSnippet}
            className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-black text-xs h-8 gap-1.5 rounded-lg shrink-0"
          >
            {copiedSnippet ? (
              <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedSnippet ? "Copied" : "Copy Integration Code"}</span>
          </Button>
        </CardHeader>

        <CardContent className="p-5 sm:p-6 space-y-4">
          {/* Subtabs for Snippets */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            {[
              { id: "react", label: "Next.js / React (Client)" },
              { id: "html", label: "Vanilla HTML / Script" },
              { id: "backend", label: "Next.js API Route (Server Verify)" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSnippetTab(tab.id as any)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  activeSnippetTab === tab.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-black"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative rounded-xl overflow-hidden bg-slate-950 p-4 font-mono text-xs text-slate-200 border border-slate-800">
            <pre className="overflow-x-auto whitespace-pre leading-relaxed text-[11px]">
              {activeSnippetTab === "react" && reactSnippet}
              {activeSnippetTab === "html" && htmlSnippet}
              {activeSnippetTab === "backend" && backendSnippet}
            </pre>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Free &amp; Unlimited Verification:</span>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Turnstile never charges for verification volume and has zero user puzzle frustration, keeping your signup conversion rate high.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
