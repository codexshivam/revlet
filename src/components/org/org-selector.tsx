"use client"

import * as React from "react"
import Link from "next/link"
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
import { useActiveOrg } from "@/hooks/use-active-org"

export function OrgSelector({ 
  selectedId, 
  onSelect,
  compact = false
}: { 
  selectedId?: string, 
  onSelect?: (id: string) => void,
  compact?: boolean
}) {
  const { orgs, activeOrg, activeOrgId, setActiveOrgId, loading } = useActiveOrg()
  const [open, setOpen] = React.useState(false)

  // Support both hook sync and explicit prop override
  const currentId = selectedId || activeOrgId
  const handleSelect = onSelect || setActiveOrgId
  const selected = orgs.find((org) => org.id === currentId)

  const triggerButton = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={loading}
          className={cn(
            "justify-between h-9 text-xs font-bold border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm rounded-lg text-slate-800",
            compact ? "w-full" : "w-[450px]"
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
      <PopoverContent className={cn("p-0 shadow-xl border-slate-200 bg-white overflow-hidden rounded-lg", compact ? "w-[224px]" : "w-[450px]")}>
        <Command className="bg-white">
          <CommandInput 
            placeholder="Search organizations..." 
            className="h-9 text-xs text-slate-800 placeholder:text-slate-400 bg-transparent outline-none focus:ring-0" 
          />
          <CommandList className="border-t border-slate-100">
            <CommandEmpty className="text-xs py-4 text-slate-400">No organizations found.</CommandEmpty>
            <CommandGroup>
              {orgs.map((inst) => {
                const isSelected = currentId === inst.id
                return (
                  <CommandItem
                    key={inst.id}
                    value={inst.id}
                    onSelect={(v) => {
                      handleSelect(v)
                      setOpen(false)
                    }}
                    className={cn(
                      "text-xs py-2 cursor-pointer transition-colors m-1 rounded-md",
                      isSelected 
                        ? "bg-blue-600 text-white data-[selected=true]:bg-blue-600 data-[selected=true]:text-white hover:bg-blue-700 hover:text-white font-semibold"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                    )}
                  >
                    <Building2
                      className={cn(
                        "mr-2 h-3.5 w-3.5 shrink-0",
                        isSelected ? "text-white" : "text-slate-400"
                      )}
                    />
                    <div className="flex flex-col truncate flex-1">
                      <span className={cn("font-bold truncate", isSelected ? "text-white" : "text-slate-800")}>
                        {inst.name}
                      </span>
                      {inst.domain && (
                        <span className={cn("text-[10px] truncate", isSelected ? "text-blue-100/90" : "text-slate-400")}>
                          {inst.domain}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-white" />
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          <div className="p-1 border-t border-slate-100 bg-slate-50/50">
            <Link 
              href="/account/home" 
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-slate-100 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manage Organizations</span>
            </Link>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )

  if (compact) {
    return triggerButton
  }

  return (
    <div className="flex items-center gap-4 py-3 px-5 bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Select Organization</span>
        {triggerButton}
      </div>
    </div>
  )
}
