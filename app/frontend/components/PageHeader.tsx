import * as React from "react"
import { Link } from "@inertiajs/react"
import { ArrowLeft, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export type PageHeaderAction = {
  label: string
  onSelect?: () => void
  href?: string
  destructive?: boolean
}

type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  /**
   * Either pre-rendered JSX (kept stacked-below-on-mobile by the existing
   * flex layout) or a list of action descriptors. When 3+ descriptors are
   * passed, they collapse into a single "Aksi" dropdown trigger below `sm`.
   */
  actions?: React.ReactNode | PageHeaderAction[]
  tabs?: React.ReactNode
  /** Optional back affordance shown above the title on mobile (≥ 44 px hit area). */
  backHref?: string
  backLabel?: string
}

export function PageHeader({
  title,
  description,
  actions,
  tabs,
  backHref,
  backLabel = "Back",
}: PageHeaderProps) {
  const isActionList = Array.isArray(actions)
  const collapses = isActionList && (actions as PageHeaderAction[]).length >= 3

  return (
    <div>
      {backHref && (
        <div className="sm:hidden">
          <Link
            href={backHref}
            className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted no-underline hover:text-ink-display"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {backHref && (
            <div className="hidden sm:block">
              <Link
                href={backHref}
                className="-ml-1 mb-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-ink-muted no-underline hover:text-ink-display"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {backLabel}
              </Link>
            </div>
          )}
          <h1>{title}</h1>
          {description && <p className="mt-1">{description}</p>}
        </div>
        {actions && (
          <ActionsSlot actions={actions} collapses={collapses} isList={isActionList} />
        )}
      </div>
      {tabs}
    </div>
  )
}

function ActionsSlot({
  actions,
  collapses,
  isList,
}: {
  actions: React.ReactNode | PageHeaderAction[]
  collapses: boolean
  isList: boolean
}) {
  if (!isList) {
    return <div className="flex flex-wrap items-center gap-2">{actions as React.ReactNode}</div>
  }
  const list = actions as PageHeaderAction[]
  if (!collapses) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {list.map((a, i) => (
          <ActionButton key={i} action={a} primary={i === list.length - 1} />
        ))}
      </div>
    )
  }
  // 3+ actions: collapse into a single "Aksi" dropdown below sm
  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {list.map((a, i) => (
          <ActionButton key={i} action={a} primary={i === list.length - 1} />
        ))}
      </div>
      <div className="sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="w-full justify-between gap-2">
              Aksi
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            {list.map((a, i) => (
              <DropdownMenuItem
                key={i}
                destructive={a.destructive}
                onSelect={() => a.onSelect?.()}
                className="min-h-11"
              >
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}

function ActionButton({ action, primary }: { action: PageHeaderAction; primary: boolean }) {
  const variant = action.destructive ? "danger" : primary ? "primary" : "secondary"
  if (action.href) {
    return (
      <Button asChild variant={variant}>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    )
  }
  return (
    <Button variant={variant} onClick={action.onSelect}>
      {action.label}
    </Button>
  )
}
