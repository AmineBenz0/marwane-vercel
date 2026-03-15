# Script PowerShell pour déployer vers la production Azure
# Usage: .\scripts\deploy-to-production.ps1

param(
    [string]$VmIp = "",
    [string]$ResourceGroup = "comptabilite-rg",
    [string]$VmName = "comptabilite-vm"
)

Write-Host "🚀 Déploiement vers la production Azure..." -ForegroundColor Cyan

# Récupérer l'IP de la VM si non fournie
if ([string]::IsNullOrEmpty($VmIp)) {
    Write-Host "📡 Récupération de l'IP publique de la VM..." -ForegroundColor Cyan
    $VmIp = az vm show -d -g $ResourceGroup -n $VmName --query publicIps -o tsv 2>$null
    
    if ([string]::IsNullOrEmpty($VmIp)) {
        Write-Host "❌ Impossible de récupérer l'IP de la VM." -ForegroundColor Red
        Write-Host "   Vérifiez que vous êtes connecté à Azure CLI: az login" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "✅ IP de la VM: $VmIp" -ForegroundColor Green

# Vérifier que les changements sont commités
Write-Host "`n📝 Vérification des changements Git..." -ForegroundColor Cyan
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠️  Il y a des changements non commités:" -ForegroundColor Yellow
    Write-Host $gitStatus -ForegroundColor White
    $response = Read-Host "Voulez-vous continuer quand même? (o/N)"
    if ($response -ne "o" -and $response -ne "O") {
        Write-Host "❌ Déploiement annulé. Commitez vos changements d'abord." -ForegroundColor Red
        exit 1
    }
}

# Commiter et pousser (optionnel)
$lastCommit = git log -1 --oneline
Write-Host "`n📤 Dernier commit: $lastCommit" -ForegroundColor Cyan
$push = Read-Host "Voulez-vous pousser les changements vers Git? (O/n)"
if ($push -ne "n" -and $push -ne "N") {
    Write-Host "📤 Push vers Git..." -ForegroundColor Cyan
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors du push Git." -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Changements poussés vers Git!" -ForegroundColor Green
}

# Se connecter à la VM et déployer
Write-Host "`n🔌 Connexion à la VM et déploiement..." -ForegroundColor Cyan
Write-Host "   IP: $VmIp" -ForegroundColor Gray
Write-Host "   Utilisateur: azureuser" -ForegroundColor Gray

$deployScript = @"
cd ~/marwane
echo '📥 Récupération des changements...'
git pull origin main
echo '🔨 Rebuild des conteneurs...'
docker compose down
docker compose build --no-cache frontend
docker compose up -d
echo '📊 Application des migrations...'
docker compose exec backend alembic upgrade head
echo '✅ Déploiement terminé!'
docker compose ps
"@

# Exécuter le script sur la VM
Write-Host "`n⏳ Exécution du script de déploiement sur la VM..." -ForegroundColor Yellow
ssh azureuser@$VmIp $deployScript

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Déploiement réussi!" -ForegroundColor Green
    Write-Host "   Application: http://comptabilite.westeurope.cloudapp.azure.com" -ForegroundColor Gray
} else {
    Write-Host "`n❌ Erreur lors du déploiement." -ForegroundColor Red
    Write-Host "   Connectez-vous manuellement: ssh azureuser@$VmIp" -ForegroundColor Yellow
    exit 1
}


