import { redirect } from "next/navigation"
import { normalizeEmailSectionSlug } from "@/lib/org-routes"
import EmailServicePage from "@/app/services/email/page"

export default async function OrgEmailSectionPage({
  params,
}: {
  params: Promise<{ orgKey: string; section: string }>
}) {
  const { orgKey, section } = await params
  const canonical = normalizeEmailSectionSlug(section)
  if (!canonical) {
    redirect(`/orgs/${encodeURIComponent(orgKey)}/email/users`)
  }
  if (canonical !== section.toLowerCase()) {
    redirect(`/orgs/${encodeURIComponent(orgKey)}/email/${canonical}`)
  }
  return <EmailServicePage />
}
