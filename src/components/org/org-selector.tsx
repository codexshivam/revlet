"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Building2, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useActiveOrg } from "@/hooks/use-active-org"
import { useUser, useFirestore } from "@/firebase"
import { useToast } from "@/hooks/use-toast"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"

export function OrgSelector({ 
  selectedId, 
  onSelect,
  compact = false
}: { 
  selectedId?: string, 
  onSelect?: (id: string) => void,
  compact?: boolean
}) {
  const { orgs, activeOrgId, setActiveOrgId, loading } = useActiveOrg()
  const { user } = useUser()
  const db = useFirestore()
  const { toast } = useToast()

  const [open, setOpen] = React.useState(false)
  const [isAddOrgOpen, setIsAddOrgOpen] = React.useState(false)
  const [newOrgName, setNewOrgName] = React.useState("")
  const [newOrgDomain, setNewOrgDomain] = React.useState("")
  const [isEducation, setIsEducation] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState("")

  // Support both hook sync and explicit prop override
  const currentId = selectedId || activeOrgId
  const handleSelect = onSelect || setActiveOrgId
  const selected = orgs.find((org) => org.id === currentId)

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication Required",
        description: "You must be signed in to add an organization."
      })
      return
    }

    const cleanName = newOrgName.trim()
    const cleanDomain = newOrgDomain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')

    if (!cleanName) {
      setFormError("Organization name is required.")
      return
    }

    if (!cleanDomain || !cleanDomain.includes(".")) {
      setFormError("A valid root domain (e.g. example.com) is required.")
      return
    }

    setFormError("")
    setIsSubmitting(true)

    try {
      const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase()
      const orgCode = `${cleanName.substring(0, 3).toUpperCase()}-${uniqueSuffix}`

      const orgsRef = collection(db, "organizations")
      const newDoc = await addDoc(orgsRef, {
        name: cleanName,
        domain: cleanDomain,
        isEducation: !!isEducation,
        code: orgCode,
        ownerId: user.uid,
        status: "Active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      handleSelect(newDoc.id)
      setIsAddOrgOpen(false)
      setNewOrgName("")
      setNewOrgDomain("")
      setIsEducation(false)
      toast({
        title: "Organization Registered",
        description: `${cleanName} has been created and set as the active organization.`
      })
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: err?.message || "Failed to create organization."
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const triggerButton = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={loading}
          className={cn(
            "justify-between h-9 text-xs font-bold border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 hover:text-black transition-all shadow-sm rounded-lg text-slate-800",
            compact ? "w-auto min-w-[180px] max-w-[280px]" : "w-[450px]"
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
            ) : (
              <Building2 className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            )}
            <span className="truncate text-slate-800">
              {selected ? selected.name : (loading ? "Syncing..." : "Select Organization")}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-55 text-slate-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className={cn(
          "p-0 shadow-xl border-slate-200 bg-white overflow-hidden rounded-lg", 
          compact ? "w-[260px] sm:w-[280px]" : "w-[450px]"
        )}
        align="start"
      >
        <Command className="bg-white">
          <CommandInput 
            placeholder="Search organizations..." 
            className="h-9 text-xs text-slate-800 placeholder:text-slate-400 bg-transparent outline-none focus:ring-0" 
          />
          <CommandList className="border-t border-slate-100 max-h-[300px]">
            <CommandEmpty className="text-xs py-4 text-slate-400 text-center">No organizations found.</CommandEmpty>
            <CommandGroup>
              {orgs.map((inst) => {
                const isSelected = currentId === inst.id

                return (
                  <CommandItem
                    key={inst.id}
                    value={`${inst.name} ${inst.domain || ''}`}
                    onSelect={() => {
                      handleSelect(inst.id)
                      setOpen(false)
                    }}
                    className={cn(
                      "text-xs py-2 px-2.5 cursor-pointer transition-colors m-1 rounded-md flex items-center justify-between gap-2",
                      isSelected 
                        ? "bg-slate-100 text-slate-900 data-[selected=true]:bg-slate-100 font-semibold border border-slate-200/80"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Building2
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isSelected ? "text-blue-600" : "text-slate-400"
                        )}
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-bold text-slate-800 truncate text-xs">
                          {inst.name}
                        </span>
                        {inst.domain && (
                          <span className="text-[10px] text-slate-400 font-medium truncate">
                            {inst.domain}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-blue-600 ml-auto" />
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          <div className="p-1 border-t border-slate-100 bg-slate-50/50">
            <button 
              type="button"
              onClick={() => {
                setOpen(false)
                setFormError("")
                setIsAddOrgOpen(true)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-slate-100 hover:text-black rounded transition-colors text-left"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Organization</span>
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )

  return (
    <>
      {compact ? (
        triggerButton
      ) : (
        <div className="flex items-center gap-4 py-3 px-5 bg-white border border-slate-200 rounded-lg shadow-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Select Organization</span>
            {triggerButton}
          </div>
        </div>
      )}

      {/* Add Organization Dialog */}
      <Dialog open={isAddOrgOpen} onOpenChange={setIsAddOrgOpen}>
        <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-xl border border-slate-200 shadow-xl">
          <DialogHeader className="border-b border-slate-100 bg-white p-5">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <DialogTitle className="font-headline font-bold text-base text-slate-900">
                Add Organization
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Register a new organization workspace to manage DNS, email routing, and services.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateOrg}>
            <div className="p-5 space-y-4">
              {formError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="add-org-name" className="text-xs font-bold text-slate-700">
                  Organization Legal Name *
                </Label>
                <Input
                  id="add-org-name"
                  placeholder="e.g. Stanford University or Acme Inc"
                  value={newOrgName}
                  onChange={(e) => {
                    setNewOrgName(e.target.value)
                    if (formError) setFormError("")
                  }}
                  className="h-9 text-xs border-slate-200 font-medium"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-org-domain" className="text-xs font-bold text-slate-700">
                  Primary Root Domain *
                </Label>
                <Input
                  id="add-org-domain"
                  placeholder="e.g. example.com or example.edu"
                  value={newOrgDomain}
                  onChange={(e) => {
                    setNewOrgDomain(e.target.value)
                    if (formError) setFormError("")
                  }}
                  className="h-9 text-xs border-slate-200 font-medium"
                  required
                />
                <p className="text-[10px] text-slate-400">
                  Root domain used for Cloudflare DNS edge routing and Google Workspace.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/70">
                <div className="space-y-0.5">
                  <Label htmlFor="add-org-edu" className="text-xs font-bold text-slate-700 cursor-pointer">
                    Educational Institution
                  </Label>
                  <p className="text-[10px] text-slate-400">
                    Enable academic services and Google Workspace for Education features.
                  </p>
                </div>
                <Switch
                  id="add-org-edu"
                  checked={isEducation}
                  onCheckedChange={setIsEducation}
                />
              </div>
            </div>

            <DialogFooter className="bg-slate-50/80 p-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddOrgOpen(false)}
                className="h-9 text-xs font-bold rounded-lg border-slate-200 hover:text-black hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-9 px-4 text-xs font-bold rounded-lg bg-primary hover:bg-primary/95 text-white shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Adding...
                  </>
                ) : (
                  "Add Organization"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
