import * as React from "react"
import { usePage } from "@inertiajs/react"
import { Home, Shield } from "lucide-react"
import { MainNav, type NavItemDef } from "@/components/MainNav"
import type { PageProps } from "@/types/inertia"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { props } = usePage<PageProps>()
  const isAdmin = props.current_user?.admin ?? false

  const navItems: NavItemDef[] = [
    {
      href: "/dashboard",
      icon: Home,
      label: "Home",
      match: (url: string) => url === "/" || url.startsWith("/dashboard"),
    },
    ...(isAdmin
      ? [
          {
            href: "/admin",
            icon: Shield,
            label: "Admin",
            match: (url: string) => url.startsWith("/admin"),
          },
        ]
      : []),
  ]

  return (
    <div className="flex min-h-screen bg-page text-ink-body">
      <MainNav items={navItems} />
      <main className="min-w-0 flex-1 px-6 pb-8 pt-16 sm:px-10 lg:py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  )
}
