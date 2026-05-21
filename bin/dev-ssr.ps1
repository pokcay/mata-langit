# bin/dev-ssr.ps1 -- Windows SSR development launcher
# Usage: .\bin\dev-ssr.ps1
#
# Builds the SSR bundle once, then runs Rails + Vite + SSR build watcher +
# Node SSR server together via Procfile.ssr.windows. Background jobs run
# in-process via the :async ActiveJob adapter on Windows (no separate
# SolidQueue worker, since SolidQueue requires POSIX signals).

if (-not $env:PORT) { $env:PORT = "3000" }
$env:INERTIA_SSR = "1"

function Stop-PortListeners {
    param([int]$Port)
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            $procId = $conn.OwningProcess
            if ($procId -and $procId -ne 0) {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "Stopping stale process on port $Port (pid: $procId, name: $($proc.ProcessName))..." -ForegroundColor Yellow
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                }
            }
        }
        if ($connections) { Start-Sleep -Seconds 1 }
    } catch {}
}

Stop-PortListeners -Port ([int]$env:PORT)
Stop-PortListeners -Port 3036
Stop-PortListeners -Port 13714

$pidFile = "tmp\pids\server.pid"
if (Test-Path $pidFile) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "Building SSR bundle..." -ForegroundColor Cyan
ruby bin/vite build --ssr
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSR bundle build failed." -ForegroundColor Red
    exit 1
}

$foreman = Get-Command foreman -ErrorAction SilentlyContinue
if (-not $foreman) {
    Write-Host "Installing foreman..."
    gem install foreman
}

foreman start -f Procfile.ssr.windows @args
