# Script PowerShell pour exécuter les tests via WSL
# Ce script appelle le script bash dans WSL

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Execution des tests via WSL" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que nous sommes dans le bon répertoire
if (-not (Test-Path "alembic.ini")) {
    Write-Host "Erreur: Ce script doit etre execute depuis le repertoire backend" -ForegroundColor Red
    exit 1
}

# Obtenir le chemin absolu du répertoire backend
$backendPath = (Get-Location).Path
# Convertir le chemin Windows en chemin WSL
$wslPath = $backendPath -replace '^([A-Z]):', '/mnt/$1' -replace '\\', '/'
$wslPath = $wslPath.ToLower()

Write-Host "Chemin WSL: $wslPath" -ForegroundColor Yellow
Write-Host ""

# Vérifier que WSL est disponible
if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
    Write-Host "Erreur: WSL n'est pas disponible" -ForegroundColor Red
    exit 1
}

# Exécuter le script bash dans WSL
Write-Host "Execution du script de tests dans WSL..." -ForegroundColor Green
Write-Host ""

$command = "cd '$wslPath'; chmod +x run_tests_wsl.sh; ./run_tests_wsl.sh"
wsl bash -c $command

$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "Les tests ont echoue avec le code de sortie: $exitCode" -ForegroundColor Red
    exit $exitCode
}

Write-Host ""
Write-Host "Script termine avec succes" -ForegroundColor Green

