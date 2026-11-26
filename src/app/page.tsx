import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export default async function RootPage() {
  const cookieStore = await cookies()
  const hasSession =
    Boolean(cookieStore.get("revlet_mfa_session")?.value) ||
    cookieStore.get("revlet_session_hint")?.value === "1"

  if (hasSession) {
    redirect("/account/home")
  }
  redirect("/login")
}
