# Build New (Windows)

A blank-slate starter for full-stack apps with **Rails 8 + Inertia.js + React 19 + PostgreSQL** — by [Brian Casel](https://buildermethods.com) at Builder Methods.

> This is a Windows-compatible fork of the original [build-new](https://github.com/buildermethods/build-new) template.

📚 [**Full documentation**](https://buildermethods.com/rails-react-template)

## Prerequisites

Install these before running setup:

| Tool | Version | Download |
|------|---------|----------|
| Ruby | 3.3.6+ | [RubyInstaller for Windows](https://rubyinstaller.org/) — choose **Ruby+Devkit** |
| Node.js | >=22.12.0 | [nodejs.org](https://nodejs.org/) |
| PostgreSQL | 10+ | [EDB Installer](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads) |

> The setup script auto-detects PostgreSQL in `C:\Program Files\PostgreSQL\*` and adds it to your PATH automatically. You don't need to do this manually.

## Quick Start

The same 5 commands work on a fresh machine **and** on a machine already configured — `bin/setup` handles every difference automatically.

```powershell
git clone https://github.com/pokcay/build-new-windows.git my-project
cd my-project
ruby bin/setup     # auto-detect, configure, migrate
npm install
.\bin\dev.ps1      # http://localhost:3000
```

### What `ruby bin/setup` does automatically

1. **Checks Ruby, Node.js, PostgreSQL** — clear error if anything is missing
2. **Adds PostgreSQL to PATH** if not already there (persisted for future terminals)
3. **Starts the PostgreSQL service** if it's stopped
4. **Creates `.env`** from `.env.example` with sensible defaults
5. **Tests the database connection** — if it fails:
   - On Windows, automatically prompts for Administrator (UAC)
   - Switches `pg_hba.conf` to **trust mode** for local connections
   - Restarts PostgreSQL and retries
6. **Runs `bundle install`** and **`db:prepare`** (creates + migrates databases)

If anything goes wrong it prints exactly what to fix.

## Dynamic Database Name

The database name is automatically derived from your **project folder name**.

| Folder name | Database names |
|-------------|----------------|
| `my-app` | `my_app_development`, `my_app_test`, `my_app_production` |
| `cool_project` | `cool_project_development`, `cool_project_test`, `cool_project_production` |

Override via `DATABASE_NAME` in `.env`.

## Environment Variables

The setup script creates `.env` for you with defaults. Edit it if you want to use different credentials.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_USER` | `postgres` | PostgreSQL user |
| `DATABASE_PASSWORD` | _(empty)_ | PostgreSQL password |
| `DATABASE_HOST` | `127.0.0.1` | PostgreSQL host |
| `DATABASE_PORT` | `5432` | PostgreSQL port |
| `DATABASE_NAME` | _(folder name)_ | Override base database name |

## Troubleshooting

### Connection failed even after setup

Re-run setup — it will retry the auth fix:

```powershell
ruby bin/setup
```

Or run the reset script manually (right-click → Run as Administrator):

```powershell
.\bin\reset-postgres-auth.ps1
```

### Dev server won't start ("port in use" or stale PID)

`bin\dev.ps1` automatically kills stale processes on ports 3000 and 3036 before starting. If you still see issues, manually:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### SSR development (test full pipeline locally)

To run the full server-side rendering pipeline (Rails + Vite + SSR build watcher + Node SSR server), use the SSR launcher instead of the regular one:

```powershell
.\bin\dev-ssr.ps1
```

This builds the SSR bundle once, sets `INERTIA_SSR=1`, and starts everything via `Procfile.ssr.windows`. View source on a public page — the `<div id="app">` should contain real HTML, not be empty. Background jobs still run in-process via the `:async` adapter on Windows (no separate SolidQueue worker).

## Running Tests

```powershell
ruby bin/rails test
```

On Windows, if tests hang or fail with database connection errors under parallel load, run with a single worker:

```powershell
$env:PARALLEL_WORKERS=1; ruby bin/rails test
```

## Deployment

- **Hatchbox:** [`docs/hatchbox-deployment-guide.md`](docs/hatchbox-deployment-guide.md) — Resend, credentials, Cloudflare Email Routing
- **Hostinger VPS (Docker):** [`docs/hostinger-docker-deployment.md`](docs/hostinger-docker-deployment.md) — `docker-compose.yml` at repo root for Docker Manager

## Links

- 💬 Direct support: [Builder Methods Pro](https://buildermethods.com/pro)
- 📬 Free weekly newsletter: [Builder Briefing](https://buildermethods.com)
- 🔗 Original repo: [buildermethods/build-new](https://github.com/buildermethods/build-new)

## License

Open source. Free to use, fork, and adapt.
