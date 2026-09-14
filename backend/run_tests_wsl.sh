#!/bin/bash
# Script pour exécuter les tests depuis WSL
# Ce script vérifie que PostgreSQL est démarré, applique les migrations et lance les tests

set -e  # Arrêter en cas d'erreur

echo "=========================================="
echo "  Exécution des tests avec PostgreSQL"
echo "=========================================="
echo ""

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "alembic.ini" ]; then
    echo "❌ Erreur: Ce script doit être exécuté depuis le répertoire backend"
    exit 1
fi

# Vérifier et démarrer PostgreSQL si nécessaire
echo "📡 Vérification de PostgreSQL..."
if ! docker ps | grep -q comptabilite_postgres; then
    echo "   ⚠️  Le conteneur PostgreSQL n'est pas démarré, démarrage..."
    # Essayer de démarrer depuis le répertoire parent (où se trouve docker-compose.yml)
    cd .. 2>/dev/null || true
    docker-compose up -d postgres 2>/dev/null || docker compose up -d postgres 2>/dev/null || {
        echo "   ❌ Impossible de démarrer PostgreSQL automatiquement"
        echo "   Veuillez démarrer manuellement: docker-compose up -d postgres"
        exit 1
    }
    echo "   ⏳ Attente que PostgreSQL soit prêt..."
    sleep 5
    cd backend 2>/dev/null || true
fi

# Vérifier que PostgreSQL est accessible et déterminer l'hôte à utiliser
PG_HOST="localhost"
echo "   🔍 Test de connexion à PostgreSQL..."

# Attendre un peu que PostgreSQL soit complètement prêt
sleep 3

# Essayer localhost d'abord
if python -c "import psycopg2; conn = psycopg2.connect('postgresql://comptabilite_user:change_me_in_production@localhost:5432/comptabilite_db', connect_timeout=5); conn.close(); print('✅ PostgreSQL accessible via localhost')" 2>/dev/null; then
    PG_HOST="localhost"
    echo "   ✅ PostgreSQL est accessible via localhost"
else
    echo "   ⚠️  localhost ne fonctionne pas, tentative via l'IP du conteneur..."
    # Obtenir l'IP du conteneur
    CONTAINER_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' comptabilite_postgres 2>/dev/null | head -1)
    if [ -n "$CONTAINER_IP" ] && [ "$CONTAINER_IP" != "<no value>" ]; then
        PG_HOST="$CONTAINER_IP"
        echo "   📍 IP du conteneur détectée: $PG_HOST"
        if python -c "import psycopg2; conn = psycopg2.connect('postgresql://comptabilite_user:change_me_in_production@$PG_HOST:5432/comptabilite_db', connect_timeout=5); conn.close(); print('✅ PostgreSQL accessible via IP')" 2>/dev/null; then
            echo "   ✅ PostgreSQL est accessible via l'IP du conteneur"
            # Exporter la variable pour que les tests l'utilisent
            export DATABASE_URL="postgresql://comptabilite_user:change_me_in_production@$PG_HOST:5432/comptabilite_db"
        else
            echo "   ❌ Impossible de se connecter via l'IP du conteneur"
            echo "   ⏳ Attente supplémentaire et nouvelle tentative..."
            sleep 5
            if ! python -c "import psycopg2; conn = psycopg2.connect('postgresql://comptabilite_user:change_me_in_production@$PG_HOST:5432/comptabilite_db', connect_timeout=10); conn.close(); print('✅ PostgreSQL accessible')" 2>/dev/null; then
                echo "❌ Erreur: Impossible de se connecter à PostgreSQL"
                echo "   Vérifiez que le conteneur est démarré: docker ps | grep postgres"
                exit 1
            fi
        fi
    else
        echo "   ⏳ Attente supplémentaire et nouvelle tentative sur localhost..."
        sleep 5
        if ! python -c "import psycopg2; conn = psycopg2.connect('postgresql://comptabilite_user:change_me_in_production@localhost:5432/comptabilite_db', connect_timeout=10); conn.close(); print('✅ PostgreSQL accessible')" 2>/dev/null; then
            echo "❌ Erreur: Impossible de se connecter à PostgreSQL"
            echo "   Vérifiez que le conteneur est démarré: docker ps | grep postgres"
            exit 1
        fi
    fi
fi
echo ""

# Vérifier l'état des migrations
echo "📊 Vérification de l'état des migrations..."
CURRENT_REV=$(alembic current 2>/dev/null | grep -oP '^\w+' | head -1 || echo "none")
echo "   Révision actuelle: $CURRENT_REV"
echo ""

# Appliquer les migrations si nécessaire
echo "🔄 Application des migrations..."
# Gérer les branches multiples
HEADS=$(alembic heads 2>/dev/null | wc -l)
if [ "$HEADS" -gt 1 ]; then
    echo "   ⚠️  Plusieurs branches détectées, application des deux heads..."
    alembic upgrade 002_add_est_actif 2>/dev/null || true
    alembic upgrade 476f961e2737 2>/dev/null || true
else
    alembic upgrade head 2>/dev/null || echo "   ⚠️  Aucune migration à appliquer ou erreur (peut être normal)"
fi
echo ""

# Lancer les tests
echo "🧪 Lancement des tests..."
echo "=========================================="
echo ""

python -m pytest tests/ -v --tb=short

echo ""
echo "=========================================="
echo "✅ Tests terminés"
echo "=========================================="

