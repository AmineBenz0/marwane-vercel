# Script PowerShell pour démarrer l'environnement de développement local
# Usage: .\scripts\dev-start.ps1

Write-Host "🚀 Démarrage de l'environnement de développement..." -ForegroundColor Cyan

# Vérifier si Docker est en cours d'exécution
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker n'est pas en cours d'exécution. Veuillez démarrer Docker Desktop." -ForegroundColor Red
    exit 1
}

# Vérifier si les fichiers .env.local existent
if (-not (Test-Path ".env.local")) {
    Write-Host "⚠️  Fichier .env.local non trouvé. Création depuis .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env.local"
    Write-Host "✅ Fichier .env.local créé. Veuillez le configurer avant de continuer." -ForegroundColor Yellow
    Write-Host "   Éditez .env.local et configurez les variables d'environnement." -ForegroundColor Yellow
    exit 1
}

# Démarrer PostgreSQL
Write-Host "`n📦 Démarrage de PostgreSQL..." -ForegroundColor Cyan
docker compose -f docker-compose.yml --env-file .env.local up -d postgres

# Attendre que PostgreSQL soit prêt
Write-Host "⏳ Attente de PostgreSQL (10 secondes)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Vérifier si PostgreSQL est prêt
$postgresReady = docker compose ps postgres | Select-String "healthy"
if (-not $postgresReady) {
    Write-Host "⚠️  PostgreSQL n'est pas encore prêt. Attente supplémentaire..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

Write-Host "✅ PostgreSQL est prêt!" -ForegroundColor Green

# Instructions pour démarrer le backend et le frontend
Write-Host "`n📝 Instructions pour démarrer le backend et le frontend:" -ForegroundColor Cyan
Write-Host "`n1️⃣  Backend (dans un terminal WSL ou PowerShell):" -ForegroundColor Yellow
Write-Host "   cd backend" -ForegroundColor White
Write-Host "   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor White

Write-Host "`n2️⃣  Frontend (dans un autre terminal PowerShell):" -ForegroundColor Yellow
Write-Host "   cd frontend" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor White

Write-Host "`n✅ Environnement de développement prêt!" -ForegroundColor Green
Write-Host "   Backend: http://localhost:8000" -ForegroundColor Gray
Write-Host "   Frontend: http://localhost:5173 (ou http://localhost:3000)" -ForegroundColor Gray
Write-Host "   API Docs: http://localhost:8000/docs" -ForegroundColor Gray


