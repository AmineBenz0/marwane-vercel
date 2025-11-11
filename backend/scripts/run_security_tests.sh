#!/bin/bash
# Script pour exécuter tous les tests de sécurité OWASP

set -e

echo "=========================================="
echo "Tests de Sécurité OWASP"
echo "=========================================="
echo ""

# Aller dans le répertoire backend
cd "$(dirname "$0")/.."

# 1. Exécuter les tests OWASP
echo "1. Exécution des tests OWASP..."
echo "----------------------------------------"
pytest tests/test_owasp_security.py -v
echo ""

# 2. Exécuter l'audit des dépendances
echo "2. Audit des dépendances..."
echo "----------------------------------------"
if command -v pip-audit &> /dev/null; then
    python scripts/audit_dependencies.py
else
    echo "⚠️  pip-audit n'est pas installé. Installez-le avec: pip install pip-audit"
fi
echo ""

# 3. Générer le rapport
echo "3. Génération du rapport de sécurité..."
echo "----------------------------------------"
python scripts/generate_security_report.py
echo ""

echo "=========================================="
echo "✅ Tests de sécurité terminés"
echo "=========================================="
echo ""
echo "Consultez SECURITY_REPORT.md pour le rapport complet."

