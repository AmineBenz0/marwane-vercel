[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://')]
    [string]$DeploymentUrl,
    [string]$Scope = ""
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
& vercel @inspectArgs
if ($LASTEXITCODE -ne 0) {
    throw "Vercel inspection failed. The candidate was not promoted."
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
