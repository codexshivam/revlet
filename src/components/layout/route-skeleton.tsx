function BrandLogoLoadingScreen() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="fixed inset-0 z-50 flex min-h-screen w-full items-center justify-center bg-white px-6"
    >
      <img
        src="/logo-4k.png"
        alt="Revlet"
        className="h-20 sm:h-24 w-auto max-w-[82vw] object-contain select-none"
      />
    </div>
  )
}

export function OverviewRouteSkeleton() {
  return <BrandLogoLoadingScreen />
}

export function TableRouteSkeleton() {
  return <BrandLogoLoadingScreen />
}
