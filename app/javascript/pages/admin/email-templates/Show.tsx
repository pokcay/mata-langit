import * as React from "react"
import { Head, Link, router, usePage } from "@inertiajs/react"
import { marked } from "marked"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { AdminShell } from "@/components/AdminShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MobileStickyActionBar } from "@/components/ui/mobile-sticky-action-bar"
import { RichTextField, type RichTextFieldHandle } from "@/components/ui/rich-text-field"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PageProps } from "@/types/inertia"

type TemplateVariable = {
  key: string
  label: string
}

type TemplateDetail = {
  id: number
  key: string
  name: string
  description: string | null
  customized: boolean
  updated_at: string
  updater_email: string | null
  subject: string
  body_html: string | null
  body_text: string | null
}

type Props = {
  template: TemplateDetail
  variables: TemplateVariable[]
  sample_data: Record<string, string>
}

type Tab = "edit" | "preview-html" | "preview-text"

marked.setOptions({ async: false })

function substituteVars(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => data[key] ?? `{{${key}}}`)
}

function insertAtCursor(
  ref: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  text: string,
  value: string,
  setValue: (v: string) => void,
) {
  const el = ref.current
  if (!el) return
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? value.length
  const next = value.slice(0, start) + text + value.slice(end)
  setValue(next)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(start + text.length, start + text.length)
  })
}

