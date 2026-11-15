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
      <img
        src="/logo-4k.png"
        alt="Revlet"
        className="h-14 w-auto object-contain select-none"
      />
    </main>
  )
}
