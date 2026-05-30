import * as React from "react"
import { Link, router, usePage } from "@inertiajs/react"
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Home,
  LogOut,
  Menu,
  Settings,
  Shield,
  User,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"
import type { PageProps } from "@/types/inertia"

const DRAWER_HISTORY_STATE = "main-nav-drawer-open"

const STORAGE_KEY = "main-nav-open"
const BRAND = "Mata Langit"

export type NavItemDef = {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  match: (url: string) => boolean
  badge?: string
}

export type NavGroupDef = {
  type: "group"
  icon: React.ComponentType<{ className?: string }>
  label: string
  storageKey: string
  matchGroup: (url: string) => boolean
  children: NavItemDef[]
}

export type NavEntry = NavItemDef | NavGroupDef

const DEFAULT_NAV_ITEMS: NavEntry[] = [
  {
    href: "/dashboard",
    icon: Home,
    label: "Home",
    match: (url) => url === "/" || url.startsWith("/dashboard"),
  },
]

function useMainNavOpen() {
  const [open, setOpen] = React.useState<boolean>(true)
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setOpen(stored === "true")
  }, [])
  React.useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(STORAGE_KEY, String(open))
  }, [open])
  return [open, setOpen] as const
}

export function MainNav({
  items = DEFAULT_NAV_ITEMS,
  brandHref = "/dashboard",
}: {
  items?: NavEntry[]
  brandHref?: string
} = {}) {
  const [open, setOpen] = useMainNavOpen()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const openMobile = React.useCallback(() => {
    setMobileOpen(true)
    if (typeof window !== "undefined") {
      try {
        window.history.pushState({ [DRAWER_HISTORY_STATE]: true }, "")
      } catch {
        /* no-op */
      }
    }
  }, [])

  const closeMobile = React.useCallback((opts?: { fromPopState?: boolean }) => {
    setMobileOpen(false)
    if (typeof window !== "undefined" && !opts?.fromPopState) {
      // If we pushed a history entry to open, pop it so the URL stays clean
      const state = window.history.state as Record<string, unknown> | null
      if (state && state[DRAWER_HISTORY_STATE]) {
        try {
          window.history.back()
        } catch {
          /* no-op */
        }
      }
    }
  }, [])

  // Close triggered by tapping a nav link / the brand: the page is about to
  // change via Inertia, which pushes its own history entry. We must NOT call
  // history.back() here — doing both on the same tap races, and the back()
  // traversal lands the user on the previous page instead of the one they
  // tapped. Just hide the drawer and let Inertia handle navigation + history.
  const closeForNavigation = React.useCallback(() => {
    setMobileOpen(false)
  }, [])

  // Browser back closes the drawer instead of navigating
  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (!mobileOpen) return
    const onPop = () => closeMobile({ fromPopState: true })
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [mobileOpen, closeMobile])

  // Body scroll lock while drawer is open
  React.useEffect(() => {
    if (typeof document === "undefined") return
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])

  // Swipe-left-to-close gesture
  const touchStart = React.useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = Math.abs(t.clientY - touchStart.current.y)
    if (dx < -60 && dy < 40) {
      touchStart.current = null
      closeMobile()
    }
  }

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-hairline bg-page transition-[width] duration-200 lg:flex",
          open ? "w-64" : "w-14",
        )}
      >
        <RailBody
          open={open}
          onToggle={() => setOpen(!open)}
          onExpandSidebar={() => setOpen(true)}
          items={items}
          brandHref={brandHref}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-display/40 backdrop-blur-sm"
            onClick={() => closeMobile()}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            className="absolute left-0 top-0 flex h-full w-full flex-col bg-page shadow-xl"
            style={{
              animation: "drawer-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Brand bar */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-3">
              <Link
                href={brandHref}
                onClick={closeForNavigation}
                className="flex items-center gap-2 text-ink-display no-underline"
                aria-label={BRAND}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-faded font-display text-base font-semibold text-accent">
                  {BRAND.charAt(0)}
                </span>
                <span className="font-display text-base font-semibold">
                  {BRAND}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => closeMobile()}
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink-display"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable nav body — every row ≥ 48 px */}
            <MobileNavBody items={items} onNavigate={closeForNavigation} />

            {/* Account section */}
            <MobileAccountBlock onNavigate={closeForNavigation} />
          </aside>
        </div>
      )}

      <button
        type="button"
        onClick={openMobile}
        className="fixed left-3 top-3 z-30 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-hairline bg-page text-ink-body hover:bg-surface lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
    </>
  )
}

/**
 * Mobile-only nav body: every entry is at least 48 px tall, NavGroups are
 * rendered in always-expanded form so all sub-items are immediately visible
 * with indent. Tapping any item calls onNavigate (which closes the drawer).
 */
