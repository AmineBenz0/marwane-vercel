# Script PowerShell pour exécuter tous les tests de sécurité OWASP

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Tests de Sécurité OWASP" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Aller dans le répertoire backend
$backendDir = Split-Path -Parent $PSScriptRoot
Set-Location $backendDir

# 1. Exécuter les tests OWASP
Write-Host "1. Exécution des tests OWASP..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
pytest tests/test_owasp_security.py -v
Write-Host ""

# 2. Exécuter l'audit des dépendances
Write-Host "2. Audit des dépendances..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
if (Get-Command pip-audit -ErrorAction SilentlyContinue) {
    python scripts/audit_dependencies.py
} else {
    Write-Host "⚠️  pip-audit n'est pas installé. Installez-le avec: pip install pip-audit" -ForegroundColor Yellow
}
Write-Host ""

# 3. Générer le rapport
Write-Host "3. Génération du rapport de sécurité..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
python scripts/generate_security_report.py
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Tests de sécurité terminés" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Consultez SECURITY_REPORT.md pour le rapport complet." -ForegroundColor Green

