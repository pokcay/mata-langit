import { FormEvent } from "react"
import { Head, useForm, usePage } from "@inertiajs/react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { MobileStickyActionBar } from "@/components/ui/mobile-sticky-action-bar"
import type { PageProps } from "@/types/inertia"

export default function Settings({
  include_program_in_integrity_checks,
}: {
  include_program_in_integrity_checks: boolean
}) {
  const { props } = usePage<PageProps>()

  const form = useForm({
    include_program_in_integrity_checks,
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    form.patch("/settings", { preserveScroll: true })
  }

  return (
    <>
      <Head title="Settings">
        <meta name="description" content="Atur preferensi aplikasi Anda." />
        <meta property="og:title" content="Settings" />
        <meta property="og:description" content="Atur preferensi aplikasi Anda." />
      </Head>
      <AppShell>
        <h1>Settings</h1>
        <p className="mt-1">Atur preferensi aplikasi yang berlaku khusus untuk akun Anda.</p>

        {props.flash?.notice && (
          <p className="mt-6 text-sm text-accent">{props.flash.notice}</p>
        )}

        <section className="mt-10 max-w-xl">
          <h2>Data Integrity</h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <label className="flex items-start gap-3 font-normal text-ink-body">
              <Checkbox
                checked={form.data.include_program_in_integrity_checks}
                onChange={(e) =>
                  form.setData("include_program_in_integrity_checks", e.target.checked)
                }
                className="mt-0.5"
              />
              <span>
                Sertakan baris dengan <code>flag_program = 'PROGRAM'</code> saat menjalankan
                Data Integrity check.
                <span className="mt-1 block text-xs text-ink-muted">
                  Secara default file SoT diproduksi tanpa baris PROGRAM, sehingga aplikasi
                  meng-exclude baris PROGRAM di sisi DB saat membandingkan. Centang opsi ini
                  hanya jika file SoT Anda sudah memasukkan baris PROGRAM.
                </span>
              </span>
            </label>

            <MobileStickyActionBar>
              <Button type="submit" disabled={form.processing}>
                Simpan preferensi
              </Button>
            </MobileStickyActionBar>
          </form>
        </section>
      </AppShell>
    </>
  )
}
