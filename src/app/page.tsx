import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAnyStepUpToken } from "@/lib/mfa"
import { adminDb } from "@/firebase/admin"

export default async function RootPage() {
  const cookieStore = await cookies()
  const verified = verifyAnyStepUpToken(cookieStore.get("revlet_mfa_session")?.value)

  if (!verified) {
    redirect("/login")
  }

  const lastOrgRaw = cookieStore.get("revlet_last_org")?.value?.trim()
  if (lastOrgRaw) {
    try {
      const lastOrgId = decodeURIComponent(lastOrgRaw)
      const orgSnap = await adminDb.collection("organizations").doc(lastOrgId).get()
      if (orgSnap.exists) {
        const data = orgSnap.data() || {}
        const isOwner = data.ownerId === verified.uid
        const isMember =
          (Array.isArray(data.memberIds) && data.memberIds.includes(verified.uid)) ||
          (Array.isArray(data.memberEmails) &&
            verified.email &&
            data.memberEmails.some((e: string) => e.toLowerCase() === verified.email.toLowerCase()))
        if (isOwner || isMember) {
          redirect(`/orgs/${encodeURIComponent(lastOrgId)}/overview`)
        }
      }
    } catch (err: any) {
      // Re-throw Next.js redirect sentinel
      if (err?.digest && String(err.digest).startsWith("NEXT_REDIRECT")) {
        throw err
      }
    }
  }

  redirect("/account/home")
}
