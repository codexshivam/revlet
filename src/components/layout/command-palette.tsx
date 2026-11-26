"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Building2,
  Check,
  ExternalLink,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Settings,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useActiveOrg } from "@/hooks/use-active-org"
import { buildOrgRoute } from "@/lib/org-routes"
import { useToast } from "@/hooks/use-toast"

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const { orgs, activeOrg, activeOrgId, setActiveOrgId } = useActiveOrg()
  const { toast } = useToast()

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    const onOpenEvent = () => setOpen(true)

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("revlet:open-command-palette", onOpenEvent)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("revlet:open-command-palette", onOpenEvent)
    }
  }, [])

  const navigate = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command, page, or organization (⌘K)..." />
      <CommandList className="max-h-[360px]">
        <CommandEmpty>No matching commands, pages, or organizations found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "overview"))}>
            <LayoutDashboard className="mr-2 h-4 w-4 text-zinc-900 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Workspace Overview</span>
            <CommandShortcut>Home</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "dns"))}>
            <Globe className="mr-2 h-4 w-4 text-emerald-600 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>DNS Management</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "email", "users"))}>
            <Mail className="mr-2 h-4 w-4 text-zinc-900 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Email Service</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "team"))}>
            <Users className="mr-2 h-4 w-4 text-slate-600 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Team Management</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "settings"))}>
            <Settings className="mr-2 h-4 w-4 text-slate-600 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Account Settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Email Directory">
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "email", "users"))}>
            <Mail className="mr-2 h-4 w-4 text-slate-600 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Email: Users Directory</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "email", "groups"))}>
            <Users className="mr-2 h-4 w-4 text-slate-600 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Email: Groups</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "email", "suspended"))}>
            <ShieldAlert className="mr-2 h-4 w-4 text-amber-600 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Email: Suspended Accounts</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate(buildOrgRoute(activeOrg?.id, "email", "settings"))}>
            <Settings className="mr-2 h-4 w-4 text-slate-600 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Email: Settings &amp; DNS</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => navigate("/management/team")}>
            <UserPlus className="mr-2 h-4 w-4 text-zinc-900 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Invite Team Member</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate("/support")}>
            <LifeBuoy className="mr-2 h-4 w-4 text-slate-600 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Help &amp; Support</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false)
              window.open("https://mail.revlet.me", "_blank", "noopener,noreferrer")
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4 text-zinc-900 group-hover:!text-white group-data-[selected='true']:!text-white" />
            <span>Open RevletMail Webmail</span>
            <CommandShortcut>↗</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {orgs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch Organization">
              {orgs.map((org) => {
                const isActive = org.id === activeOrgId
                return (
                  <CommandItem
                    key={org.id}
                    value={`${org.name} ${org.domain}`}
                    onSelect={() => {
                      setActiveOrgId(org.id)
                      setOpen(false)
                      toast({
                        title: "Organization switched",
                        description: `Active workspace is now ${org.name || org.domain}.`,
                      })
                    }}
                  >
                    <Building2 className="mr-2 h-4 w-4 text-slate-500 group-hover:!text-white group-data-[selected='true']:!text-white" />
                    <span className="truncate font-medium">{org.name}</span>
                    {org.domain && (
                      <span className="ml-2 text-xs text-slate-400 group-hover:text-white/85 group-data-[selected='true']:text-white/85 truncate transition-colors">
                        {org.domain}
                      </span>
                    )}
                    {isActive && (
                      <Check className="ml-auto h-4 w-4 text-primary group-hover:!text-white group-data-[selected='true']:!text-white" />
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
