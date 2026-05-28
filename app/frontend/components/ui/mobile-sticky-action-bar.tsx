import * as React from "react"
import { cn } from "@/lib/utils"

interface MobileStickyActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pass true to add an inline border-top + padding on desktop. Default true. */
  desktopBordered?: boolean
}

/**
 * Renders inline at `md+` (matches the existing "actions row below a form" pattern)
 * and as a fixed bottom bar below `md` with bg-page, top hairline, and safe-area
 * bottom inset. Children are stretched full-width on mobile (`flex-1` each) so the
 * primary submit reads as a full-width button per the design system mobile pattern.
 *
 * Pages relying on this should make sure their <main> element has enough bottom
 * padding on mobile (AdminShell + AppShell apply `pb-24 lg:pb-0` to cover this).
 */
export function MobileStickyActionBar({
  children,
  className,
  desktopBordered = true,
  ...props
}: MobileStickyActionBarProps) {
  return (
    <>
      {/* Mobile: fixed bottom bar.
          Children stack as a vertical column so each button gets its own
          full-width row — works for one primary submit or for primary + 1-2
          secondaries without overflow. Primary submit (the first <Button>
          encountered in DOM order via the order utility is left to the page
          to choose — by default callers place the primary submit first). */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-hairline bg-page px-4 py-3 md:hidden",
          "[&>*]:w-full",
          className,
        )}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        {...props}
      >
        {children}
      </div>

      {/* Desktop: inline row */}
      <div
        className={cn(
          "hidden md:flex md:flex-wrap md:items-center md:gap-3",
          desktopBordered && "md:mt-6 md:border-t md:border-hairline md:pt-6",
          className,
        )}
      >
        {children}
      </div>
    </>
  )
}