function MobileNavBody({
  items,
  onNavigate,
}: {
  items: NavEntry[]
  onNavigate: () => void
}) {
  const { url } = usePage()
  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3 text-base">
      {items.map((entry) => {
        if ("type" in entry && entry.type === "group") {
          const Icon = entry.icon
          return (
            <div key={entry.storageKey} className="mt-2 first:mt-0">
              <div className="flex items-center gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{entry.label}</span>
              </div>
              <div className="ml-2 flex flex-col gap-0.5 border-l border-hairline pl-3">
                {entry.children.map((child) => (
                  <MobileNavRow
                    key={child.href}
                    href={child.href}
                    icon={child.icon}
                    label={child.label}
                    badge={child.badge}
                    active={child.match(url)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          )
        }
        const item = entry as NavItemDef
        return (
          <MobileNavRow
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            badge={item.badge}
            active={item.match(url)}
            onNavigate={onNavigate}
          />
        )
      })}
    </nav>
  )
}

function MobileNavRow({
  href,
  icon: Icon,
  label,
  badge,
  active,
  onNavigate,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: string
  active?: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-base no-underline",
        active
          ? "bg-accent-faded text-accent-display"
          : "text-ink-body hover:bg-surface hover:text-ink-display",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && (
        <span className="shrink-0 rounded-full bg-danger-faded px-2 py-0.5 text-xs font-semibold text-danger-display">
          {badge}
        </span>
      )}
    </Link>
  )
}

/**
 * Account block at the bottom of the mobile drawer:
 *  - email avatar row
 *  - Profile, Settings
 *  - Theme toggle (block)
 *  - Sign out
 * Every row ≥ 48 px.
 */
function MobileAccountBlock({ onNavigate }: { onNavigate: () => void }) {
  const { props } = usePage<PageProps>()
  const email = props.current_user?.email ?? ""
  const isAdmin = props.current_user?.admin ?? false
  const initial = email.charAt(0).toUpperCase() || "?"

  return (
    <div
      className="shrink-0 border-t border-hairline bg-page p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex min-h-12 items-center gap-3 px-3 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-faded text-sm font-semibold text-accent">
          {initial}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-body">{email}</span>
      </div>

      <Link
        href="/profile"
        onClick={onNavigate}
        className="flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-base text-ink-body no-underline hover:bg-surface"
      >
        <User className="h-5 w-5 shrink-0" />
        Profile
      </Link>
      <Link
        href="/settings"
        onClick={onNavigate}
        className="flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-base text-ink-body no-underline hover:bg-surface"
      >
        <Settings className="h-5 w-5 shrink-0" />
        Settings
      </Link>

      {isAdmin && (
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-base text-ink-body no-underline hover:bg-surface"
        >
          <Shield className="h-5 w-5 shrink-0" />
          Admin area
        </Link>
      )}

      <div className="py-2">
        <ThemeToggle block />
      </div>

      <button
        type="button"
        onClick={() => {
          onNavigate()
          router.delete("/logout")
        }}
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-base text-ink-body hover:bg-surface"
      >
        <LogOut className="h-5 w-5 shrink-0" />
        Sign out
      </button>
    </div>
  )
}

function RailBody({
  open,
  onToggle,
  onExpandSidebar,
  items,
  brandHref,
}: {
  open: boolean
  onToggle: () => void
  onExpandSidebar: () => void
  items: NavEntry[]
  brandHref: string
}) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3">
        <Link
          href={brandHref}
          className="flex min-w-0 items-center gap-2 text-ink-display no-underline"
          aria-label={BRAND}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-faded font-display text-sm font-semibold text-accent">
            {BRAND.charAt(0)}
          </span>
          {open && (
            <span className="truncate font-display text-sm font-semibold">
              {BRAND}
            </span>
          )}
        </Link>
        {open && (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink-display"
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {!open && (
        <div className="border-b border-hairline p-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-full cursor-pointer items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink-display"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <RailNav open={open} items={items} onExpandSidebar={onExpandSidebar} />

      <div className="border-t border-hairline p-2">
        <UserMenu open={open} />
      </div>
    </>
  )
}

function RailNav({
  open,
  items,
  onClose,
  onExpandSidebar,
}: {
  open: boolean
  items: NavEntry[]
  onClose?: () => void
  onExpandSidebar?: () => void
}) {
  const { url } = usePage()
  return (
    <nav
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 p-2 text-sm",
        open ? "overflow-x-hidden overflow-y-auto" : "overflow-visible",
      )}
    >
      {items.map((item) =>
        "type" in item && item.type === "group" ? (
          <NavGroup
            key={item.storageKey}
            group={item}
            currentUrl={url}
            open={open}
            onExpandSidebar={onExpandSidebar}
            onClose={onClose}
          />
        ) : (
          <NavItem
            key={(item as NavItemDef).href}
            href={(item as NavItemDef).href}
            icon={(item as NavItemDef).icon}
            label={(item as NavItemDef).label}
            badge={(item as NavItemDef).badge}
            active={(item as NavItemDef).match(url)}
            open={open}
            onClick={onClose}
          />
        )
      )}
    </nav>
  )
}

function NavGroup({
  group,
  currentUrl,
  open,
  onExpandSidebar,
  onClose,
}: {
  group: NavGroupDef
  currentUrl: string
  open: boolean
  onExpandSidebar?: () => void
  onClose?: () => void
}) {
  const isGroupActive = group.matchGroup(currentUrl)
  const [expanded, setExpanded] = React.useState<boolean>(isGroupActive)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(group.storageKey)
    if (stored !== null) {
      setExpanded(stored === "true")
    } else {
      setExpanded(isGroupActive)
    }
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(group.storageKey, String(expanded))
  }, [group.storageKey, expanded])

  // Auto-expand group when navigating to a child route
  React.useEffect(() => {
    if (isGroupActive && !expanded) setExpanded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl])

  const Icon = group.icon

  if (!open) {
    return (
      <div className="group/nav-item relative">
        <button
          type="button"
          aria-label={group.label}
          onClick={onExpandSidebar}
          className={cn(
            "mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-md",
            isGroupActive
              ? "bg-accent-faded text-accent-display"
              : "text-ink-body hover:bg-surface hover:text-ink-display",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-[13px] -translate-y-1/2 whitespace-nowrap rounded-md border border-hairline bg-page px-2 py-1 text-xs font-medium text-ink-display opacity-0 shadow-sm transition-opacity group-hover/nav-item:opacity-100"
        >
          {group.label}
        </span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
          isGroupActive && !expanded
            ? "text-accent-display hover:bg-accent-faded"
            : "text-ink-muted hover:bg-surface hover:text-ink-display",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-200",
            expanded ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-3">
          {group.children.map((child) => (
            <NavItem
              key={child.href}
              href={child.href}
              icon={child.icon}
              label={child.label}
              badge={child.badge}
              active={child.match(currentUrl)}
              open={open}
              onClick={onClose}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NavItem({
  href,
  icon: Icon,
  label,
  badge,
  active,
  open,
  onClick,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: string
  active?: boolean
  open: boolean
  onClick?: () => void
}) {
  return (
    <div className="group/nav-item relative">
      <Link
        href={href}
        onClick={onClick}
        aria-label={open ? undefined : label}
        className={cn(
          "flex items-center gap-3 rounded-md no-underline",
          open ? "px-3 py-2" : "mx-auto h-9 w-9 justify-center",
          active
            ? "bg-accent-faded text-accent-display"
            : "text-ink-body hover:bg-surface hover:text-ink-display",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {open && (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate">{label}</span>
            {badge && (
              <span className="ml-auto shrink-0 rounded-full bg-danger-faded px-1.5 py-0.5 text-xs font-semibold text-danger-display">
                {badge}
              </span>
            )}
          </span>
        )}
      </Link>
      {!open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-[13px] -translate-y-1/2 whitespace-nowrap rounded-md border border-hairline bg-page px-2 py-1 text-xs font-medium text-ink-display opacity-0 shadow-sm transition-opacity group-hover/nav-item:opacity-100"
        >
          {label}
        </span>
      )}
    </div>
  )
}

function UserMenu({ open }: { open: boolean }) {
  const { props } = usePage<PageProps>()
  const email = props.current_user?.email ?? ""
  const isAdmin = props.current_user?.admin ?? false
  const initial = email.charAt(0).toUpperCase() || "?"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={open ? undefined : email || "Account"}
          className={cn(
            "group/user relative flex w-full cursor-pointer items-center gap-3 rounded-md text-left text-ink-body hover:bg-surface hover:text-ink-display focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            open ? "px-2 py-2" : "h-10 justify-center",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-faded text-xs font-semibold text-accent">
            {initial}
          </span>
          {open ? (
            <span className="min-w-0 flex-1 truncate text-sm">{email}</span>
          ) : (
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-hairline bg-page px-2 py-1 text-xs font-medium text-ink-display opacity-0 shadow-md transition-opacity group-hover/user:opacity-100">
              {email}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block text-[10px] uppercase tracking-wider text-ink-muted">
            Signed in as
          </span>
          <span className="block truncate text-xs font-medium text-ink-display">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="no-underline">
            <User /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="no-underline">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-2">
          <ThemeToggle block />
        </div>
        <DropdownMenuSeparator />
        {isAdmin && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin" className="no-underline">
                <Shield /> Admin area
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            router.delete("/logout")
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
