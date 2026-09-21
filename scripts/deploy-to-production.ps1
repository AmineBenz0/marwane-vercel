[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$DeploymentUrl,
    [string]$Scope = "",
    [int]$HealthCheckAttempts = 12,
    [int]$HealthCheckDelaySeconds = 5
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    throw "Vercel CLI is required. Authenticate with 'vercel login' before promoting a release."
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$status = git -C $repositoryRoot status --porcelain
if ($status) {
    throw "The working tree is not clean. Promote only a committed, CI-validated deployment."
}

Write-Host "Inspecting the candidate deployment: $DeploymentUrl" -ForegroundColor Cyan
$inspectArgs = @("inspect", $DeploymentUrl)
if ($Scope) { $inspectArgs += @("--scope", $Scope) }
$inspectOutput = (& vercel @inspectArgs 2>&1 | Out-String)
$inspectExitCode = $LASTEXITCODE
$inspectOutput | Write-Host
if ($inspectExitCode -ne 0) {
    throw "Vercel inspection failed. The candidate was not promoted."
}

if ($inspectOutput -notmatch '(?i)\bready\b') {
    throw "The candidate deployment is not reported as READY. The candidate was not promoted."
}

function Test-DeploymentEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $uri = "$DeploymentUrl$Path"
    try {
        $response = Invoke-WebRequest -Uri $uri -Method Get -TimeoutSec 10 -MaximumRedirection 3
        if ($response.StatusCode -eq 200) {
            Write-Host "Health check passed: $Path" -ForegroundColor Green
            return $true
        }
        Write-Host "Health check returned HTTP $($response.StatusCode): $Path" -ForegroundColor Yellow
    } catch {
        Write-Host "Health check is not ready yet: $Path ($($_.Exception.Message))" -ForegroundColor Yellow
    }
    return $false
}

if ($HealthCheckAttempts -lt 1) {
    throw "HealthCheckAttempts must be at least 1."
}
if ($HealthCheckDelaySeconds -lt 0) {
    throw "HealthCheckDelaySeconds cannot be negative."
}

$ready = $false
for ($attempt = 1; $attempt -le $HealthCheckAttempts; $attempt++) {
    $live = Test-DeploymentEndpoint -Path "/api/v1/health/live"
    $databaseReady = Test-DeploymentEndpoint -Path "/api/v1/health/ready"
    if ($live -and $databaseReady) {
        $ready = $true
        break
    }
    if ($attempt -lt $HealthCheckAttempts -and $HealthCheckDelaySeconds -gt 0) {
        Start-Sleep -Seconds $HealthCheckDelaySeconds
    }
}

if (-not $ready) {
    throw "Candidate health checks did not pass. The candidate was not promoted."
}

if ($PSCmdlet.ShouldProcess($DeploymentUrl, "Promote the validated Vercel deployment to production")) {
    $promoteArgs = @("promote", $DeploymentUrl)
    if ($Scope) { $promoteArgs += @("--scope", $Scope) }
    & vercel @promoteArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Vercel promotion failed."
    }
    Write-Host "Promotion requested. Run the authenticated post-promotion smoke flows from the enterprise acceptance checklist." -ForegroundColor Green
}
