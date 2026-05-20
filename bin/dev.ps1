# bin/dev.ps1 — Windows launcher for Rails + Vite development server
# Usage: .\bin\dev.ps1

if (-not $env:PORT) { $env:PORT = "3000" }

$foreman = Get-Command foreman -ErrorAction SilentlyContinue
if (-not $foreman) {
    Write-Host "Installing foreman..."
    gem install foreman
}

foreman start -f Procfile.dev @args
