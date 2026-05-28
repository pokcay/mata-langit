// bm-design-system: mobile sort bottom sheet — immediate-apply radio list
import * as React from "react"
import { Check } from "lucide-react"
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"

export type SortOption = {
  sort: string
  direction: "asc" | "desc"
  label: React.ReactNode
}

export interface MobileSortSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: { sort: string | null | undefined; direction: "asc" | "desc" | null | undefined }
  options: SortOption[]
  onSelect: (option: SortOption) => void
  title?: string
}

export function MobileSortSheet({
  open,
  onOpenChange,
  current,
  options,
  onSelect,
  title = "Urutkan",
}: MobileSortSheetProps) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>{title}</BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetBody>
          <ul role="radiogroup" aria-label={title} className="-mx-2">
            {options.map((opt) => {
              const active =
                opt.sort === current.sort && opt.direction === current.direction
              return (
                <li key={`${opt.sort}-${opt.direction}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onSelect(opt)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-surface",
                      active ? "text-ink-display" : "text-ink-body",
                    )}
                  >
                    <span>{opt.label}</span>
                    {active && <Check className="h-4 w-4 text-accent-display" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  )
}
