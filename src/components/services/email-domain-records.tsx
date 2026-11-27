"use client"

import { useState } from "react"
import { Check, ChevronDown, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { MailRequiredDnsRecord } from "@/app/actions/email-service"

const fields = ["Type", "Name", "Value", "Priority", "Status"] as const

export function EmailDomainRecords({
  records,
  domain,
  defaultOpen = false,
}: {
  records: MailRequiredDnsRecord[]
  domain: string
  defaultOpen?: boolean
}) {
  const [copyFeedback, setCopyFeedback] = useState<{
    key?: string
    message: string
  } | null>(null)
  if (records.length === 0) return null

  return (
    <details open={defaultOpen || undefined} className="group rounded-lg border border-zinc-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 break-words">DNS records for {domain}</span>
        <ChevronDown className="size-4 shrink-0 text-zinc-500 group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="border-t border-zinc-200">
        <div role="status" className={copyFeedback && !copyFeedback.key ? "px-4 py-2 text-sm text-zinc-700" : "sr-only"}>
          {copyFeedback?.message}
        </div>
        <div className="hidden lg:block">
          <Table className="table-fixed text-xs">
            <caption className="sr-only">DNS records for {domain}</caption>
            <TableHeader className="bg-zinc-50">
              <TableRow className="hover:bg-transparent">
                {fields.map((field) => (
                  <TableHead key={field} scope="col" className="h-10 px-3 first:w-16 [&:nth-child(2)]:w-1/4 [&:nth-child(4)]:w-16 last:w-24">
                    {field}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  {fields.map((field) => (
                    <TableCell key={field} className="px-3 py-2 align-top">
                      <DnsCell record={record} field={field} copiedKey={copyFeedback?.key} onCopyFeedback={setCopyFeedback} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <ul aria-label={`DNS records for ${domain}`} className="divide-y divide-zinc-200 lg:hidden">
          {records.map((record) => (
            <li key={record.id} className="px-4 py-3">
              <dl className="space-y-2 text-sm">
                {fields.map((field) => (
                  <div key={field} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2">
                    <dt className="text-zinc-600">{field}</dt>
                    <dd>
                      <DnsCell record={record} field={field} copiedKey={copyFeedback?.key} onCopyFeedback={setCopyFeedback} />
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

function DnsCell({
  record,
  field,
  copiedKey,
  onCopyFeedback,
}: {
  record: MailRequiredDnsRecord
  field: (typeof fields)[number]
  copiedKey?: string
  onCopyFeedback: (feedback: { key?: string; message: string }) => void
}) {
  if (field === "Type") return <span className="font-mono text-zinc-900">{record.type}</span>
  if (field === "Priority") return <span className="tabular-nums text-zinc-700">{record.priority ?? "—"}</span>
  if (field === "Status") {
    return <span className="text-zinc-700">{record.verified ? "Verified" : record.required === false ? "Optional" : "Pending"}</span>
  }

  const value = field === "Name" ? record.name : record.content
  const key = `${record.id}-${field}`
  const copied = copiedKey === key

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      onCopyFeedback({ key, message: `${field} copied` })
    } catch {
      onCopyFeedback({ message: "Clipboard unavailable. Select the text to copy it manually." })
    }
  }

  return (
    <div className="flex items-start gap-1">
      <span className="min-w-0 flex-1 select-all font-mono text-zinc-900 [overflow-wrap:anywhere]">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-my-2 size-11 shrink-0 text-zinc-500 lg:size-8"
        aria-label={`Copy ${field.toLowerCase()} for ${record.type} record ${record.name}`}
        onClick={copy}
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      </Button>
    </div>
  )
}
