import type { ReactNode } from "react"

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </main>
  )
}
