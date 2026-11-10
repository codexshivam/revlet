import * as React from "react"
import { cn } from "@/lib/utils"

export interface RevletLogoMarkProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

/**
 * Official Revlet vector geometric mark.
 * Scalable from 16px to 512px, adapts to currentColor.
 */
export function RevletLogoMark({ className, ...props }: RevletLogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label="Revlet Logo Mark"
      className={cn("w-6 h-6 shrink-0", className)}
      {...props}
    >
      <g fill="currentColor" transform="translate(80 103.4) scale(1.8624338624) translate(-170 -173)">
        <path d="M200 173H293L307 184L350 234V239L310 278V282L358 336H317L247 259H321L325 255L324 249L284 206H229L200 173Z" />
        <rect x="170" y="237" width="35" height="35" rx="2" />
        <rect x="170" y="294" width="35" height="35" rx="2" />
        <rect x="225" y="294" width="35" height="35" rx="2" />
        <path d="M199.5 268.5L204.5 263.5L230.5 289.5L225.5 294.5Z" />
      </g>
    </svg>
  )
}

export interface RevletLogoProps {
  variant?: "mark" | "horizontal" | "vertical" | "badge"
  size?: "sm" | "md" | "lg" | "xl"
  subtitle?: string
  showBadge?: boolean
  badgeText?: string
  className?: string
  invert?: boolean
}

/**
 * Official strict brand lockup for Revlet IT Manager.
 */
export function RevletLogo({
  variant = "horizontal",
  size = "md",
  subtitle = "IT Manager",
  showBadge = true,
  badgeText = "OS",
  className,
  invert = false,
}: RevletLogoProps) {
  if (variant === "mark") {
    const markSize = {
      sm: "w-5 h-5",
      md: "w-6 h-6",
      lg: "w-8 h-8",
      xl: "w-12 h-12",
    }[size]

    return <RevletLogoMark className={cn(markSize, invert ? "text-white" : "text-[#191C1E]", className)} />
  }

  if (variant === "vertical") {
    return (
      <div className={cn("flex flex-col items-center text-center select-none group", className)}>
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-900 text-white flex items-center justify-center border border-slate-800 shadow-sm transition-colors duration-150">
          <RevletLogoMark className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="text-2xl sm:text-3xl font-headline font-bold text-slate-900 tracking-tight leading-none">
            Revlet
          </span>
          {showBadge && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/80">
              {badgeText}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs font-medium text-slate-500 mt-1">
            {subtitle}
          </p>
        )}
      </div>
    )
  }

  if (variant === "badge") {
    return (
      <div className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white/80 backdrop-blur-sm shadow-xs select-none",
        className
      )}>
        <div className="w-4 h-4 rounded-md bg-slate-900 text-white flex items-center justify-center">
          <RevletLogoMark className="w-2.5 h-2.5 text-white" />
        </div>
        <span className="text-xs font-headline font-bold text-slate-900 tracking-tight">
          Revlet
        </span>
        <span className="text-[10px] text-slate-500 font-medium">
          {subtitle}
        </span>
      </div>
    )
  }

  // Default "horizontal"
  const markBoxSize = {
    sm: "w-7 h-7 rounded-lg",
    md: "w-9 h-9 rounded-xl",
    lg: "w-11 h-11 rounded-2xl",
    xl: "w-14 h-14 rounded-2xl",
  }[size]

  const markIconSize = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
    xl: "w-8 h-8",
  }[size]

  const titleSize = {
    sm: "text-[15px]",
    md: "text-[17px]",
    lg: "text-[22px]",
    xl: "text-[28px]",
  }[size]

  return (
    <div className={cn("inline-flex items-center gap-3 select-none group", className)}>
      <div className={cn(
        markBoxSize,
        "bg-slate-900 text-white flex items-center justify-center border border-slate-800 shadow-sm transition-colors duration-150"
      )}>
        <RevletLogoMark className={cn(markIconSize, "text-white")} />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className={cn("font-headline font-bold text-slate-900 leading-none tracking-tight", titleSize)}>
            Revlet
          </span>
          {showBadge && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/80 leading-none">
              {badgeText}
            </span>
          )}
        </div>
        {subtitle && (
          <span className="text-[11px] font-medium text-slate-500 mt-0.5 leading-none">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}
