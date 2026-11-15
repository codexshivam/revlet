"use client"

import { AlertCircle, CheckCircle2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={5000}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const isDestructive = variant === "destructive"
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="shrink-0 animate-pop-in">
              {isDestructive ? (
                <AlertCircle className="h-4 w-4 text-red-200" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
