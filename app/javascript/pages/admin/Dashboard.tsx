import { Head, Link } from "@inertiajs/react"
import { Inbox, Users } from "lucide-react"
import { AdminShell } from "@/components/AdminShell"

type Stats = {
  total_users: number
  admin_users: number
  new_users_this_week: number
  new_users_this_month: number
  inbox_unread: number
  inbox_total: number
}

type UserRow = {
  id: number
  email: string
  admin: boolean
  created_at: string
}

type Props = {
  stats: Stats
  recent_users: UserRow[]
}

export default function AdminDashboard({ stats, recent_users }: Props) {
  return (
    <>
      <Head title="Dashboard">
        <meta name="description" content="Admin dashboard overview." />
        <meta property="og:title" content="Dashboard" />
        <meta property="og:description" content="Admin dashboard overview." />
      </Head>
      <AdminShell>
        <div className="border-b border-hairline pb-6">
          <h1>Dashboard</h1>
          <p className="mt-1">Overview of your app.</p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total users"
            value={stats.total_users}
            href="/admin/users"
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="New this week"
            value={stats.new_users_this_week}
            href="/admin/users"
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="New this month"
            value={stats.new_users_this_month}
            href="/admin/users"
            icon={<Users className="h-4 w-4" />}
          />
          <StatCard
            label="Unread emails"
            value={stats.inbox_unread}
            href="/admin/inbox"
            icon={<Inbox className="h-4 w-4" />}
          />
          <StatCard
            label="Total emails"
            value={stats.inbox_total}
            href="/admin/inbox"
            icon={<Inbox className="h-4 w-4" />}
          />
          <StatCard
            label="Admin users"
            value={stats.admin_users}
            href="/admin/users"
            icon={<Users className="h-4 w-4" />}
          />
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2>Recent users</h2>
            <Link href="/admin/users" className="text-sm text-ink-muted no-underline hover:text-ink-display">
              View all
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-page">
            {recent_users.map((user) => (
              <li key={user.id}>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="flex items-center justify-between px-4 py-3 no-underline hover:bg-surface"
                >
                  <div>
                    <div className="text-sm font-medium text-ink-display">{user.email}</div>
                    <div className="text-xs text-ink-muted">Joined {formatDate(user.created_at)}</div>
                  </div>
                  {user.admin && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      Admin
                    </span>
                  )}
                </Link>
              </li>
            ))}
            {recent_users.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-muted">No users yet.</li>
            )}
          </ul>
        </div>
      </AdminShell>
    </>
  )
}

function StatCard({
  label,
  value,
  href,
  icon,
}: {
  label: string
  value: number
  href: string
  icon: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-surface p-4 no-underline hover:bg-surface/80"
    >
      <div className="flex items-center justify-between text-ink-muted">
        <span className="text-xs">{label}</span>
        {icon}
      </div>
      <span className="text-2xl font-semibold text-ink-display">{value}</span>
    </Link>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
