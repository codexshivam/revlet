
"use client"

import * as React from "react"
import { Check, ChevronsUpDown, School } from "lucide-react"
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

const institutions = [
  { value: "ku", label: "Kathmandu Vidya Mandir" },
  { value: "tu", label: "Lalitpur Secondary School" },
  { value: "sxc", label: "Pokhara University Affiliated College" },
]

export function OrgSelector() {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("ku")

  return (
    <div className="flex items-center gap-4 py-4 px-6 bg-white border border-slate-200 rounded-lg shadow-sm">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Select Organization / Domain:</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[320px] justify-between h-9 text-sm font-semibold border-slate-200 bg-slate-50/50"
            >
              <div className="flex items-center gap-2 truncate">
                <School className="h-4 w-4 text-primary" />
                <span className="truncate">
                  {institutions.find((inst) => inst.value === value)?.label || "Select Institution"}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0 shadow-xl border-slate-200">
            <Command>
              <CommandInput placeholder="Search institutions..." className="h-9" />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup>
                  {institutions.map((inst) => (
                    <CommandItem
                      key={inst.value}
                      value={inst.value}
                      onSelect={(currentValue) => {
                        setValue(currentValue === value ? "" : currentValue)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === inst.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {inst.label}
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
