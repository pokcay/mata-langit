# bin/reset-postgres-auth.ps1
# One-time script to switch local PostgreSQL connections to trust mode (no password).
# For LOCAL DEVELOPMENT ONLY. Never run on production.
#
# Usage: right-click PowerShell -> "Run as Administrator", then:
#   .\bin\reset-postgres-auth.ps1
#
# Or run directly -- the script will self-elevate via UAC.

$ErrorActionPreference = "Stop"

$currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    $scriptPath = $MyInvocation.MyCommand.Definition
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$scriptPath`""
    exit
}

Write-Host ""
Write-Host "=== PostgreSQL Trust Mode Setup ===" -ForegroundColor Cyan
Write-Host ""

$pgDir = Get-ChildItem "C:\Program Files\PostgreSQL" -ErrorAction SilentlyContinue |
         Sort-Object Name -Descending | Select-Object -First 1
if (-not $pgDir) {
    Write-Host "ERROR: PostgreSQL not found in C:\Program Files\PostgreSQL" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$pgVersion = $pgDir.Name
$hbaFile = Join-Path $pgDir.FullName "data\pg_hba.conf"
$serviceName = "postgresql-x64-$pgVersion"

Write-Host "Found PostgreSQL $pgVersion"
Write-Host "Config file: $hbaFile"
Write-Host "Service:     $serviceName"
Write-Host ""

if (-not (Test-Path $hbaFile)) {
    Write-Host "ERROR: pg_hba.conf not found at $hbaFile" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$backup = "$hbaFile.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $hbaFile $backup
Write-Host "[OK] Backup created: $backup" -ForegroundColor Green

$content = Get-Content $hbaFile -Raw
$content = $content -replace '(?m)^(local\s+\S+\s+\S+\s+)(scram-sha-256|md5|password)', '$1trust'
$content = $content -replace '(?m)^(host\s+\S+\s+\S+\s+(127\.0\.0\.1/32|::1/128|samehost|samenet)\s+)(scram-sha-256|md5|password)', '$1trust'
Set-Content -Path $hbaFile -Value $content -NoNewline

Write-Host "[OK] Updated pg_hba.conf to use 'trust' for local connections" -ForegroundColor Green

Write-Host ""
Write-Host "Restarting $serviceName..." -ForegroundColor Yellow
Restart-Service -Name $serviceName -Force
Start-Sleep -Seconds 2

$status = (Get-Service -Name $serviceName).Status
if ($status -eq "Running") {
    Write-Host "[OK] PostgreSQL service is running" -ForegroundColor Green
} else {
    Write-Host "WARNING: Service status is $status" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Local PostgreSQL connections no longer require a password."
Write-Host "You can now run setup with an empty password:"
Write-Host ""
Write-Host "  Remove-Item .env -ErrorAction SilentlyContinue" -ForegroundColor Gray
Write-Host "  ruby bin/setup" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close"
