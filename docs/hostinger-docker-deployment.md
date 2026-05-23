# Hostinger VPS — Docker deployment

Deploy **mata-langit** with Hostinger **Docker Manager** using the `docker-compose.yml` at the repo root.

## What gets deployed

| Service | Role |
| --- | --- |
| `db` | PostgreSQL 16 |
| `web` | Rails + Puma (port 3000, health check `/up`) |
| `ssr` | Inertia SSR Node server (port 13714, internal only) |

Solid Queue runs inside Puma — no separate worker container.

## Before you deploy

1. **Generate `RAILS_MASTER_KEY`** on your dev machine (if you don't have one):
   ```bash
   ruby bin/rails secret
   ```
   Or copy the value from `config/master.key` (never commit this file).

2. **Prepare env vars** — copy `.env.docker.example` to `.env` on the server and fill in `RAILS_MASTER_KEY`.

3. **First deploy without a custom domain** — defaults in `docker-compose.yml` are tuned for that:
   - `RAILS_ALLOWED_HOSTS=*` — accepts requests by IP or Hostinger hostname
   - `FORCE_SSL=false` — no HTTPS redirect when opening `http://YOUR_VPS_IP:3000`
   - `APP_HOST=localhost` — update when you have a real domain (mailer links, sitemap)

## Hostinger Docker Manager

### Option A — Compose from URL (recommended after push)

1. hPanel → VPS → **Docker Manager** → **Compose** → **Compose from URL**
2. URL: `https://github.com/pokcay/mata-langit`
3. Set environment variables in the panel (at minimum `RAILS_MASTER_KEY`)
4. Deploy

### Option B — Compose manually

1. Paste the contents of `docker-compose.yml` from this repo
2. Add env vars (`RAILS_MASTER_KEY`, etc.)
3. Deploy

Build can take **5–15 minutes** on a small VPS (Ruby gems + npm + Vite + SSR bundle).

## After deploy

- Open `http://YOUR_VPS_IP:3000` (or the port Hostinger maps)
- Health check: `http://YOUR_VPS_IP:3000/up`
- **View source** on `/` — `<div id="app">` should contain HTML (SSR working). Empty div = SSR container down; check `ssr` logs in Docker Manager.

## When you add a domain

1. Point DNS to the VPS; enable SSL in Hostinger
2. Update env:
   ```
   APP_HOST=yourdomain.com
   RAILS_ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
   FORCE_SSL=true
   ASSUME_SSL=true
   ```
3. Redeploy / restart the `web` container

## SSH fallback

```bash
git clone https://github.com/pokcay/mata-langit.git
cd mata-langit
cp .env.docker.example .env
# edit .env — set RAILS_MASTER_KEY
docker compose up -d --build
docker compose logs -f web
```

## Troubleshooting

**Build fails on memory** — upgrade VPS plan or add swap; Vite SSR build is heavy.

**502 / blank page** — check `web` and `ssr` logs; ensure `INERTIA_SSR_URL=http://ssr:13714` is set.

**Blocked host / 403** — set `RAILS_ALLOWED_HOSTS` to your IP or domain (or `*` temporarily).

**Database errors** — wait for `db` healthcheck; `web` runs `db:prepare` on boot.
