# Script PowerShell pour arrêter l'environnement de développement local
# Usage: .\scripts\dev-stop.ps1

Write-Host "🛑 Arrêt de l'environnement de développement..." -ForegroundColor Cyan

# Arrêter les conteneurs Docker
Write-Host "`n📦 Arrêt des conteneurs Docker..." -ForegroundColor Cyan
docker compose -f docker-compose.yml --env-file .env.local down

Write-Host "✅ Environnement de développement arrêté!" -ForegroundColor Green


