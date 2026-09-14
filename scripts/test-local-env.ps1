# Script PowerShell pour tester l'environnement local
# Usage: .\scripts\test-local-env.ps1

Write-Host "🧪 Test de l'environnement local..." -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

$errors = @()
$warnings = @()

# 1. Vérifier Docker
Write-Host "`n1️⃣  Vérification de Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Docker installé: $dockerVersion" -ForegroundColor Green
    } else {
        $errors += "Docker n'est pas installé ou n'est pas dans le PATH"
        Write-Host "   ❌ Docker non trouvé" -ForegroundColor Red
    }
} catch {
    $errors += "Docker n'est pas installé"
    Write-Host "   ❌ Docker non trouvé" -ForegroundColor Red
}

# 2. Vérifier Docker Desktop
Write-Host "`n2️⃣  Vérification de Docker Desktop..." -ForegroundColor Yellow
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Docker Desktop est en cours d'exécution" -ForegroundColor Green
    } else {
        $errors += "Docker Desktop n'est pas démarré"
        Write-Host "   ❌ Docker Desktop n'est pas démarré" -ForegroundColor Red
    }
} catch {
    $errors += "Impossible de vérifier Docker Desktop"
    Write-Host "   ❌ Erreur lors de la vérification" -ForegroundColor Red
}

# 3. Vérifier les fichiers .env.local
Write-Host "`n3️⃣  Vérification des fichiers .env.local..." -ForegroundColor Yellow

$envFiles = @(
    @{Path = ".env.local"; Name = "Racine"},
    @{Path = "backend\.env.local"; Name = "Backend"},
    @{Path = "frontend\.env.local"; Name = "Frontend"}
)

foreach ($file in $envFiles) {
    if (Test-Path $file.Path) {
        Write-Host "   ✅ $($file.Name): $($file.Path)" -ForegroundColor Green
    } else {
        $warnings += "Fichier $($file.Path) manquant"
        Write-Host "   ⚠️  $($file.Name): $($file.Path) manquant" -ForegroundColor Yellow
    }
}

# 4. Vérifier Node.js (pour le frontend)
Write-Host "`n4️⃣  Vérification de Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Node.js installé: $nodeVersion" -ForegroundColor Green
    } else {
        $warnings += "Node.js n'est pas installé (nécessaire pour le frontend en mode dev)"
        Write-Host "   ⚠️  Node.js non trouvé (optionnel si tu utilises Docker)" -ForegroundColor Yellow
    }
} catch {
    $warnings += "Node.js n'est pas installé"
    Write-Host "   ⚠️  Node.js non trouvé (optionnel si tu utilises Docker)" -ForegroundColor Yellow
}

# 5. Vérifier Python (pour le backend)
Write-Host "`n5️⃣  Vérification de Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Python installé: $pythonVersion" -ForegroundColor Green
    } else {
        $warnings += "Python n'est pas installé (nécessaire pour le backend en mode dev)"
        Write-Host "   ⚠️  Python non trouvé (optionnel si tu utilises Docker)" -ForegroundColor Yellow
    }
} catch {
    $warnings += "Python n'est pas installé"
    Write-Host "   ⚠️  Python non trouvé (optionnel si tu utilises Docker)" -ForegroundColor Yellow
}

# 6. Vérifier les ports disponibles
Write-Host "`n6️⃣  Vérification des ports..." -ForegroundColor Yellow

$ports = @(
    @{Port = 5432; Service = "PostgreSQL"},
    @{Port = 8000; Service = "Backend"},
    @{Port = 5173; Service = "Frontend (Vite)"},
    @{Port = 3000; Service = "Frontend (Docker)"}
)

foreach ($portInfo in $ports) {
    $port = $portInfo.Port
    $service = $portInfo.Service
    
    try {
        $connection = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue -InformationLevel Quiet 2>&1
        if ($connection -eq $true) {
            $warnings += "Le port $port ($service) est déjà utilisé"
            Write-Host "   ⚠️  Port $port ($service) est utilisé" -ForegroundColor Yellow
        } else {
            Write-Host "   ✅ Port $port ($service) disponible" -ForegroundColor Green
        }
    } catch {
        Write-Host "   ✅ Port $port ($service) disponible" -ForegroundColor Green
    }
}

# 7. Vérifier docker-compose.yml
Write-Host "`n7️⃣  Vérification de docker-compose.yml..." -ForegroundColor Yellow
if (Test-Path "docker-compose.yml") {
    Write-Host "   ✅ docker-compose.yml existe" -ForegroundColor Green
} else {
    $errors += "docker-compose.yml manquant"
    Write-Host "   ❌ docker-compose.yml manquant" -ForegroundColor Red
}

# Résumé
Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "📊 Résumé" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

if ($errors.Count -eq 0) {
    Write-Host "✅ Aucune erreur critique détectée!" -ForegroundColor Green
} else {
    Write-Host "❌ Erreurs détectées:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "   - $error" -ForegroundColor Red
    }
}

if ($warnings.Count -gt 0) {
    Write-Host "`n⚠️  Avertissements:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "   - $warning" -ForegroundColor Yellow
    }
}

# Instructions
Write-Host "`n📝 Prochaines étapes:" -ForegroundColor Cyan
if ($errors.Count -eq 0) {
    Write-Host "   1. Démarrer PostgreSQL: .\scripts\dev-start.ps1" -ForegroundColor White
    Write-Host "   2. Démarrer le backend: cd backend && uvicorn app.main:app --reload" -ForegroundColor White
    Write-Host "   3. Démarrer le frontend: cd frontend && npm run dev" -ForegroundColor White
    Write-Host "   4. Ouvrir http://localhost:5173 dans le navigateur" -ForegroundColor White
} else {
    Write-Host "   Corrigez les erreurs ci-dessus avant de continuer." -ForegroundColor Red
}

Write-Host ""





