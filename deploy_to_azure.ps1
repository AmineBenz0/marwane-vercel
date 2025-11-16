# Script PowerShell pour déployer sur Azure depuis Windows
# Usage: .\deploy_to_azure.ps1 -VMIp "VOTRE_IP" -SSHKey "chemin\vers\cle.pem"

param(
    [Parameter(Mandatory=$true)]
    [string]$VMIp,
    
    [Parameter(Mandatory=$false)]
    [string]$SSHKey = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Username = "azureuser"
)

Write-Host "🚀 Déploiement sur Azure VM : $VMIp" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

# Vérifier que Git est installé
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Git n'est pas installé. Veuillez l'installer d'abord." -ForegroundColor Red
    exit 1
}

# Construire la commande SSH
$sshCommand = if ($SSHKey) {
    "ssh -i `"$SSHKey`" $Username@$VMIp"
} else {
    "ssh $Username@$VMIp"
}

Write-Host ""
Write-Host "📦 Étape 1 : Connexion à la VM..." -ForegroundColor Cyan

# Tester la connexion
$testConnection = if ($SSHKey) {
    ssh -i "$SSHKey" -o ConnectTimeout=5 "$Username@$VMIp" "echo 'Connected'" 2>$null
} else {
    ssh -o ConnectTimeout=5 "$Username@$VMIp" "echo 'Connected'" 2>$null
}

if (-not $testConnection) {
    Write-Host "❌ Impossible de se connecter à la VM. Vérifiez l'IP et la clé SSH." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Connexion réussie" -ForegroundColor Green

Write-Host ""
Write-Host "📂 Étape 2 : Préparation du code..." -ForegroundColor Cyan

# Créer un archive du projet (exclure node_modules, venv, etc.)
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$archiveName = "comptabilite_$timestamp.tar.gz"

Write-Host "📦 Création de l'archive..." -ForegroundColor Yellow

# Utiliser Git pour créer une archive propre
git archive --format=tar.gz --output=$archiveName HEAD

if (-not (Test-Path $archiveName)) {
    Write-Host "❌ Erreur lors de la création de l'archive" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Archive créée : $archiveName" -ForegroundColor Green

Write-Host ""
Write-Host "📤 Étape 3 : Upload vers la VM..." -ForegroundColor Cyan

# Upload l'archive vers la VM
if ($SSHKey) {
    scp -i "$SSHKey" $archiveName "$Username@${VMIp}:~/"
} else {
    scp $archiveName "$Username@${VMIp}:~/"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors de l'upload" -ForegroundColor Red
    Remove-Item $archiveName
    exit 1
}

Write-Host "✅ Upload terminé" -ForegroundColor Green

# Supprimer l'archive locale
Remove-Item $archiveName

Write-Host ""
Write-Host "🔧 Étape 4 : Déploiement sur la VM..." -ForegroundColor Cyan

# Commandes à exécuter sur la VM
$deployCommands = @"
set -e
echo '📂 Extraction de l'archive...'
mkdir -p ~/apps
cd ~/apps
rm -rf comptabilite_old
if [ -d comptabilite ]; then
    mv comptabilite comptabilite_old
fi
mkdir comptabilite
tar -xzf ~/$archiveName -C comptabilite
cd comptabilite

echo '📝 Vérification des fichiers .env...'
if [ ! -f backend/.env ]; then
    echo '⚠️  backend/.env manquant'
    if [ -f ../comptabilite_old/backend/.env ]; then
        echo '📋 Copie depuis l ancienne version...'
        cp ../comptabilite_old/backend/.env backend/.env
    fi
fi

if [ ! -f frontend/.env ]; then
    echo '⚠️  frontend/.env manquant'
    if [ -f ../comptabilite_old/frontend/.env ]; then
        echo '📋 Copie depuis l ancienne version...'
        cp ../comptabilite_old/frontend/.env frontend/.env
    fi
fi

if [ ! -f .env ]; then
    echo '⚠️  .env manquant'
    if [ -f ../comptabilite_old/.env ]; then
        echo '📋 Copie depuis l ancienne version...'
        cp ../comptabilite_old/.env .env
    fi
fi

echo '🔨 Construction et démarrage des conteneurs...'
docker-compose down
docker-compose build
docker-compose up -d

echo '⏳ Attente du démarrage (15 secondes)...'
sleep 15

echo '🔄 Application des migrations...'
docker exec comptabilite_backend alembic upgrade head || echo '⚠️  Migrations déjà à jour ou erreur'

echo '✅ Déploiement terminé !'
docker-compose ps

rm ~/$archiveName
"@

# Exécuter les commandes sur la VM
if ($SSHKey) {
    $deployCommands | ssh -i "$SSHKey" "$Username@$VMIp" "bash -s"
} else {
    $deployCommands | ssh "$Username@$VMIp" "bash -s"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors du déploiement" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Déploiement terminé avec succès !" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Accès à l'application :" -ForegroundColor Cyan
Write-Host "  Frontend : http://$VMIp:3000" -ForegroundColor Yellow
Write-Host "  Backend  : http://$VMIp:8000" -ForegroundColor Yellow
Write-Host "  API Docs : http://$VMIp:8000/docs" -ForegroundColor Yellow
Write-Host ""
Write-Host "📝 Prochaines étapes :" -ForegroundColor Cyan
Write-Host "  1. Tester l'application" -ForegroundColor White
Write-Host "  2. Créer un utilisateur admin (si pas déjà fait)" -ForegroundColor White
Write-Host "  3. Configurer les backups" -ForegroundColor White
Write-Host ""

