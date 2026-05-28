// bm-design-system: bottom-sheet primitive
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const BottomSheet = DialogPrimitive.Root
const BottomSheetTrigger = DialogPrimitive.Trigger
const BottomSheetPortal = DialogPrimitive.Portal
const BottomSheetClose = DialogPrimitive.Close

const BottomSheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("modal-overlay", className)}
    {...props}
  />
))
BottomSheetOverlay.displayName = "BottomSheetOverlay"

interface BottomSheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Show the small drag handle (grabber) at the top of the sheet. Defaults to true. */
  grabber?: boolean
  /** Hide the X close button (e.g. when the sheet content has its own close affordance). */
  hideClose?: boolean
}

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  BottomSheetContentProps
>(({ className, children, grabber = true, hideClose = false, ...props }, ref) => {
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const dragStartY = React.useRef<number | null>(null)
  const dragOffset = React.useRef(0)

  // Merge external ref with our local ref
  React.useImperativeHandle(ref, () => contentRef.current as HTMLDivElement)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only initiate swipe-to-close from the grabber/header area
    const target = e.target as HTMLElement
    if (!target.closest("[data-bottom-sheet-handle]")) return
    dragStartY.current = e.clientY
    dragOffset.current = 0
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return
    const delta = e.clientY - dragStartY.current
    if (delta <= 0) {
      // Only allow downward drag
      if (contentRef.current) contentRef.current.style.transform = "translateY(0)"
      dragOffset.current = 0
      return
    }
    dragOffset.current = delta
    if (contentRef.current) contentRef.current.style.transform = `translateY(${delta}px)`
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return
    dragStartY.current = null
    const delta = dragOffset.current
    if (contentRef.current) contentRef.current.style.transform = ""
    if (delta > 80) {
      // Trigger close via Escape — Radix listens for it and animates out cleanly
      const closeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      document.dispatchEvent(closeEvent)
    }
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* no-op */
    }
  }

  return (
    <BottomSheetPortal>
      <BottomSheetOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        className={cn("bottom-sheet", className)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        {...props}
      >
        {grabber && (
          <div data-bottom-sheet-handle className="cursor-grab touch-none">
            <div className="bottom-sheet-grabber" />
          </div>
        )}
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute right-2 top-2 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-ink-muted hover:text-ink-display focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </BottomSheetPortal>
  )
})
BottomSheetContent.displayName = "BottomSheetContent"

const BottomSheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-bottom-sheet-handle className={cn("bottom-sheet-header", className)} {...props} />
)
BottomSheetHeader.displayName = "BottomSheetHeader"

const BottomSheetBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("bottom-sheet-body", className)} {...props} />
)
BottomSheetBody.displayName = "BottomSheetBody"

const BottomSheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("bottom-sheet-footer", className)} {...props} />
)
BottomSheetFooter.displayName = "BottomSheetFooter"

const BottomSheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("bottom-sheet-title", className)}
    {...props}
  />
))
BottomSheetTitle.displayName = "BottomSheetTitle"

const BottomSheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-ink-muted", className)}
    {...props}
  />
))
BottomSheetDescription.displayName = "BottomSheetDescription"

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
}
