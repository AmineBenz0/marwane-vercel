# Script PowerShell pour exécuter les tests de charge avec Locust

# Configuration par défaut
$HOST = if ($env:LOCUST_HOST) { $env:LOCUST_HOST } else { "http://localhost:8000" }
$USERS = if ($env:LOCUST_USERS) { [int]$env:LOCUST_USERS } else { 100 }
$SPAWN_RATE = if ($env:LOCUST_SPAWN_RATE) { [int]$env:LOCUST_SPAWN_RATE } else { 10 }
$RUN_TIME = if ($env:LOCUST_RUN_TIME) { $env:LOCUST_RUN_TIME } else { "5m" }
$REPORT_FILE = if ($env:LOCUST_REPORT) { $env:LOCUST_REPORT } else { "load_test_report.html" }

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Tests de Charge - API Comptabilité" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Host: $HOST"
Write-Host "Users: $USERS"
Write-Host "Spawn Rate: $SPAWN_RATE/sec"
Write-Host "Durée: $RUN_TIME"
Write-Host "Rapport: $REPORT_FILE"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que Locust est installé
try {
    $null = Get-Command locust -ErrorAction Stop
} catch {
    Write-Host "❌ Locust n'est pas installé. Installez-le avec: pip install locust" -ForegroundColor Red
    exit 1
}

# Vérifier que l'API est accessible
Write-Host "Vérification de l'accessibilité de l'API..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$HOST/health" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ API accessible" -ForegroundColor Green
} catch {
    Write-Host "❌ L'API n'est pas accessible sur $HOST" -ForegroundColor Red
    Write-Host "   Assurez-vous que le backend est démarré: uvicorn app.main:app --reload" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Exécuter les tests
Write-Host "Démarrage des tests de charge..." -ForegroundColor Yellow
locust -f tests/load/locustfile.py `
  --host="$HOST" `
  --users=$USERS `
  --spawn-rate=$SPAWN_RATE `
  --run-time="$RUN_TIME" `
  --headless `
  --html="$REPORT_FILE" `
  --loglevel=INFO

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Tests terminés !" -ForegroundColor Green
Write-Host "Rapport disponible dans: $REPORT_FILE" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan

