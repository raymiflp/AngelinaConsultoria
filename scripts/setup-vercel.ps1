# =============================================================================
# scripts/setup-vercel.ps1 — One-command deploy to Vercel (PowerShell 5.1+)
# =============================================================================
# Automates the full Vercel deploy pipeline for the angelina-consultoria
# Next.js app. Runs after `vercel login` in a separate terminal.
#
# Usage:
#   # First-time setup (with placeholders, deploy will boot but smoke fails):
#   .\scripts\setup-vercel.ps1
#
#   # With real env values (after provisioning Vercel Postgres, LiveKit
#   # Cloud, Upstash — see docs/deployment.md "First-Time Setup"):
#   $env:DATABASE_URL          = "postgres://...?pgbouncer=true&connection_limit=1"
#   $env:LIVEKIT_API_KEY       = "APIxxxxxxxxxxxx"
#   $env:LIVEKIT_API_SECRET    = "<base64>"
#   $env:NEXT_PUBLIC_LIVEKIT_URL = "wss://your-project.livekit.cloud"
#   $env:LIVEKIT_WEBHOOK_URL   = "https://<your-domain>/api/livekit/webhook"
#   $env:APP_URL               = "https://<your-domain>"
#   $env:UPSTASH_REDIS_REST_URL    = "https://your-db.upstash.io"
#   $env:UPSTASH_REDIS_REST_TOKEN = "<token>"
#   $env:AUTH_SECRET           = "<openssl rand -base64 32>"
#   .\scripts\setup-vercel.ps1 -Redeploy
#
# What it does:
#   1. Verifies vercel CLI is installed and user is logged in.
#   2. Creates the Vercel project if it doesn't exist (idempotent).
#   3. Links the local repo to the project.
#   4. Sets 11 environment variables (Production scope) from script env
#      vars or sensible placeholders.
#   5. Disables SSO protection (so curl / external smoke can access).
#   6. Deploys to production.
#   7. Prints the deployment URL + next-step checklist.

[CmdletBinding()]
param(
    [switch]$Redeploy = $false,
    [string]$ProjectName = "medico-consulta"
)

$ErrorActionPreference = "Stop"

# ---- 1. Pre-flight checks ----

Write-Host ""
Write-Host "==> [1/7] Pre-flight checks" -ForegroundColor Cyan

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: vercel CLI not found. Install with: npm install -g vercel" -ForegroundColor Red
    exit 1
}
Write-Host "  vercel CLI: OK"

$whoami = vercel whoami 2>&1 | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or $whoami -match "Error") {
    Write-Host "ERROR: Not logged in to Vercel. Run 'vercel login' in a separate terminal first." -ForegroundColor Red
    exit 1
}
Write-Host "  vercel login: OK ($whoami)"

# ---- 2. Create project if needed ----

Write-Host ""
Write-Host "==> [2/7] Create Vercel project '$ProjectName'" -ForegroundColor Cyan

$existing = vercel project ls --no-color 2>&1 | Select-String -Pattern "^\s*$ProjectName\s"
if ($existing) {
    Write-Host "  Project already exists"
} else {
    vercel project add $ProjectName 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create project" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Project created"
}

# ---- 3. Link project ----

Write-Host ""
Write-Host "==> [3/7] Link local repo to project" -ForegroundColor Cyan

# 'vercel link' writes .vercel/project.json. It's interactive if multiple
# projects match, so use --yes to accept the first match.
vercel link --yes 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: vercel link failed" -ForegroundColor Red
    exit 1
}
$projectJson = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
$projectId = $projectJson.projectId
$orgId = $projectJson.orgId
Write-Host "  Linked: projectId=$projectId orgId=$orgId"

# ---- 4. Set environment variables ----

Write-Host ""
Write-Host "==> [4/7] Set Production environment variables" -ForegroundColor Cyan

# Helper: get value from script env var or use placeholder
function Get-EnvValue {
    param([string]$Name, [string]$Placeholder)
    $val = [Environment]::GetEnvironmentVariable($Name)
    if ($val) { return $val }
    return $Placeholder
}

