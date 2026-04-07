# deploy.ps1 — Windows PowerShell deploy script
# Run with: powershell -ExecutionPolicy Bypass -File deploy.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info    { param($msg) Write-Host ">> $msg" -ForegroundColor Cyan }
function Success { param($msg) Write-Host "OK $msg" -ForegroundColor Green }
function Fail    { param($msg) Write-Host "FAIL $msg" -ForegroundColor Red; exit 1 }

# ── Pre-flight checks ──────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Fail ".env not found. Copy .env.example to .env and fill in values."
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Fail "pnpm not found. Run: npm install -g pnpm"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
}

# ── Load .env into environment ─────────────────────────────────────────────────
Info "Loading .env..."
Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $val = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

# ── Validate required vars ─────────────────────────────────────────────────────
$required = @(
    "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY",
    "ANTHROPIC_API_KEY", "BANDEJA_STORAGE_PATH",
    "VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_APP_ID"
)
foreach ($var in $required) {
    if (-not [System.Environment]::GetEnvironmentVariable($var, "Process")) {
        Fail "Missing required env var: $var"
    }
}

# ── Ensure storage path exists ─────────────────────────────────────────────────
$storagePath = [System.Environment]::GetEnvironmentVariable("BANDEJA_STORAGE_PATH", "Process")
New-Item -ItemType Directory -Force -Path "$storagePath\renders" | Out-Null
Success "Storage path: $storagePath"

# ── Pull latest code ───────────────────────────────────────────────────────────
Info "Pulling latest from git..."
git pull origin master
Success "Code up to date"

# ── Install dependencies ───────────────────────────────────────────────────────
Info "Installing dependencies..."
pnpm install --frozen-lockfile
Success "Dependencies installed"

# ── Build frontend ─────────────────────────────────────────────────────────────
Info "Building frontend..."
Copy-Item ".env" "apps\web\.env.local" -Force
Set-Location "apps\web"
pnpm build
$buildExit = $LASTEXITCODE
Set-Location "..\..\"
Remove-Item "apps\web\.env.local" -Force -ErrorAction SilentlyContinue
if ($buildExit -ne 0) { Fail "Frontend build failed (exit $buildExit) - fix TypeScript errors above and retry." }
Success "Frontend built -> apps/web/dist/"

# ── Start Docker containers ────────────────────────────────────────────────────
Info "Building and starting containers..."
docker compose -f docker-compose.prod.yml up -d --build
Success "Containers started"

# ── Done ───────────────────────────────────────────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Ethernet* 2>$null | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "your-pc-ip" }

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  Bandeja deployed!" -ForegroundColor Green
Write-Host "  App:    http://$ip"
Write-Host "  Health: http://$ip/api/health"
Write-Host "======================================" -ForegroundColor Green
