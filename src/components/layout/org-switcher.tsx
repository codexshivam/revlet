
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

const orgs = [
  { value: "ku", label: "Kathmandu University" },
  { value: "tu", label: "Tribhuvan University" },
  { value: "sxc", label: "St. Xavier's College" },
]

export function OrgSwitcher() {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("ku")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[240px] justify-between bg-white shadow-sm border-slate-200"
        >
          <div className="flex items-center gap-2 truncate">
            <School className="h-4 w-4 text-primary" />
            <span className="truncate font-medium">
              {value
                ? orgs.find((org) => org.value === value)?.label
                : "Select Organization..."}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0">
        <Command>
          <CommandInput placeholder="Search organization..." />
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup>
              {orgs.map((org) => (
                <CommandItem
                  key={org.value}
                  value={org.value}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === org.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {org.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
