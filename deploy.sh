#!/bin/bash

# Script de déploiement pour l'application Comptabilité
# Usage: ./deploy.sh

set -e  # Arrêter en cas d'erreur

echo "🚀 Déploiement de l'application Comptabilité..."
echo "================================================"

# Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé. Veuillez l'installer d'abord."
    exit 1
fi

# Vérifier que Docker Compose est installé (v1 ou v2)
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Docker Compose n'est pas installé. Veuillez l'installer d'abord."
    echo "Installation : sudo apt install -y docker-compose-plugin"
    exit 1
fi

echo "✅ Utilisation de : $DOCKER_COMPOSE"

# Vérifier que les fichiers .env existent
if [ ! -f "backend/.env" ]; then
    echo "⚠️  Fichier backend/.env manquant. Création depuis .env.example..."
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        echo "⚠️  IMPORTANT : Éditer backend/.env avec vos valeurs !"
        exit 1
    else
        echo "❌ Fichier backend/.env.example introuvable."
        exit 1
    fi
fi

if [ ! -f "frontend/.env" ]; then
    echo "⚠️  Fichier frontend/.env manquant. Création depuis .env.example..."
    if [ -f "frontend/.env.example" ]; then
        cp frontend/.env.example frontend/.env
        echo "⚠️  IMPORTANT : Éditer frontend/.env avec vos valeurs !"
        exit 1
    else
        echo "❌ Fichier frontend/.env.example introuvable."
        exit 1
    fi
fi

# Arrêter les conteneurs existants
echo ""
echo "📦 Arrêt des conteneurs existants..."
$DOCKER_COMPOSE down

# Supprimer les anciennes images (optionnel, décommenter si nécessaire)
# echo "🗑️  Nettoyage des anciennes images..."
# docker system prune -f

# Construire les nouvelles images
echo ""
echo "🔨 Construction des images Docker..."
$DOCKER_COMPOSE build

# Démarrer les conteneurs
echo ""
echo "▶️  Démarrage des conteneurs..."
$DOCKER_COMPOSE up -d

# Attendre que les services soient prêts
echo ""
echo "⏳ Attente du démarrage des services (15 secondes)..."
sleep 15

# Vérifier le statut
echo ""
echo "✅ Vérification du statut des conteneurs..."
$DOCKER_COMPOSE ps

# Vérifier la santé de la base de données
echo ""
echo "🔍 Vérification de la base de données..."
if docker exec comptabilite_postgres pg_isready -U comptabilite_user > /dev/null 2>&1; then
    echo "✅ PostgreSQL est prêt"
else
    echo "⚠️  PostgreSQL n'est pas encore prêt, attente..."
    sleep 10
fi

# Appliquer les migrations (si Alembic est configuré)
echo ""
echo "🔄 Application des migrations de base de données..."
if docker exec comptabilite_backend alembic current > /dev/null 2>&1; then
    docker exec comptabilite_backend alembic upgrade head
    echo "✅ Migrations appliquées"
else
    echo "⚠️  Alembic n'est pas configuré ou migrations déjà à jour"
fi

# Afficher les logs récents
echo ""
echo "📋 Logs récents (dernières 20 lignes)..."
echo "----------------------------------------"
$DOCKER_COMPOSE logs --tail=20

# Récupérer l'IP publique
echo ""
echo "🌐 Informations d'accès :"
echo "----------------------------------------"

# Essayer de récupérer l'IP publique
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "IP_NON_DISPONIBLE")

if [ "$PUBLIC_IP" != "IP_NON_DISPONIBLE" ]; then
    echo "📱 Frontend : http://$PUBLIC_IP:3000"
    echo "🔧 Backend : http://$PUBLIC_IP:8000"
    echo "📚 API Docs : http://$PUBLIC_IP:8000/docs"
else
    echo "📱 Frontend : http://localhost:3000"
    echo "🔧 Backend : http://localhost:8000"
    echo "📚 API Docs : http://localhost:8000/docs"
fi

echo ""
echo "✅ Déploiement terminé avec succès !"
echo ""
echo "📝 Prochaines étapes :"
echo "  1. Créer un utilisateur admin (voir DEPLOYMENT_AZURE_GUIDE.md)"
echo "  2. Tester l'application dans un navigateur"
echo "  3. Configurer les backups automatiques"
echo "  4. Configurer HTTPS (si domaine disponible)"
echo ""
echo "🔍 Commandes utiles :"
echo "  - Voir les logs : $DOCKER_COMPOSE logs -f"
echo "  - Arrêter : $DOCKER_COMPOSE down"
echo "  - Redémarrer : $DOCKER_COMPOSE restart"
echo "  - Statut : $DOCKER_COMPOSE ps"
echo ""

