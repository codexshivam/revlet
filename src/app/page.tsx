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
      <div className="flex flex-col items-center space-y-3">
        <div className="font-bold text-xs uppercase tracking-wider text-slate-800 font-headline">
          REVLET
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          <span>Securing session...</span>
        </div>
      </div>
    </div>
  )
}
