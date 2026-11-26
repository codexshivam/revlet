"use client"

import { useState } from "react"
import { Check, ChevronDown, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { MailRequiredDnsRecord } from "@/app/actions/email-service"

export function EmailDomainRecords({
  records,
  domain,
  defaultOpen = false,
}: {
  records: MailRequiredDnsRecord[]
  domain: string
  defaultOpen?: boolean
}) {
  const [copyStatus, setCopyStatus] = useState("")
  if (records.length === 0) return null

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus(label)
    } catch {
      setCopyStatus("Clipboard unavailable. Select the record text to copy it manually.")
    }
  }

  return (
    <details open={defaultOpen || undefined} className="group rounded-lg border border-zinc-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
        DNS records for {domain}
        <ChevronDown className="size-4 shrink-0 text-zinc-500 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-zinc-200">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm text-zinc-600" role="status">{copyStatus || "Use these values in your domain provider’s DNS settings."}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => {
            const values = records.map((record) => [
              record.purpose,
              `Type: ${record.type}`,
              `Host: ${record.name}`,
              `Value: ${record.content}`,
              ...(record.priority === undefined ? [] : [`Priority: ${record.priority}`]),
            ].join("\n")).join("\n\n")
            void copy(values, "DNS records copied")
          }}>
            <Copy className="mr-2 size-4" aria-hidden="true" /> Copy all records
          </Button>
        </div>
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
          {records.map((record) => (
            <li key={record.id} className="px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium text-zinc-900">{record.purpose}</p>
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
                  {record.verified && <Check className="size-3.5" aria-hidden="true" />}
                  {record.verified ? "Verified" : record.required === false ? "Optional" : "Waiting for verification"}
                </span>
              </div>
              <dl className="mt-2 grid gap-1 text-xs text-zinc-600">
                <div className="flex flex-wrap items-center gap-x-2">
                  <dt>Type</dt><dd className="font-mono text-zinc-900">{record.type}</dd>
                  {record.priority !== undefined && <><dt className="ml-2">Priority</dt><dd className="font-mono text-zinc-900">{record.priority}</dd></>}
                </div>
                {([{ label: "Host", value: record.name }, { label: "Value", value: record.content }]).map(({ label, value }) => (
                  <div key={label} className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
                    <dt>{label}</dt>
                    <dd className="select-all break-all font-mono text-zinc-900">{value}</dd>
                    <dd>
                      <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Copy ${label.toLowerCase()} for ${record.purpose}`} onClick={() => void copy(value, `${label} copied for ${record.purpose}`)}>
                        <Copy className="size-4" aria-hidden="true" />
                      </Button>
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
