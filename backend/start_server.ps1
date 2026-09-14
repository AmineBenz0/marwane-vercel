# Script PowerShell pour démarrer le serveur FastAPI avec vérification de la base de données
# Usage: .\start_server.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Démarrage du serveur API Comptabilité" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si PostgreSQL est accessible
Write-Host "🔍 Vérification de PostgreSQL..." -ForegroundColor Yellow

$postgresRunning = $false
try {
    $result = wsl docker ps --filter "name=comptabilite_postgres" --format "{{.Status}}" 2>$null
    if ($result -like "*Up*") {
        Write-Host "  ✅ Le conteneur PostgreSQL est actif" -ForegroundColor Green
        $postgresRunning = $true
    } else {
        Write-Host "  ⚠️  Le conteneur PostgreSQL n'est pas actif" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  Impossible de vérifier le statut de PostgreSQL" -ForegroundColor Yellow
}

if (-not $postgresRunning) {
    Write-Host ""
    Write-Host "💡 Pour démarrer PostgreSQL:" -ForegroundColor Cyan
    Write-Host "   cd .." -ForegroundColor White
    Write-Host "   wsl docker compose up -d postgres" -ForegroundColor White
    Write-Host ""
    $response = Read-Host "Voulez-vous démarrer PostgreSQL maintenant? (O/N)"
    if ($response -eq "O" -or $response -eq "o") {
        Write-Host "  🚀 Démarrage de PostgreSQL..." -ForegroundColor Yellow
        Push-Location ..
        wsl docker compose up -d postgres
        Pop-Location
        Write-Host "  ⏳ Attente que PostgreSQL soit prêt (15 secondes)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 15
    }
}

Write-Host ""
Write-Host "🚀 Démarrage du serveur FastAPI..." -ForegroundColor Green
Write-Host ""
Write-Host "ℹ️  Le serveur démarrera même si PostgreSQL n'est pas accessible." -ForegroundColor Cyan
Write-Host "   Les opérations de base de données échoueront jusqu'à ce que PostgreSQL soit disponible." -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 URL du serveur: http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "📖 Documentation API: http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Appuyez sur Ctrl+C pour arrêter le serveur" -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Démarrer uvicorn
uvicorn app.main:app --reload

