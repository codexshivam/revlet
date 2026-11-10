"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/firebase"
import Link from "next/link"

export default function RootPage() {
  const router = useRouter()
  const { user, loading } = useUser()

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace("/account/home")
      } else {
        router.replace("/login")
      }
    }
  }, [user, loading, router])

  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-white px-4 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="font-headline font-bold text-2xl tracking-tight text-slate-900">
          Revlet Console
        </h1>
        <p className="text-xs text-slate-600 leading-relaxed">
          Unified administrative cloud control plane for Cloudflare DNS, Custom Email Routing, and Google Workspace for Education.
        </p>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-primary">
          <Link href="/login" className="hover:underline">
            Sign In to Console
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/signup" className="hover:underline">
            Register Organization
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/support" className="hover:underline">
            Documentation & Support
          </Link>
          <span className="text-slate-300">•</span>
          <a
            href="https://revlet.me"
            className="text-slate-500 hover:text-slate-800 transition-colors"
          >
            Revlet Marketing Home
          </a>
        </div>

        <p className="text-[10px] text-slate-400 pt-6">
          Open Source (Apache-2.0) • Developed by Shivam Yadav
        </p>
      </div>
    </main>
  )
}
