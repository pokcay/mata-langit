import * as React from "react"
import { Database, Grid3x3, Home, Inbox, LayoutDashboard, Mail, Package, Palette, PieChart, ShieldCheck, ShoppingCart, Store, Table2, TrendingUp, Users } from "lucide-react"
import { usePage } from "@inertiajs/react"
import { MainNav, type NavEntry } from "@/components/MainNav"
import type { PageProps } from "@/types/inertia"
import { cn } from "@/lib/utils"

export function AdminShell({ children, full }: { children: React.ReactNode; full?: boolean }) {
  const { props } = usePage<PageProps>()
  const unreadCount = props.admin_inbox_unread_count ?? 0
  const integrityMismatchCount = props.data_integrity_mismatch_count ?? 0

  const adminNavItems: NavEntry[] = [
    {
      href: "/",
      icon: Home,
      label: "App Home",
      match: () => false,
    },
    {
      href: "/admin",
      icon: LayoutDashboard,
      label: "Dashboard",
      match: (url) => url === "/admin" || url === "/admin/",
    },
    {
      href: "/admin/users",
      icon: Users,
      label: "Users",
      match: (url) => url.startsWith("/admin/users"),
    },
    {
      href: "/admin/inbox",
      icon: Inbox,
      label: "Inbox",
      match: (url) => url.startsWith("/admin/inbox"),
      badge: unreadCount > 0 ? String(unreadCount) : undefined,
    },
    {
      type: "group",
      icon: Database,
      label: "Data",
      storageKey: "admin-nav-data-group",
      matchGroup: (url) =>
        url.startsWith("/admin/timeseries") ||
        url.startsWith("/admin/master-outlet-dist") ||
        url.startsWith("/admin/master-product-dist") ||
        url.startsWith("/admin/trans-sellout-account") ||
        url.startsWith("/admin/market-share-b2b") ||
        url.startsWith("/admin/data") ||
        url.startsWith("/admin/pivot"),
      children: [
        {
          href: "/admin/timeseries/uploads",
          icon: Table2,
          label: "Timeseries",
          match: (url) => url.startsWith("/admin/timeseries"),
        },
        {
          href: "/admin/master-outlet-dist/uploads",
          icon: Store,
          label: "Master Outlet Dist",
          match: (url) => url.startsWith("/admin/master-outlet-dist"),
        },
        {
          href: "/admin/master-product-dist/uploads",
          icon: Package,
          label: "Master Product Dist",
          match: (url) => url.startsWith("/admin/master-product-dist"),
        },
        {
          href: "/admin/trans-sellout-account/uploads",
          icon: ShoppingCart,
          label: "Trans Sellout Account",
          match: (url) => url.startsWith("/admin/trans-sellout-account"),
        },
        {
          href: "/admin/market-share-b2b/uploads",
          icon: PieChart,
          label: "Market Share B2B",
          match: (url) => url.startsWith("/admin/market-share-b2b"),
        },
        {
          href: "/admin/data/ka-profitability/uploads",
          icon: TrendingUp,
          label: "KA Profitability",
          match: (url) => url.startsWith("/admin/data/ka-profitability"),
        },
        {
          href: "/admin/pivot",
          icon: Grid3x3,
          label: "Pivot",
          match: (url) => url.startsWith("/admin/pivot"),
        },
        {
          href: "/admin/data/integrity",
          icon: ShieldCheck,
          label: "Data Integrity",
          match: (url) => url.startsWith("/admin/data/integrity"),
          badge: integrityMismatchCount > 0 ? String(integrityMismatchCount) : undefined,
        },
      ],
    },
    {
      href: "/admin/email-templates",
      icon: Mail,
      label: "Email templates",
      match: (url) => url.startsWith("/admin/email-templates"),
    },
    {
      href: "/admin/design-system",
      icon: Palette,
      label: "Design System",
      match: (url) => url.startsWith("/admin/design-system"),
    },
  ]

  return (
    <div className="flex min-h-screen bg-page text-ink-body">
      <MainNav items={adminNavItems} brandHref="/admin" />
      <main className={cn("min-w-0 flex-1 pt-16 lg:pt-0", full ? "overflow-hidden" : "px-6 pb-24 sm:px-10 lg:py-8 lg:pb-8")}>
        {full ? children : <div className="mx-auto max-w-5xl">{children}</div>}
      </main>
    </div>
  )
}
