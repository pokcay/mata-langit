import * as React from "react"
import { Home, Inbox, LayoutDashboard, Mail, Palette, Table2, Users } from "lucide-react"
import { usePage } from "@inertiajs/react"
import { MainNav, type NavItemDef } from "@/components/MainNav"
import type { PageProps } from "@/types/inertia"

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { props } = usePage<PageProps>()
  const unreadCount = props.admin_inbox_unread_count ?? 0

  const adminNavItems: NavItemDef[] = [
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
      href: "/admin/timeseries/uploads",
      icon: Table2,
      label: "Timeseries",
      match: (url) => url.startsWith("/admin/timeseries"),
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
      <main className="min-w-0 flex-1 px-6 pb-8 pt-16 sm:px-10 lg:py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  )
}
