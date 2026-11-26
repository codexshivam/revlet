import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifyAnyStepUpToken } from "@/lib/mfa"

export default async function RootPage() {
  const cookieStore = await cookies()
  const verified = verifyAnyStepUpToken(cookieStore.get("revlet_mfa_session")?.value)

  if (!verified) {
    redirect("/login")
  }

  redirect("/account/home")
}
