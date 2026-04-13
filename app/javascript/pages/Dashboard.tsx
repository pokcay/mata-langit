import { Head } from "@inertiajs/react"

import { AppShell } from "@/components/app-shell"

export default function Dashboard() {
  return (
    <>
      <Head title="Home" />
      <AppShell title="Home">
        <p className="text-base">Welcome to your account.</p>
      </AppShell>
    </>
  )
}
