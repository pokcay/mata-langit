# Build New (Windows)

A blank-slate starter for full-stack apps with **Rails 8 + Inertia.js + React 19 + PostgreSQL** — by [Brian Casel](https://buildermethods.com) at Builder Methods.

> This is a Windows-compatible fork of the original [build-new](https://github.com/buildermethods/build-new) template.

📚 [**Full documentation**](https://buildermethods.com/rails-react-template)

## Prerequisites

Install these before running setup:

| Tool | Version | Download |
|------|---------|----------|
| Ruby | 3.3.6 | [RubyInstaller for Windows](https://rubyinstaller.org/) — choose **Ruby+Devkit** |
| Node.js | >=22.12.0 | [nodejs.org](https://nodejs.org/) |
| PostgreSQL | 10+ | [EDB Installer](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads) — add `bin/` to PATH |

> **Note:** After installing PostgreSQL, add its `bin/` folder to your system PATH (e.g. `C:\Program Files\PostgreSQL\16\bin`).

## Quick Start

```powershell
bin/setup        # checks prerequisites, installs gems, creates and migrates the database
npm install      # installs JS dependencies
.\bin\dev.ps1    # starts Rails (:3000) + Vite (:3036)
```

## Dynamic Database Name

The database name is automatically derived from your **project folder name**.

| Folder name | Database names |
|-------------|----------------|
| `my-app` | `my_app_development`, `my_app_test`, `my_app_production` |
| `cool_project` | `cool_project_development`, `cool_project_test`, `cool_project_production` |

To override, set `DATABASE_NAME` in your `.env` file.

## Environment Variables

Copy `.env.example` to `.env` and fill in your PostgreSQL credentials:

```powershell
Copy-Item .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_USER` | Windows username | PostgreSQL user |
| `DATABASE_PASSWORD` | _(empty)_ | PostgreSQL password |
| `DATABASE_HOST` | `localhost` | PostgreSQL host |
| `DATABASE_PORT` | `5432` | PostgreSQL port |
| `DATABASE_NAME` | _(folder name)_ | Override database base name |

## Running Tests

```powershell
bin/rails test
```

## Links

- 💬 Direct support: [Builder Methods Pro](https://buildermethods.com/pro)
- 📬 Free weekly newsletter: [Builder Briefing](https://buildermethods.com)
- 🔗 Original repo: [buildermethods/build-new](https://github.com/buildermethods/build-new)

## License

Open source. Free to use, fork, and adapt.
