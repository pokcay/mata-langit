import { Head } from "@inertiajs/react"

import { AppShell } from "@/components/app-shell"

export default function Settings() {
  return (
    <>
      <Head title="Settings" />
      <AppShell title="Settings">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Application settings will go here.
          </p>
        </div>
      </AppShell>
    </>
  )
}