function InsertVariableDropdown({
  variables,
  onSelect,
}: {
  variables: TemplateVariable[]
  onSelect: (key: string) => void
}) {
  if (variables.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" type="button" className="gap-1 text-xs">
          Insert variable <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {variables.map((v) => (
          <DropdownMenuItem
            key={v.key}
            onSelect={() => onSelect(v.key)}
            className="flex-col items-start gap-0"
          >
            <span className="font-mono text-xs text-ink-display">{v.key}</span>
            <span className="text-xs text-ink-muted">{v.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function AdminEmailTemplateShow() {
  const { props } = usePage<PageProps<Props>>()
  const { template, variables, sample_data } = props

  const [tab, setTab] = React.useState<Tab>("edit")
  const [subject, setSubject] = React.useState(template.subject)
  const [bodyText, setBodyText] = React.useState(template.body_text ?? "")

  const [sendTestOpen, setSendTestOpen] = React.useState(false)
  const [sendTestEmail, setSendTestEmail] = React.useState("")
  const [sendTestProcessing, setSendTestProcessing] = React.useState(false)

  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false)
  const [resetProcessing, setResetProcessing] = React.useState(false)

  const richRef = React.useRef<RichTextFieldHandle>(null)
  const subjectRef = React.useRef<HTMLInputElement>(null)
  const textRef = React.useRef<HTMLTextAreaElement>(null)

  // Track body_html value (RichTextField is uncontrolled after mount)
  const bodyHtmlRef = React.useRef(template.body_html ?? "")
  const [bodyHtml, setBodyHtml] = React.useState(template.body_html ?? "")
  function handleBodyHtmlChange(md: string) {
    bodyHtmlRef.current = md
    setBodyHtml(md)
  }

  function handleSave() {
    router.patch(`/admin/email-templates/${template.id}`, {
      email_template: {
        subject,
        body_html: bodyHtmlRef.current,
        body_text: bodyText,
      },
    })
  }

  function handleSendTest(e: React.FormEvent) {
    e.preventDefault()
    setSendTestProcessing(true)
    router.post(
      `/admin/email-templates/${template.id}/send_test`,
      { email: sendTestEmail },
      {
        onFinish: () => {
          setSendTestProcessing(false)
          setSendTestOpen(false)
          setSendTestEmail("")
        },
      },
    )
  }

  function handleResetToDefault() {
    setResetProcessing(true)
    router.post(
      `/admin/email-templates/${template.id}/reset_to_default`,
      {},
      {
        onFinish: () => {
          setResetProcessing(false)
          setResetConfirmOpen(false)
        },
      },
    )
  }

  const previewHtml = React.useMemo(() => {
    const substituted = substituteVars(bodyHtml, sample_data)
    return marked.parse(substituted) as string
  }, [bodyHtml, sample_data])

  const previewText = React.useMemo(
    () => substituteVars(bodyText, sample_data),
    [bodyText, sample_data],
  )

  const notice = props.flash?.notice
  const alert = props.flash?.alert

  return (
    <>
      <Head title={template.name}>
        <meta name="description" content={`Edit the ${template.name} email template.`} />
        <meta property="og:title" content={template.name} />
        <meta property="og:description" content={`Edit the ${template.name} email template.`} />
      </Head>
      <AdminShell>
        {/* Header */}
        <div className="border-b border-hairline pb-6">
          <Link
            href="/admin/email-templates"
            className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted no-underline hover:text-ink-display sm:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
            All templates
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1>{template.name}</h1>
                <Badge tone={template.customized ? "accent" : "neutral"}>
                  {template.customized ? "Customized" : "Default"}
                </Badge>
              </div>
              {template.description && (
                <p className="mt-1">{template.description}</p>
              )}
              <p className="mt-1 text-xs text-ink-muted">
                Last updated {relativeTime(template.updated_at)}
                {template.updater_email ? ` by ${template.updater_email}` : ""}
              </p>
            </div>
            <Link
              href="/admin/email-templates"
              className="hidden shrink-0 text-sm text-ink-muted no-underline hover:text-ink-display sm:inline"
            >
              ← All templates
            </Link>
          </div>
        </div>

        {/* Flash messages */}
        {notice && (
          <p className="mt-4 text-sm text-accent">{notice}</p>
        )}
        {alert && (
          <p className="mt-4 text-sm text-danger-display">{alert}</p>
        )}

        {/* Tab row */}
        <div className="mt-6 flex gap-1 border-b border-hairline">
          {(["edit", "preview-html", "preview-text"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors",
                tab === t
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-muted hover:text-ink-body",
              ].join(" ")}
            >
              {t === "edit" ? "Edit" : t === "preview-html" ? "Preview HTML" : "Preview Text"}
            </button>
          ))}
        </div>

        {/* Edit tab */}
        {tab === "edit" && (
          <div className="mt-6 space-y-8">
            {/* Subject */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="subject">Subject</label>
                <InsertVariableDropdown
                  variables={variables}
                  onSelect={(key) =>
                    insertAtCursor(subjectRef, key, subject, setSubject)
                  }
                />
              </div>
              <Input
                id="subject"
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
              />
            </div>

            {/* HTML body */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="body-html">HTML body</label>
                <InsertVariableDropdown
                  variables={variables}
                  onSelect={(key) => richRef.current?.insertText(key)}
                />
              </div>
              <RichTextField
                ref={richRef}
                defaultValue={template.body_html ?? ""}
                onChange={handleBodyHtmlChange}
                placeholder="Write the HTML email body using Markdown…"
                className="min-h-[200px]"
              />
              <p className="text-xs text-ink-muted">
                Tip: keep the HTML body and plain-text body in sync — they are sent as separate parts of the same email.
              </p>
            </div>

            {/* Plain-text body */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="body-text">Plain-text body</label>
                <InsertVariableDropdown
                  variables={variables}
                  onSelect={(key) =>
                    insertAtCursor(textRef, key, bodyText, setBodyText)
                  }
                />
              </div>
              <textarea
                id="body-text"
                ref={textRef}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={10}
                placeholder="Plain-text fallback for email clients that don't render HTML…"
                className="w-full rounded-md border border-hairline bg-page px-3 py-2 font-mono text-sm text-ink-body placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-page focus:border-accent"
              />
            </div>

            {/* Actions */}
            <MobileStickyActionBar>
              <Button onClick={handleSave} type="button">
                Save
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setSendTestOpen(true)}
              >
                Send test email
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setResetConfirmOpen(true)}
              >
                Reset to default
              </Button>
            </MobileStickyActionBar>
          </div>
        )}

        {/* Preview HTML tab */}
        {tab === "preview-html" && (
          <div className="mt-6">
            <p className="mb-4 text-xs text-ink-muted">
              Preview uses sample data. Save changes first to see the latest version.
            </p>
            <div className="rounded-md border border-hairline bg-page p-6">
              <p className="mb-4 text-sm font-medium text-ink-muted">
                Subject: <span className="text-ink-body">{substituteVars(subject, sample_data)}</span>
              </p>
              <hr className="mb-4 border-hairline" />
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        )}

        {/* Preview Text tab */}
        {tab === "preview-text" && (
          <div className="mt-6">
            <p className="mb-4 text-xs text-ink-muted">
              Preview uses sample data. Save changes first to see the latest version.
            </p>
            <div className="rounded-md border border-hairline bg-page p-6">
              <p className="mb-4 text-sm font-medium text-ink-muted">
                Subject: <span className="text-ink-body">{substituteVars(subject, sample_data)}</span>
              </p>
              <hr className="mb-4 border-hairline" />
              <pre className="whitespace-pre-wrap font-mono text-sm text-ink-body">{previewText}</pre>
            </div>
          </div>
        )}

        {/* Send test dialog */}
        <Dialog open={sendTestOpen} onOpenChange={setSendTestOpen}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Send test email</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSendTest} className="mt-4 space-y-4">
              <div className="space-y-2">
                <label htmlFor="test-email">Recipient email</label>
                <Input
                  id="test-email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={sendTestEmail}
                  onChange={(e) => setSendTestEmail(e.target.value)}
                />
              </div>
              <p className="text-xs text-ink-muted">
                Uses the currently saved template with sample data. Save any unsaved changes first.
              </p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary" type="button">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={sendTestProcessing}>
                  {sendTestProcessing ? "Sending…" : "Send test"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reset confirmation dialog */}
        <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Reset to default?</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <p className="text-sm text-ink-body">
                This will replace the current subject and body with the baked-in defaults for{" "}
                <strong>{template.name}</strong>. Your edits will be permanently lost.
              </p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary" type="button">Cancel</Button>
                </DialogClose>
                <Button
                  variant="danger"
                  type="button"
                  disabled={resetProcessing}
                  onClick={handleResetToDefault}
                >
                  {resetProcessing ? "Resetting…" : "Yes, reset to default"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </AdminShell>
    </>
  )
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}
