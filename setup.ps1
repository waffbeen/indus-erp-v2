# =============================================================================
# Indus ERP v2 - one-shot setup script (Windows PowerShell, ASCII-safe)
# =============================================================================
# Usage:
#   1. Install Node 20+ from https://nodejs.org/
#   2. Open PowerShell in this folder
#   3. Run:   .\setup.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Write-Heading($msg) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# ---------- 1. Check Node ----------
Write-Heading "Step 1/7: Check Node.js"
if (-not (Test-Cmd node)) {
    Write-Host "Node.js not found. Install from https://nodejs.org/ (LTS 20+) and re-run." -ForegroundColor Red
    exit 1
}
$nodeVersion = (node --version).TrimStart("v")
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 20) {
    Write-Host "Node $nodeVersion found - need 20 or higher." -ForegroundColor Red
    exit 1
}
Write-Host "  Node $nodeVersion [OK]" -ForegroundColor Green

# ---------- 2. Check pnpm ----------
Write-Heading "Step 2/7: Check pnpm"
if (-not (Test-Cmd pnpm)) {
    Write-Host "  pnpm not found. Install with one of:" -ForegroundColor Yellow
    Write-Host "    npm install -g pnpm" -ForegroundColor White
    Write-Host "  Then close and reopen this window, then re-run setup.ps1." -ForegroundColor Yellow
    exit 1
}
$pnpmVersion = pnpm --version
Write-Host "  pnpm $pnpmVersion [OK]" -ForegroundColor Green

# ---------- 3. Copy env files ----------
Write-Heading "Step 3/7: Copy .env files"
$envCopies = @(
    @{ Src = "$root\.env.example"; Dst = "$root\.env" },
    @{ Src = "$root\apps\api\.env.example"; Dst = "$root\apps\api\.env" },
    @{ Src = "$root\apps\web\.env.example"; Dst = "$root\apps\web\.env" }
)
foreach ($pair in $envCopies) {
    if (Test-Path $pair.Dst) {
        Write-Host "  Exists, leaving alone: $($pair.Dst)" -ForegroundColor Yellow
    } else {
        Copy-Item $pair.Src $pair.Dst
        Write-Host "  Created: $($pair.Dst)" -ForegroundColor Green
    }
}

# ---------- 4. Generate JWT secrets ----------
Write-Heading "Step 4/7: Generate JWT secrets"
function New-Secret {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}
$accessSecret  = New-Secret
$refreshSecret = New-Secret

$apiEnvPath = "$root\apps\api\.env"
$apiEnv = Get-Content $apiEnvPath -Raw
if ($apiEnv -match "replace-me-with-48-byte-random") {
    $apiEnv = $apiEnv -replace "JWT_ACCESS_SECRET=replace-me-with-48-byte-random",  "JWT_ACCESS_SECRET=$accessSecret"
    $apiEnv = $apiEnv -replace "JWT_REFRESH_SECRET=replace-me-with-a-different-48-byte-random", "JWT_REFRESH_SECRET=$refreshSecret"
    Set-Content $apiEnvPath $apiEnv -NoNewline
    Write-Host "  JWT secrets written to apps\api\.env [OK]" -ForegroundColor Green
} else {
    Write-Host "  JWT secrets already set, skipping." -ForegroundColor Yellow
}

# ---------- 5. Database URL ----------
Write-Heading "Step 5/7: Database URL"
$apiEnv = Get-Content $apiEnvPath -Raw
if ($apiEnv -match "postgresql://USER:PASSWORD@HOST") {
    Write-Host "  We need a Postgres DATABASE_URL." -ForegroundColor Yellow
    Write-Host "  Free option: https://neon.tech (create project, copy 'Pooled connection string')" -ForegroundColor Cyan
    Write-Host ""
    $dbUrl = Read-Host "  Paste DATABASE_URL (or press Enter to skip)"
    if ($dbUrl) {
        $apiEnv = $apiEnv -replace "DATABASE_URL=.*", "DATABASE_URL=$dbUrl"
        Set-Content $apiEnvPath $apiEnv -NoNewline
        $rootEnvPath = "$root\.env"
        $rootEnv = Get-Content $rootEnvPath -Raw
        $rootEnv = $rootEnv -replace "DATABASE_URL=.*", "DATABASE_URL=$dbUrl"
        Set-Content $rootEnvPath $rootEnv -NoNewline
        Write-Host "  DATABASE_URL written [OK]" -ForegroundColor Green
    } else {
        Write-Host "  Skipped. Edit apps\api\.env and set DATABASE_URL, then re-run setup." -ForegroundColor Yellow
        exit 0
    }
} else {
    Write-Host "  DATABASE_URL already set [OK]" -ForegroundColor Green
}

# ---------- 6. Install dependencies ----------
Write-Heading "Step 6/7: pnpm install (this takes a minute or two)"
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "pnpm install failed. See errors above. If 'argon2' failed, see SETUP.md troubleshooting." -ForegroundColor Red
    exit 1
}

# ---------- 7. DB setup ----------
Write-Heading "Step 7/7: Generate migrations + migrate + seed"
pnpm db:generate
if ($LASTEXITCODE -ne 0) { Write-Host "db:generate failed." -ForegroundColor Red; exit 1 }
pnpm db:migrate
if ($LASTEXITCODE -ne 0) { Write-Host "db:migrate failed. Check DATABASE_URL." -ForegroundColor Red; exit 1 }
pnpm --filter @indus/api db:seed
if ($LASTEXITCODE -ne 0) { Write-Host "db:seed failed." -ForegroundColor Red; exit 1 }

# ---------- Done ----------
Write-Heading "Setup complete"
Write-Host ""
Write-Host "  Start the app:" -ForegroundColor Green
Write-Host "    pnpm dev" -ForegroundColor White
Write-Host ""
Write-Host "  Then open:" -ForegroundColor Green
Write-Host "    http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  Demo login (from seed):" -ForegroundColor Green
Write-Host "    Email:    ramesh@acme.in" -ForegroundColor White
Write-Host "    Password: Demo!2026" -ForegroundColor White
Write-Host ""
Write-Host "  Super admin:" -ForegroundColor Green
Write-Host "    Email:    admin@indus.app" -ForegroundColor White
Write-Host "    Password: ChangeMe!2026 (change immediately)" -ForegroundColor Yellow
Write-Host ""
