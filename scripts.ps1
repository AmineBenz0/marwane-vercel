# Script PowerShell pour gérer Docker Compose
# Usage: .\scripts.ps1 [start|stop|restart|status]

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "status", "logs")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

function Start-PostgreSQL {
    Write-Host "🚀 Démarrage de PostgreSQL..." -ForegroundColor Green
    docker-compose up -d postgres
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PostgreSQL démarré avec succès!" -ForegroundColor Green
        Write-Host "📊 Vérification de l'état..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
        docker-compose ps
    } else {
        Write-Host "❌ Erreur lors du démarrage de PostgreSQL" -ForegroundColor Red
        exit 1
    }
}

function Stop-PostgreSQL {
    Write-Host "🛑 Arrêt de PostgreSQL..." -ForegroundColor Yellow
    docker-compose stop postgres
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PostgreSQL arrêté avec succès!" -ForegroundColor Green
    } else {
        Write-Host "❌ Erreur lors de l'arrêt de PostgreSQL" -ForegroundColor Red
        exit 1
    }
}

function Restart-PostgreSQL {
    Write-Host "🔄 Redémarrage de PostgreSQL..." -ForegroundColor Cyan
    Stop-PostgreSQL
    Start-Sleep -Seconds 2
    Start-PostgreSQL
}

function Show-Status {
    Write-Host "📊 État des conteneurs:" -ForegroundColor Cyan
    docker-compose ps
}

function Show-Logs {
    Write-Host "📋 Logs PostgreSQL (Ctrl+C pour quitter):" -ForegroundColor Cyan
    docker-compose logs -f postgres
}

switch ($Action) {
    "start" { Start-PostgreSQL }
    "stop" { Stop-PostgreSQL }
    "restart" { Restart-PostgreSQL }
    "status" { Show-Status }
    "logs" { Show-Logs }
    default { 
        Write-Host "Usage: .\scripts.ps1 [start|stop|restart|status|logs]" -ForegroundColor Yellow
    }
}

