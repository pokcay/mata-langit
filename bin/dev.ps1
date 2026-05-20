# bin/dev.ps1 -- Windows launcher for Rails + Vite development server
# Usage: .\bin\dev.ps1
#
# Uses Procfile.dev.windows (web + vite only). Background jobs run in-process
# via the :async ActiveJob adapter on Windows since SolidQueue's supervisor
# requires POSIX signals (SIGQUIT) not available on Windows.

if (-not $env:PORT) { $env:PORT = "3000" }

$pidFile = "tmp\pids\server.pid"
if (Test-Path $pidFile) {
    $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    $running = $false
    if ($oldPid) {
        $process = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($process) { $running = $true }
    }
    if ($running) {
        Write-Host "Rails server is already running (pid: $oldPid). Stopping it first..." -ForegroundColor Yellow
        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

$foreman = Get-Command foreman -ErrorAction SilentlyContinue
if (-not $foreman) {
    Write-Host "Installing foreman..."
    gem install foreman
}

foreman start -f Procfile.dev.windows @args
