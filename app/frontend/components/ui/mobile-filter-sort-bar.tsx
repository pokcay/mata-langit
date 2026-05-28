// bm-design-system: mobile filter + sort toolbar
import * as React from "react"
import { ArrowDownUp, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface MobileFilterSortBarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  filterCount?: number
  sortLabel?: React.ReactNode
  onFilterClick: () => void
  onSortClick: () => void
  filterLabel?: string
}

export const MobileFilterSortBar = React.forwardRef<
  HTMLDivElement,
  MobileFilterSortBarProps
>(
  (
    {
      className,
      filterCount = 0,
      sortLabel,
      onFilterClick,
      onSortClick,
      filterLabel = "Filter",
      ...props
    },
    ref,
  ) => (
    <div ref={ref} className={cn("flex w-full gap-2", className)} {...props}>
      <Button
        type="button"
        variant="secondary"
        className="h-11 flex-1 justify-center gap-2"
        onClick={onFilterClick}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>{filterLabel}</span>
        {filterCount > 0 && (
          <Badge tone="accent" className="ml-1">
            {filterCount}
          </Badge>
        )}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-11 flex-1 justify-center gap-2 truncate"
        onClick={onSortClick}
      >
        <ArrowDownUp className="h-4 w-4 shrink-0" />
        <span className="truncate">{sortLabel ?? "Urutkan"}</span>
      </Button>
    </div>
  ),
)
MobileFilterSortBar.displayName = "MobileFilterSortBar"
