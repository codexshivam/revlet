"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

type VitalRecord = {
  route: string
  lcpMs?: number
  cls?: number
  inpMs?: number
  warmNavMs?: number
  updatedAt: number
}

declare global {
  interface Window {
    __revletPerf?: {
      currentRoute: string
      metricsByRoute: Record<string, VitalRecord>
    }
  }
}

function classifyRoute(pathname: string | null): string {
  if (!pathname || pathname === "/") return "root"
  if (pathname.startsWith("/login")) return "auth:login"
  if (pathname.startsWith("/signup")) return "auth:signup"
  if (pathname.startsWith("/orgs/")) {
    const parts = pathname.split("/").filter(Boolean)
    const section = parts[2] || "overview"
    return `org:${section}`
  }
  if (pathname.startsWith("/account/home")) return "org:overview"
  if (pathname.startsWith("/services/dns")) return "org:dns"
  if (pathname.startsWith("/services/email")) return "org:email"
  if (pathname.startsWith("/management/team")) return "org:team"
  if (pathname.startsWith("/management/settings")) return "org:settings"
  if (pathname.startsWith("/support")) return "support"
  return "other"
}

export function RouteVitalsMonitor() {
  const pathname = usePathname()
  const routeCategory = classifyRoute(pathname)
  const routeRef = useRef(routeCategory)
  const navStartRef = useRef<number | null>(null)

  useEffect(() => {
    routeRef.current = routeCategory
    if (typeof window === "undefined") return

    if (!window.__revletPerf) {
      window.__revletPerf = { currentRoute: routeCategory, metricsByRoute: {} }
    }
    window.__revletPerf.currentRoute = routeCategory
    if (!window.__revletPerf.metricsByRoute[routeCategory]) {
      window.__revletPerf.metricsByRoute[routeCategory] = {
        route: routeCategory,
        updatedAt: Date.now(),
      }
    }

    if (navStartRef.current !== null) {
      const elapsed = Math.round(performance.now() - navStartRef.current)
      window.__revletPerf.metricsByRoute[routeCategory].warmNavMs = elapsed
      window.__revletPerf.metricsByRoute[routeCategory].updatedAt = Date.now()
      window.dispatchEvent(
        new CustomEvent("revlet:web-vital", {
          detail: { metric: "WARM_NAV", value: elapsed, route: routeCategory },
        })
      )
    }
    navStartRef.current = performance.now()
  }, [routeCategory])

  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return

    const recordMetric = (field: "lcpMs" | "cls" | "inpMs", value: number, metricName: string) => {
      const r = routeRef.current
      if (!window.__revletPerf) {
        window.__revletPerf = { currentRoute: r, metricsByRoute: {} }
      }
      const existing = window.__revletPerf.metricsByRoute[r] || { route: r, updatedAt: Date.now() }
      existing[field] = value
      existing.updatedAt = Date.now()
      window.__revletPerf.metricsByRoute[r] = existing
      window.dispatchEvent(
        new CustomEvent("revlet:web-vital", {
          detail: { metric: metricName, value, route: r },
        })
      )
    }

    const observers: PerformanceObserver[] = []
    let clsTotal = 0

    try {
      const lcpObs = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1]
        if (last) {
          recordMetric("lcpMs", Math.round(last.startTime), "LCP")
        }
      })
      lcpObs.observe({ type: "largest-contentful-paint", buffered: true })
      observers.push(lcpObs)
    } catch {}

    try {
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput && typeof entry.value === "number") {
            clsTotal += entry.value
            recordMetric("cls", Number(clsTotal.toFixed(4)), "CLS")
          }
        }
      })
      clsObs.observe({ type: "layout-shift", buffered: true })
      observers.push(clsObs)
    } catch {}

    try {
      const inpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 0) {
            recordMetric("inpMs", Math.round(entry.duration), "INP")
          }
        }
      })
      inpObs.observe({ type: "event", buffered: true } as PerformanceObserverInit)
      observers.push(inpObs)
    } catch {}

    return () => {
      observers.forEach((o) => o.disconnect())
    }
  }, [])

  return null
}
