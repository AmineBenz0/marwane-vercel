#!/bin/bash
# Script pour exécuter les tests de charge avec Locust

# Configuration par défaut
HOST="${LOCUST_HOST:-http://localhost:8000}"
USERS="${LOCUST_USERS:-100}"
SPAWN_RATE="${LOCUST_SPAWN_RATE:-10}"
RUN_TIME="${LOCUST_RUN_TIME:-5m}"
REPORT_FILE="${LOCUST_REPORT:-load_test_report.html}"

echo "=========================================="
echo "Tests de Charge - API Comptabilité"
echo "=========================================="
echo "Host: $HOST"
echo "Users: $USERS"
echo "Spawn Rate: $SPAWN_RATE/sec"
echo "Durée: $RUN_TIME"
echo "Rapport: $REPORT_FILE"
echo "=========================================="
echo ""

# Vérifier que Locust est installé
if ! command -v locust &> /dev/null; then
    echo "❌ Locust n'est pas installé. Installez-le avec: pip install locust"
    exit 1
fi

# Vérifier que l'API est accessible
echo "Vérification de l'accessibilité de l'API..."
if ! curl -s -f "$HOST/health" > /dev/null; then
    echo "❌ L'API n'est pas accessible sur $HOST"
    echo "   Assurez-vous que le backend est démarré: uvicorn app.main:app --reload"
    exit 1
fi
echo "✅ API accessible"
echo ""

# Exécuter les tests
echo "Démarrage des tests de charge..."
locust -f tests/load/locustfile.py \
  --host="$HOST" \
  --users="$USERS" \
  --spawn-rate="$SPAWN_RATE" \
  --run-time="$RUN_TIME" \
  --headless \
  --html="$REPORT_FILE" \
  --loglevel=INFO

echo ""
echo "=========================================="
echo "Tests terminés !"
echo "Rapport disponible dans: $REPORT_FILE"
echo "=========================================="

