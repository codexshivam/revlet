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
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white">
      <div className="font-headline font-semibold text-xl tracking-tight text-slate-900 select-none">
        Revlet
      </div>

      <noscript>
        <div className="pt-4 text-center">
          <Link
            href="/login"
            className="text-xs text-slate-500 hover:text-slate-900 underline"
          >
            Go to Console Sign In
          </Link>
        </div>
      </noscript>
    </div>
  )
}
