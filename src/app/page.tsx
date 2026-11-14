"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@/firebase"

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
    <main className="min-h-screen w-full flex items-center justify-center bg-white">
      <div className="font-headline font-bold text-[30px] tracking-tight text-slate-950 select-none">
        Revlet
      </div>
    </main>
  )
}
