# Changelog

Versions are numbered using the release date in `YYYY.MM.DD` format.

## 2026.5.24 — Rebrand to mata-langit

- Renamed app module to `MataLangit`, npm package to `mata-langit`, and UI branding to **Mata Langit**
- Updated README, deployment docs, and Docker Compose comments to point at [`pokcay/mata-langit`](https://github.com/pokcay/mata-langit)
- Production Docker database name: `mata_langit_production`

## 2026.5.24 — Admin inbox, email templates, Resend

Back-ported production-ready admin and email infrastructure from a deployed app (generic, no business logic):

**Admin Inbox (`/admin/inbox`):**

- `inbound_emails` table + `InboundEmail` model
- `POST /webhooks/inbound_email` webhook (secret-verified)
- Admin inbox UI: list with tabs (all/unread/archived), bulk actions, show page with HTML/text body
- Unread count badge in admin sidebar
- Optional `cloudflare-worker/` for Cloudflare Email Routing ingest

**Admin Email Templates (`/admin/email-templates`):**

- `email_templates` table + `EmailTemplate` model
- Edit password-reset template in-browser (Markdown HTML + plain text, variable picker, preview, send test, reset to default)
- `PasswordsMailer` reads from DB template when present
- `kramdown` gem for Markdown → HTML; `marked` npm package for admin preview

**Resend transactional email:**

- `resend` gem + `config/initializers/resend.rb`
- Production/staging use `:resend` delivery; development keeps letter_opener
- `MAIL_FROM`, `MAIL_REPLY_TO`, `APP_HOST` env vars documented in `.env.example`

**Other:**

- `bin/setup_credentials` for per-env encrypted credentials (`config/credentials/*.key` gitignored)
- `vite.config.ts` manualChunks for milkdown/react/radix/lucide + `maxParallelFileOps`
- Expanded `docs/hatchbox-deployment-guide.md` (Resend, Cloudflare Email Routing, inbox Worker, staging+prod split)
- `CLAUDE.md` sections for transactional email and admin inbox/templates
- `README.md`: `PARALLEL_WORKERS=1` Windows test tip + Hatchbox deployment link
- `public/robots.txt`: disallow `/admin` and `/webhooks`

## 2026.5.20 — Windows-compatible fork

Repository forked from the Builder Methods Rails + React template. Windows-compatible setup now runs natively on Windows in addition to Unix/macOS. No application code (controllers, models, components) was changed — only setup, configuration, and developer-workflow files.

Setup & launchers:

- `bin/dev.ps1` PowerShell launcher for Rails + Vite (replaces `bin/dev` on Windows). Auto-kills stale processes on ports 3000 and 3036 before starting.
- `bin/dev-ssr.ps1` PowerShell SSR launcher (builds SSR bundle, then runs Rails + Vite + SSR watcher + Node SSR server).
- `Procfile.dev.windows` and `Procfile.ssr.windows` skip the SolidQueue worker process (SIGQUIT unsupported on Windows).
- `bin/setup` auto-detects PostgreSQL install dir under `C:\Program Files\PostgreSQL\*`, adds it to the User PATH (persisted), starts the Windows service if stopped, and creates `.env` from `.env.example` with sensible defaults.
- `bin/reset-postgres-auth.ps1` one-click script to switch local PostgreSQL to `trust` auth (UAC-elevated, backs up `pg_hba.conf`, restarts the service). For local development only.
- `bin/setup` auto-triggers the reset script via UAC if the first connection attempt fails, then retries.

Configuration:

- Database name is derived from the project folder via `File.basename(Rails.root).gsub(/[^a-zA-Z0-9]/, "_").downcase` in `config/database.yml`. Override with `DATABASE_NAME`.
- `DATABASE_HOST` default changed from `localhost` to `127.0.0.1` to avoid IPv6 `::1` issues with PostgreSQL on Windows.
- `DATABASE_USER` default falls back to `ENV["USERNAME"]` (Windows) when `ENV["USER"]` is missing.
- `sslmode: disable` and `gssencmode: disable` in the default block of `config/database.yml`. Fixes "server closed the connection unexpectedly" during libpq SSL/GSSAPI negotiation on Windows. Production unchanged when `DATABASE_URL` is used.
- `Procfile.dev` now uses `ruby bin/...` prefix so Procfile commands work on both Windows (no shebang execution) and Unix.
- `config/environments/development.rb` uses `:async` queue adapter on `Gem.win_platform?`, SolidQueue elsewhere. Background jobs run in-process inside the Rails server on Windows.
- `dotenv-rails` gem added to `development, test` so `.env` is loaded at Rails boot.
- `.gitattributes` enforces LF for source files, CRLF for `.ps1`/`.bat`/`.cmd`.
- `.gitignore` keeps `.env.example` committed via `!/.env.example` exception.
- `conductor.json` scripts updated to PowerShell-friendly invocations.

Documentation:

- `README.md` rewritten for Windows quick start with prerequisites table, dynamic-database explanation, and troubleshooting.
- `CLAUDE.md` updated: dynamic database naming replaces fixed template database names, Commands section shows Unix vs Windows side by side, new "Platform notes (Windows)" section.
- `.env.example` added as the credentials template.

## 2026.5.9

- Switched the database from SQLite back to PostgreSQL. Single database at `<folder_name>_<env>` (e.g. `mata_langit_development`) is shared by Active Record and the Solid trifecta (Queue, Cache, Cable). Connection is configurable via `DATABASE_URL` or the `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_HOST` / `DATABASE_PORT` env vars.
- Added `admin` boolean column to users (default `false`) and an `/admin` namespace gated by `Admin::BaseController` (admins only). Added admin Users index + show pages and a Shield-icon Admin link in the user menu when `current_user.admin` is true.

## 2026.5.8

Reset to a true blank slate.

- Replaced PostgreSQL with SQLite. Single database at `storage/<env>.sqlite3` is shared by Active Record and the Solid trifecta (Queue, Cache, Cable).
- Removed Tailwind CSS, shadcn/ui, `tw-animate-css`, Radix primitives, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `cn()` utility, and `components.json`.
- Removed the authenticated `AppShell` (sidebar + header dropdown) and the `AuthCard` wrapper.
- Removed the system-preference dark-mode bootstrap and CSS theme variables.
- All pages are now plain unstyled HTML — pick a UI approach per app.

## 2026.4.27

Initial release.

- Rails 8 + Inertia.js + React 19 starter on PostgreSQL
- TypeScript, Tailwind CSS 4, shadcn/ui (new-york), Vite 7
- Authentication with sessions, signup, and password reset (Inertia-rendered)
- Authenticated app shell: sidebar + header with profile dropdown
- Dashboard, Settings, and Profile pages (email + password change from Profile)
- Signup captures the browser's IANA timezone and stores it on the user
- System-preference-based dark mode applied before first paint
- Mobile-responsive layouts
- `letter_opener` for previewing mail in development at `/letter_opener`
- Solid Queue, Solid Cache, and Solid Cable consolidated into the primary Postgres database (no Redis, no separate cache/cable databases)
- Per-clone database name derived from the project directory, so cloning the GitHub template gives each project its own Postgres database
- `bin/setup` → `npm install` → `bin/dev` flow for fresh template clones
