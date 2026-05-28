import * as React from "react"
import { Head, Link, router, usePage } from "@inertiajs/react"
import { ArrowLeft } from "lucide-react"
import { AdminShell } from "@/components/AdminShell"
import { Button } from "@/components/ui/button"
import type { PageProps } from "@/types/inertia"

type EmailDetail = {
  id: number
  from: string
  to: string
  reply_to: string | null
  subject: string | null
  received_at: string
  read: boolean
  archived: boolean
  body_html: string | null
  body_text: string | null
}

type BodyView = "html" | "text"

export default function AdminInboxShow() {
  const { props } = usePage<PageProps<{ email: EmailDetail }>>()
  const { email } = props

  const hasHtml = !!email.body_html
  const hasText = !!email.body_text
  const defaultView: BodyView = hasHtml ? "html" : "text"
  const [bodyView, setBodyView] = React.useState<BodyView>(defaultView)

  const notice = props.flash?.notice
  const alert = props.flash?.alert

  function act(actionType: string) {
    router.patch(`/admin/inbox/${email.id}`, { action_type: actionType })
  }

  return (
    <>
      <Head title={email.subject ?? "(no subject)"}>
        <meta name="description" content="View an inbound email in the admin inbox." />
        <meta property="og:title" content={email.subject ?? "(no subject)"} />
        <meta property="og:description" content="View an inbound email in the admin inbox." />
      </Head>
      <AdminShell>
        <div className="mb-2">
          <Link
            href="/admin/inbox"
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted no-underline hover:text-ink-display"
          >
            <ArrowLeft className="h-4 w-4" />
            Inbox
          </Link>
        </div>

        {notice && <p className="mb-4 text-sm text-accent">{notice}</p>}
        {alert && <p className="mb-4 text-sm text-danger-display">{alert}</p>}

        <div className="border-b border-hairline pb-6">
          <h1 className="mb-4">{email.subject ?? "(no subject)"}</h1>

          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-muted">From</dt>
            <dd className="text-ink-body">{email.from}</dd>
            <dt className="text-ink-muted">To</dt>
            <dd className="text-ink-body">{email.to}</dd>
            {email.reply_to && (
              <>
                <dt className="text-ink-muted">Reply-To</dt>
                <dd className="text-ink-body">{email.reply_to}</dd>
              </>
            )}
            <dt className="text-ink-muted">Received</dt>
            <dd className="text-ink-body">{formatDateTime(email.received_at)}</dd>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {email.read && (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => act("mark_unread")}
              >
                Mark as unread
              </Button>
            )}
            {email.archived ? (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => act("restore")}
              >
                Restore to inbox
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => act("archive")}
              >
                Archive
              </Button>
            )}
          </div>
        </div>

        {hasHtml && hasText && (
          <div className="mt-4 flex gap-1 border-b border-hairline">
            {(["html", "text"] as BodyView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setBodyView(v)}
                className={[
                  "px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors uppercase",
                  bodyView === v
                    ? "border-accent text-accent"
                    : "border-transparent text-ink-muted hover:text-ink-body",
                ].join(" ")}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6">
          {bodyView === "html" && hasHtml ? (
            <iframe
              sandbox="allow-same-origin"
              srcDoc={email.body_html!}
              title="Email body"
              className="w-full rounded-md border border-hairline"
              style={{ height: "600px", border: 0 }}
            />
          ) : hasText ? (
            <pre className="whitespace-pre-wrap rounded-md border border-hairline bg-page p-4 font-mono text-sm text-ink-body">
              {email.body_text}
            </pre>
          ) : (
            <p className="text-sm text-ink-muted">(no body)</p>
          )}
        </div>
      </AdminShell>
    </>
  )
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