$dbUrl = Get-EnvValue "DATABASE_URL" "postgres://placeholder:placeholder@localhost:5432/placeholder"
$livekitKey = Get-EnvValue "LIVEKIT_API_KEY" "placeholder-key-update-after-deploy"
$livekitSecret = Get-EnvValue "LIVEKIT_API_SECRET" "cGxhY2Vob2xkZXItc2VjcmV0"
$nextPublicLkUrl = Get-EnvValue "NEXT_PUBLIC_LIVEKIT_URL" "wss://placeholder.livekit.cloud"
$authSecret = Get-EnvValue "AUTH_SECRET" ("placeholder-" + [guid]::NewGuid().ToString("N"))
$authTrustHost = "true"
$appUrl = Get-EnvValue "APP_URL" "https://placeholder.vercel.app"
$lkWebhookUrl = Get-EnvValue "LIVEKIT_WEBHOOK_URL" "https://placeholder.vercel.app/api/livekit/webhook"
$minioHost = "*.public.blob.vercel-storage.com"
$upstashUrl = Get-EnvValue "UPSTASH_REDIS_REST_URL" "https://placeholder.upstash.io"
$upstashToken = Get-EnvValue "UPSTASH_REDIS_REST_TOKEN" "placeholder-update-after-deploy"

$envVars = @(
    @{ name = "DATABASE_URL";                value = $dbUrl },
    @{ name = "LIVEKIT_API_KEY";             value = $livekitKey },
    @{ name = "LIVEKIT_API_SECRET";          value = $livekitSecret },
    @{ name = "NEXT_PUBLIC_LIVEKIT_URL";     value = $nextPublicLkUrl },
    @{ name = "AUTH_SECRET";                 value = $authSecret },
    @{ name = "AUTH_TRUST_HOST";             value = $authTrustHost },
    @{ name = "APP_URL";                     value = $appUrl },
    @{ name = "LIVEKIT_WEBHOOK_URL";         value = $lkWebhookUrl },
    @{ name = "MINIO_PUBLIC_HOSTNAME";       value = $minioHost },
    @{ name = "UPSTASH_REDIS_REST_URL";      value = $upstashUrl },
    @{ name = "UPSTASH_REDIS_REST_TOKEN";   value = $upstashToken }
)

# Build --force-overwrite JSON for vercel env add (forces overwrite)
# Actually vercel env add always overwrites by default. Skip --force.
foreach ($e in $envVars) {
    $isPlaceholder = $e.value -like "*placeholder*" -or $e.value -like "*localhost*" -or $e.value -like "*example*"
    if ($isPlaceholder -and -not $Redeploy) {
        Write-Host "  $($e.name) = (placeholder, run setup-vercel.ps1 with real env vars after provisioning services)"
    } else {
        Write-Host "  $($e.name) = <real value, length $($e.value.Length)>"
    }
    # vercel env add is non-interactive when --value is provided
    vercel env add $e.name production --value $e.value -y 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to set $($e.name)" -ForegroundColor Red
        exit 1
    }
}

# ---- 5. Disable SSO protection ----

Write-Host ""
Write-Host "==> [5/7] Disable SSO protection (so external curl can access)" -ForegroundColor Cyan

$patch = @{ ssoProtection = $null } | ConvertTo-Json -Compress
$patch | Out-File -Encoding ascii -FilePath ".vercel-sso-patch.json"
vercel api "/v1/projects/$projectId" --method PATCH --input ".vercel-sso-patch.json" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARN: Could not disable SSO (you may need to do it manually in dashboard)" -ForegroundColor Yellow
} else {
    Write-Host "  SSO disabled"
}
Remove-Item .vercel-sso-patch.json -ErrorAction SilentlyContinue

# ---- 6. Deploy ----

Write-Host ""
Write-Host "==> [6/7] Deploy to production" -ForegroundColor Cyan

vercel deploy --prod --yes 2>&1 | Tee-Object -FilePath .vercel-deploy.log | Select-Object -Last 10

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Deploy failed. Check .vercel-deploy.log" -ForegroundColor Red
    exit 1
}

# ---- 7. Report ----

Write-Host ""
Write-Host "==> [7/7] Deploy summary" -ForegroundColor Green

$deployUrl = vercel ls 2>&1 | Select-String -Pattern "vercel\.app" | Select-Object -First 1
if ($deployUrl) {
    $url = ($deployUrl -split "\s+")[0]
    Write-Host ""
    Write-Host "  Production URL: $url" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor Cyan
    Write-Host "    1. Smoke test:    .\scripts\smoke-test.ps1 -Url $url"
    Write-Host "    2. Provision real services (Vercel Postgres, LiveKit Cloud, Upstash)"
    Write-Host "    3. Re-run with real env vars to update:  .\scripts\setup-vercel.ps1 -Redeploy"
    Write-Host ""
    Write-Host "  Until then, /api/health will return 'degraded' (expected, see runbook)."
}
