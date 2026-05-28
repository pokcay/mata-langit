// bm-design-system: mobile filter bottom sheet — draft + Apply / Reset pattern
import * as React from "react"
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"

export interface MobileFilterSheetProps<T extends Record<string, unknown>> {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: T
  onApply: (values: T) => void
  onReset: () => void
  title?: string
  applyLabel?: string
  resetLabel?: string
  children: (draft: T, setDraft: React.Dispatch<React.SetStateAction<T>>) => React.ReactNode
}

export function MobileFilterSheet<T extends Record<string, unknown>>({
  open,
  onOpenChange,
  initial,
  onApply,
  onReset,
  title = "Filter",
  applyLabel = "Terapkan",
  resetLabel = "Reset",
  children,
}: MobileFilterSheetProps<T>) {
  const [draft, setDraft] = React.useState<T>(initial)

  // Reseed draft whenever the sheet opens or the upstream filters change.
  React.useEffect(() => {
    if (open) setDraft(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>{title}</BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetBody>
          <div className="space-y-4">{children(draft, setDraft)}</div>
        </BottomSheetBody>
        <BottomSheetFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(initial)
              onReset()
            }}
          >
            {resetLabel}
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => onApply(draft)}
          >
            {applyLabel}
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  )
}
