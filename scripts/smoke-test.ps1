# =============================================================================
# scripts/smoke-test.ps1 — Post-deploy smoke check (PowerShell 5.1+)
# =============================================================================
# Runs the same three checks as the GitHub post-deploy-smoke workflow
# against any URL. Useful for local verification after a manual deploy.
#
# Usage:
#   .\scripts\smoke-test.ps1 -Url https://medico-consulta.vercel.app
#   .\scripts\smoke-test.ps1 -Url https://my-app.vercel.app -Retries 10 -BackoffSec 5

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Url,

    [int]$Retries = 6,

    [int]$BackoffSec = 10
)

$ErrorActionPreference = "Stop"

# Strip trailing slash for clean concatenation
$Url = $Url.TrimEnd("/")

function Test-Route {
    param(
        [string]$Path,
        [string]$ExpectedBody = "",
        [scriptblock]$ExtraCheck = $null
    )

    $fullUrl = "$Url$Path"
    $attempt = 0
    $lastStatus = 0
    $lastBody = ""

    while ($attempt -lt $Retries) {
        $attempt++
        try {
            $resp = Invoke-WebRequest -Uri $fullUrl -UseBasicParsing -TimeoutSec 15
            $lastStatus = $resp.StatusCode
            $lastBody = $resp.Content
        } catch {
            $lastStatus = 0
            $lastBody = $_.Exception.Message
        }

        $passed = ($lastStatus -eq 200)
        if ($passed -and $ExtraCheck) {
            $passed = & $ExtraCheck $lastBody
        }

        $statusColor = if ($passed) { "Green" } else { "Yellow" }
        Write-Host ("  attempt {0}/{1}: HTTP {2}" -f $attempt, $Retries, $lastStatus) -ForegroundColor $statusColor

        if ($passed) {
            Write-Host ("  ✅ {0}" -f $Path) -ForegroundColor Green
            return $true
        }

        if ($attempt -lt $Retries) {
            Start-Sleep -Seconds $BackoffSec
        }
    }

    Write-Host ("  ❌ {0} failed after {1} attempts (last status: {2})" -f $Path, $Retries, $lastStatus) -ForegroundColor Red
    if ($lastBody.Length -gt 200) {
        Write-Host "    Body (first 200 chars): $($lastBody.Substring(0, 200))" -ForegroundColor DarkGray
    } else {
        Write-Host "    Body: $lastBody" -ForegroundColor DarkGray
    }
    return $false
}

Write-Host ""
Write-Host "==> Smoke test: $Url" -ForegroundColor Cyan
Write-Host "    Retries: $Retries, Backoff: ${BackoffSec}s"
Write-Host ""

$results = @()

# Check 1: GET /
Write-Host "==> GET /" -ForegroundColor Cyan
$results += Test-Route -Path "/"

# Check 2: GET /login
Write-Host ""
Write-Host "==> GET /login" -ForegroundColor Cyan
$results += Test-Route -Path "/login"

# Check 3: GET /api/health — must return 200 + {"status":"ok"}
Write-Host ""
Write-Host "==> GET /api/health" -ForegroundColor Cyan
$results += Test-Route -Path "/api/health" -ExtraCheck {
    param($body)
    return ($body -match '"status"\s*:\s*"ok"')
}

# Summary
Write-Host ""
Write-Host "==> Summary" -ForegroundColor Cyan
$passed = ($results | Where-Object { $_ }).Count
$total = $results.Count
if ($passed -eq $total) {
    Write-Host "  ✅ All $total checks passed" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  ❌ $($total - $passed) of $total checks failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Common causes:" -ForegroundColor Yellow
    Write-Host "    - DATABASE_URL placeholder (provision Vercel Postgres, update env var)"
    Write-Host "    - Vercel cold start (wait and retry)"
    Write-Host "    - App not deployed yet (check vercel ls)"
    exit 1
}
