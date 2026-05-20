# bin/dev.ps1 -- Windows launcher for Rails + Vite development server
# Usage: .\bin\dev.ps1
#
# Uses Procfile.dev.windows (web + vite only). Background jobs run in-process
# via the :async ActiveJob adapter on Windows since SolidQueue's supervisor
# requires POSIX signals (SIGQUIT) not available on Windows.

if (-not $env:PORT) { $env:PORT = "3000" }

$foreman = Get-Command foreman -ErrorAction SilentlyContinue
if (-not $foreman) {
    Write-Host "Installing foreman..."
    gem install foreman
}

foreman start -f Procfile.dev.windows @args
