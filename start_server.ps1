# start_server.ps1 — PowerShell launcher for the Cardiovascular Risk API
# Right-click → "Run with PowerShell" to start

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

Write-Host "============================================" -ForegroundColor Green
Write-Host "  Cardiovascular Risk Prediction API" -ForegroundColor Green
Write-Host "  Running on: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Activate venv if present
$venvActivate = Join-Path $projectDir "venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    Write-Host "[INFO] Activating virtual environment..." -ForegroundColor Cyan
    & $venvActivate
} else {
    Write-Host "[INFO] No venv found, using system Python..." -ForegroundColor Yellow
}

Write-Host "[INFO] Starting server on 127.0.0.1:8000 (localhost only — no firewall needed)..." -ForegroundColor Cyan
Write-Host ""

# --host 127.0.0.1 means Windows Firewall will NOT block it
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

Write-Host ""
Write-Host "[INFO] Server stopped." -ForegroundColor Yellow
Read-Host "Press Enter to exit"
