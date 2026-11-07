"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/firebase"
import { Loader2 } from "lucide-react"

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
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <div className="font-bold text-sm uppercase tracking-widest text-slate-900 font-headline animate-pulse">
        REVLET
      </div>
    </div>
  )
}
