export type OrgSection =
  | "overview"
  | "dns"
  | "email"
  | "team"
  | "settings"

export const EMAIL_SECTION_SLUG_TO_TAB: Record<string, string> = {
  users: "users",
  groups: "groups",
  "shared-mailboxes": "shared",
  shared: "shared",
  suspended: "suspended",
  routing: "routing",
  domains: "domains",
  governance: "governance",
  settings: "settings",
}

export const EMAIL_TAB_TO_SECTION_SLUG: Record<string, string> = {
  users: "users",
  groups: "groups",
  shared: "shared-mailboxes",
  suspended: "suspended",
  routing: "routing",
  domains: "domains",
  governance: "governance",
  settings: "settings",
}

export function normalizeEmailSectionSlug(raw: string | undefined | null): string | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  const tab = EMAIL_SECTION_SLUG_TO_TAB[key]
  if (!tab) return null
  return EMAIL_TAB_TO_SECTION_SLUG[tab] || null
}

export function emailSlugToTab(raw: string | undefined | null): string | null {
  if (!raw) return null
  return EMAIL_SECTION_SLUG_TO_TAB[raw.trim().toLowerCase()] || null
}

export function emailTabToSlug(tab: string | undefined | null): string {
  if (!tab) return "users"
  return EMAIL_TAB_TO_SECTION_SLUG[tab.trim().toLowerCase()] || "users"
}

const COMPATIBLE_SWITCH_PARAMS = new Set(["status", "q", "filter", "type"])

export function preserveCompatibleSearchParams(search: string): string {
  if (!search) return ""
  const current = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const [k, v] of current.entries()) {
    if (COMPATIBLE_SWITCH_PARAMS.has(k) && v.trim()) {
      kept.set(k, v)
    }
  }
  const qs = kept.toString()
  return qs ? `?${qs}` : ""
}

export function buildOrgRoute(
  orgId: string | undefined | null,
  section: OrgSection,
  subSection?: string
): string {
  if (!orgId) {
    switch (section) {
      case "overview":
        return "/account/home"
      case "dns":
        return "/services/dns"
      case "email":
        return subSection ? `/services/email?tab=${encodeURIComponent(subSection)}` : "/services/email"
      case "team":
        return "/management/team"
      case "settings":
        return "/management/settings"
    }
  }
  const encodedOrg = encodeURIComponent(orgId)
  if (section === "email") {
    const slug = subSection ? emailTabToSlug(subSection) : "users"
    return `/orgs/${encodedOrg}/email/${slug}`
  }
  return `/orgs/${encodedOrg}/${section}`
}
