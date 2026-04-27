# Changelog

Versions are numbered using the release date in `YYYY.MM.DD` format.

## 2026.4.27 — 2026-04-27

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
