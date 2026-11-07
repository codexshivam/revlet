import type { Metadata } from "next"
import Link from "next/link"
import { Home, LifeBuoy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthFrame } from "@/components/layout/auth-frame"

export const metadata: Metadata = {
  title: "Resource Not Found",
  description: "The requested page does not exist or has been relocated.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function NotFound() {
  return (
    <AuthFrame>
      <div className="w-full max-w-[460px] bg-white border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl p-6 sm:p-10 space-y-6 text-center animate-in fade-in duration-300">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-headline font-bold text-slate-900 tracking-tight">
            Resource Not Found
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
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
            <Button variant="outline" className="w-full border-slate-200 text-slate-700 hover:text-black hover:bg-slate-50 font-semibold text-xs h-10 gap-2 rounded-lg transition-colors group">
              <LifeBuoy className="w-4 h-4 text-slate-400 group-hover:text-black transition-colors" />
              Contact Support
            </Button>
          </Link>
        </div>
      </div>
    </AuthFrame>
  )
}
