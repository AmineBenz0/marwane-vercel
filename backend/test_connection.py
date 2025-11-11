#!/usr/bin/env python3
"""Script pour tester la connexion à PostgreSQL depuis différents environnements."""

import sys
import os

print("=" * 60)
print("Test de connexion PostgreSQL")
print("=" * 60)
print()

# Test 1: Connexion directe avec psycopg2
print("1. Test connexion directe psycopg2...")
import psycopg2

# Essayer plusieurs hôtes
hosts_to_try = ["127.0.0.1", "localhost"]
connection_successful = False

for host in hosts_to_try:
    try:
        print(f"   Tentative de connexion via {host}...")
        conn = psycopg2.connect(
            f"postgresql://comptabilite_user:change_me_in_production@{host}:5432/comptabilite_db",
            connect_timeout=5
        )
        print(f"   ✅ Connexion directe réussie via {host}")
        conn.close()
        connection_successful = True
        break
    except Exception as e:
        print(f"   ❌ Échec via {host}: {e}")
        continue

if not connection_successful:
    print("\n   ⚠️  Aucune connexion n'a réussi.")
    print("   💡 Si vous utilisez Docker Desktop avec WSL2, essayez:")
    print("      - Vérifier que le port 5432 est bien exposé: docker ps")
    print("      - Redémarrer Docker Desktop")
    print("      - Ou exécuter l'application depuis WSL")
    sys.exit(1)

# Test 2: Connexion via SQLAlchemy (comme l'application)
print("\n2. Test connexion via SQLAlchemy (app.database)...")
try:
    from app.database import engine
    conn = engine.connect()
    print("   ✅ Connexion SQLAlchemy réussie")
    conn.close()
except Exception as e:
    print(f"   ❌ Échec connexion SQLAlchemy: {e}")
    sys.exit(1)

# Test 3: Test de l'application FastAPI
print("\n3. Test application FastAPI...")
try:
    from app.main import app
    from fastapi.testclient import TestClient
    client = TestClient(app)
    response = client.get("/health")
    print(f"   ✅ Health check: {response.status_code} - {response.json()}")
except Exception as e:
    print(f"   ❌ Échec test application: {e}")
    sys.exit(1)

print("\n" + "=" * 60)
print("✅ Tous les tests de connexion ont réussi !")
print("=" * 60)

