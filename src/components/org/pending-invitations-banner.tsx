"use client"

import { useActiveOrg } from "@/hooks/use-active-org"
import { useEffect, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Loader2, MailCheck, ShieldAlert } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useUser } from "@/firebase"
import { toast } from "@/hooks/use-toast"
import { acceptPendingInvitations, listMyPendingInvitations } from "@/app/actions/team"

const StepUpMfaDialog = dynamic(
  () => import("@/components/security/step-up-mfa-dialog").then((m) => m.StepUpMfaDialog),
  { ssr: false }
)

interface PendingInviteItem {
  id: string
  inviterName: string
  isPrivileged: boolean
  orgs: Array<{ id: string; name: string; domain: string; permissions: string[] }>
}

export function PendingInvitationsBanner() {
  const { user } = useUser()
  const router = useRouter()
  const { setActiveOrgId } = useActiveOrg()
  const [invites, setInvites] = useState<PendingInviteItem[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [stepUpOpen, setStepUpOpen] = useState(false)
  const [pendingIdsForMfa, setPendingIdsForMfa] = useState<string[] | undefined>(undefined)

  const loadPending = useCallback(async () => {
    if (!user || !user.emailVerified) {
      setInvites([])
      return
    }
    try {
      const idToken = await user.getIdToken()
      const res = await listMyPendingInvitations(idToken)
      if (res.success && Array.isArray(res.data)) {
        setInvites(res.data)
      }
    } catch {
      // Non-blocking
    }
  }, [user])

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  const handleJoin = async (inviteIds?: string[], stepUpToken?: string) => {
    if (!user) return
    const key = inviteIds && inviteIds.length === 1 ? inviteIds[0] : "ALL"
    setBusyId(key)
    try {
      const idToken = await user.getIdToken(true)
      const res = await acceptPendingInvitations(idToken, inviteIds, stepUpToken)
      if (!res.success) {
        if (typeof res.error === "string" && res.error.includes("MFA_STEP_UP_REQUIRED")) {
          setPendingIdsForMfa(inviteIds)
          setStepUpOpen(true)
          return
        }
        throw new Error(res.error || "Could not accept invitation.")
      }
      toast({
        title: key === "ALL" ? "Joined all pending workspaces" : "Joined workspace",
        description: "Your workspace access is now active.",
      })
      if (res.data?.primaryOrgId && typeof window !== "undefined") {
        setActiveOrgId(res.data.primaryOrgId)
        window.dispatchEvent(new Event("revlet-orgs-refresh"))
      }
      await loadPending()
      if (key !== "ALL" && res.data?.primaryPerms?.every((p: string) => p.startsWith("DNS:"))) {
        router.push("/services/dns")
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not join",
        description: err?.message || "Please try again.",
      })
    } finally {
      setBusyId(null)
    }
  }

  if (invites.length === 0) return null

  return (
    <>
      <Card className="bg-white border-slate-300 shadow-none rounded-xl overflow-hidden">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MailCheck className="w-4 h-4 text-slate-900 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-900">
                Pending Workspace Invitations ({invites.length})
              </h2>
            </div>
            {invites.length > 1 && (
              <Button
                type="button"
                size="sm"
                disabled={busyId !== null}
                onClick={() => void handleJoin(undefined)}
                className="h-8 px-3 text-xs bg-slate-900 hover:bg-slate-800 text-white rounded-lg"
              >
                {busyId === "ALL" && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Join All ({invites.length})
              </Button>
            )}
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-slate-900">
                      {inv.orgs.map((o) => o.name).join(", ")}
                    </span>
                    {inv.isPrivileged && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-medium">
                        <ShieldAlert className="w-3 h-3" />
                        Admin role
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600">
                    Invited by {inv.inviterName} ·{" "}
                    {inv.orgs.map((o) => o.permissions.join(", ")).join(" · ")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => void handleJoin([inv.id])}
                  className="h-8 px-3 text-xs bg-white border-slate-300 hover:bg-slate-100 rounded-lg shrink-0"
                >
                  {busyId === inv.id && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                  Join Workspace
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <StepUpMfaDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionLabel="accept a privileged workspace invitation"
        onVerified={(token) => {
          void handleJoin(pendingIdsForMfa, token)
        }}
      />
    </>
  )
}
