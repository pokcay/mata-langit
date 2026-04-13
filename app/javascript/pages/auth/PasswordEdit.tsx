import { FormEvent } from "react"
import { Head, useForm, usePage } from "@inertiajs/react"

import { AuthCard } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PageProps } from "@/types/inertia"

type Props = { token: string }

export default function PasswordEdit({ token }: Props) {
  const { props } = usePage<PageProps<Props>>()
  const form = useForm({ password: "" })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    form.patch(`/passwords/${token}`)
  }

  const errors = props.errors ?? {}

  return (
    <>
      <Head title="Choose a new password" />
      <AuthCard title="Choose a new password">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={!!errors.password}
              value={form.data.password}
              onChange={(e) => form.setData("password", e.target.value)}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>
          <Button type="submit" disabled={form.processing} className="w-full">
            Update password
          </Button>
        </form>
      </AuthCard>
    </>
  )
}
