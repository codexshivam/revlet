
"use client"

import * as React from "react"
import { Check, ChevronsUpDown, School, Loader2 } from "lucide-react"
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
import { useUser, useFirestore } from "@/firebase"
import { collection, query, where, onSnapshot } from "firebase/firestore"

interface Organization {
  id: string
  name: string
  domain: string
}

export function OrgSelector({ 
  selectedId, 
  onSelect 
}: { 
  selectedId?: string, 
  onSelect?: (id: string) => void 
}) {
  const { user } = useUser()
  const db = useFirestore()
  const [open, setOpen] = React.useState(false)
  const [orgs, setOrgs] = React.useState<Organization[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!user) return
    const q = query(collection(db, "organizations"), where("ownerId", "==", user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setOrgs(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name, domain: doc.data().domain })) as Organization[])
      setLoading(false)
    })
    return unsub
  }, [user, db])

  const selected = orgs.find((org) => org.id === selectedId)

  return (
    <div className="flex items-center gap-4 py-4 px-6 bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Select Organization</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={loading}
              className="w-[320px] justify-between h-9 text-sm font-semibold border-slate-200 bg-slate-50/50"
            >
              <div className="flex items-center gap-2 truncate">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <School className="h-4 w-4 text-primary" />}
                <span className="truncate">
                  {selected ? selected.name : (loading ? "Synchronizing..." : "Select Institution")}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0 shadow-xl border-slate-200">
            <Command>
              <CommandInput placeholder="Search institutions..." className="h-9" />
              <CommandList>
                <CommandEmpty>No institutions found.</CommandEmpty>
                <CommandGroup>
                  {orgs.map((inst) => (
                    <CommandItem
                      key={inst.id}
                      value={inst.id}
                      onSelect={(v) => {
                        onSelect?.(v)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedId === inst.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-bold">{inst.name}</span>
                        <span className="text-[10px] text-slate-400">{inst.domain}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
