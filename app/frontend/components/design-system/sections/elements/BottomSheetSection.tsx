import { SectionShell } from "@/components/design-system/SectionShell"
import { Button } from "@/components/ui/button"
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet"
import { Checkbox } from "@/components/ui/checkbox"

const code = `import {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetClose,
} from "@/components/ui/bottom-sheet"

<BottomSheet>
  <BottomSheetTrigger asChild>
    <Button variant="secondary">Open filter</Button>
  </BottomSheetTrigger>
  <BottomSheetContent>
    <BottomSheetHeader>
      <BottomSheetTitle>Filter</BottomSheetTitle>
    </BottomSheetHeader>
    <BottomSheetBody>
      {/* scrollable form content */}
    </BottomSheetBody>
    <BottomSheetFooter>
      <BottomSheetClose asChild>
        <Button variant="ghost">Reset</Button>
      </BottomSheetClose>
      <Button className="flex-1">Terapkan</Button>
    </BottomSheetFooter>
  </BottomSheetContent>
</BottomSheet>`

export function BottomSheetSection() {
  return (
    <SectionShell
      id="bottom-sheet"
      title="Bottom sheet"
      description={
        <>
          A slide-up sheet anchored to the bottom of the viewport. Built on
          Radix Dialog so it inherits the focus-trap, escape-to-close, body
          scroll-lock, and backdrop-click behaviour. Adds a swipe-down-to-close
          gesture on the header/grabber. Use for mobile-only Filter, Sort, and
          other surfaces that would be a centered modal on desktop but read
          better as a sheet on a phone.
        </>
      }
      whenToUse={
        <ul>
          <li>Mobile Filter / Sort controls (Milestone 2 of this feature).</li>
          <li>Any mobile-only surface that needs sticky header + footer slots.</li>
          <li>When you want a sheet on every viewport (desktop too) — pass through and it still renders pinned to the bottom edge.</li>
        </ul>
      }
      whenNotToUse={
        <ul>
          <li>Standard confirmation dialogs — use <code>&lt;Dialog&gt;</code>. Below <code>md</code> it already renders as a sheet automatically.</li>
          <li>Surfaces a user might want to leave open while interacting with the page — use a pinned panel or inline section instead.</li>
        </ul>
      }
      preview={
        <div className="flex flex-wrap items-center gap-3">
          <BottomSheet>
            <BottomSheetTrigger asChild>
              <Button variant="secondary">Open filter sheet</Button>
            </BottomSheetTrigger>
            <BottomSheetContent>
              <BottomSheetHeader>
                <BottomSheetTitle>Filter</BottomSheetTitle>
              </BottomSheetHeader>
              <BottomSheetBody>
                <div className="space-y-4">
                  <label className="flex items-center gap-2 text-sm font-normal text-ink-body">
                    <Checkbox defaultChecked /> Region: Jabodetabek
                  </label>
                  <label className="flex items-center gap-2 text-sm font-normal text-ink-body">
                    <Checkbox defaultChecked /> Region: Jawa Tengah
                  </label>
                  <label className="flex items-center gap-2 text-sm font-normal text-ink-body">
                    <Checkbox /> Region: Sumatera
                  </label>
                  <label className="flex items-center gap-2 text-sm font-normal text-ink-body">
                    <Checkbox /> Region: Sulawesi
                  </label>
                </div>
              </BottomSheetBody>
              <BottomSheetFooter>
                <BottomSheetClose asChild>
                  <Button variant="ghost">Reset</Button>
                </BottomSheetClose>
                <Button className="flex-1">Terapkan</Button>
              </BottomSheetFooter>
            </BottomSheetContent>
          </BottomSheet>
        </div>
      }
      code={code}
      options={
        <ul className="list-disc pl-5">
          <li><code>grabber</code> on <code>&lt;BottomSheetContent&gt;</code> — show/hide the small drag handle at the top. Default <code>true</code>.</li>
          <li><code>hideClose</code> on <code>&lt;BottomSheetContent&gt;</code> — hide the corner X button when content has its own close affordance.</li>
          <li>The header is also a drag handle — pointer-down anywhere on it begins a swipe-to-close gesture (closes when dragged more than 80&nbsp;px down).</li>
          <li>Body uses <code>min-h-0 flex-1 overflow-y-auto</code> so long content scrolls inside the sheet while header + footer stay sticky.</li>
          <li>Footer respects <code>env(safe-area-inset-bottom)</code> so it sits above iOS home-bar.</li>
        </ul>
      }
    />
  )
}
