import Link from "next/link"
import { Home, LifeBuoy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RevletLogo } from "@/components/brand/revlet-logo"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-50 via-slate-100/50 to-blue-50/30 flex flex-col items-center justify-center p-4 sm:p-6 animate-in fade-in duration-500">
      <div className="w-full max-w-[480px] space-y-8 text-center">
        <RevletLogo variant="vertical" size="lg" subtitle="Enterprise Infrastructure Platform" />

        <div className="bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl p-8 sm:p-10 space-y-6">
          <div className="space-y-2">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10">
              Error 404
            </span>
            <h1 className="text-2xl font-headline font-bold text-slate-900 tracking-tight pt-2">
              Resource Not Found
            </h1>
            <p className="text-xs text-slate-500 font-normal leading-relaxed">
              The requested infrastructure page or endpoint does not exist or has been relocated within the Revlet Platform.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link href="/account/home" className="flex-1">
              <Button className="w-full bg-primary hover:bg-primary/95 text-white font-semibold text-xs h-10 gap-2 rounded-lg">
                <Home className="w-4 h-4" />
                Return to Dashboard
              </Button>
            </Link>
            <Link href="/support" className="flex-1">
              <Button variant="outline" className="w-full border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-10 gap-2 rounded-lg">
                <LifeBuoy className="w-4 h-4 text-slate-400" />
                Support Desk
              </Button>
            </Link>
          </div>
        </div>

        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          &copy; 2026 REVLET PLATFORM &bull; HELLO@REVLET.ME
        </div>
      </div>
    </div>
  )
}
