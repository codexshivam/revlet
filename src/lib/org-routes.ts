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
  const tab = emailSlugToTab(key)
  if (!tab) return null
  return EMAIL_TAB_TO_SECTION_SLUG[tab] || null
}

export function emailSlugToTab(raw: string | undefined | null): string | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  return Object.hasOwn(EMAIL_SECTION_SLUG_TO_TAB, key) ? EMAIL_SECTION_SLUG_TO_TAB[key] : null
}

export function emailTabToSlug(tab: string | undefined | null): string {
  if (!tab) return "users"
  return EMAIL_TAB_TO_SECTION_SLUG[tab.trim().toLowerCase()] || "users"
}

const WORKSPACE_ROUTES: Record<OrgSection, string> = {
  overview: "/account/home",
  dns: "/services/dns",
  email: "/services/email",
  team: "/management/team",
  settings: "/management/settings",
}

export function buildOrgRoute(section: OrgSection, subSection?: string): string {
  const path = WORKSPACE_ROUTES[section]
  if (section !== "email" || !subSection) return path
  return `${path}?tab=${emailTabToSlug(subSection)}`
}

export function legacyWorkspaceDestination(pathname: string, search: string, hash: string): string {
  const [, rawSection, emailSection] = pathname.match(/^\/orgs\/[^/]+\/([^/]+)(?:\/([^/]+))?/) || []
  const section = Object.hasOwn(WORKSPACE_ROUTES, rawSection) ? rawSection as OrgSection : "overview"
  const params = new URLSearchParams(search)
  if (section === "email") {
    const tab = normalizeEmailSectionSlug(emailSection || params.get("tab"))
    if (tab) params.set("tab", tab)
    else params.delete("tab")
  }
  const query = params.toString()
  return `${buildOrgRoute(section)}${query ? `?${query}` : ""}${hash}`
}
