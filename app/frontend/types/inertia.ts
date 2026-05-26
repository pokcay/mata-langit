import type { PageProps as InertiaPageProps } from "@inertiajs/core"

export type CurrentUser = {
  id: number
  email: string
  timezone: string | null
  admin: boolean
} | null

export type SharedProps = {
  current_user: CurrentUser
  flash: {
    notice: string | null
    alert: string | null
  }
  errors: Record<string, string>
  admin_inbox_unread_count?: number
  data_integrity_mismatch_count?: number
}

export type PageProps<T extends Record<string, unknown> = Record<string, unknown>> =
  SharedProps & T & InertiaPageProps
