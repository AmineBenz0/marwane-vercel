# Configuration des Tests

Les tests utilisent maintenant **PostgreSQL directement** au lieu de SQLite pour supporter toutes les fonctionnalités PostgreSQL (vues matérialisées, triggers, contraintes CHECK, etc.).

## Prérequis

1. **PostgreSQL doit être installé et en cours d'exécution**
2. **Les migrations Alembic doivent être appliquées** avant de lancer les tests

## Configuration

### Base de données de test

Par défaut, les tests utilisent la même base de données que l'application (`comptabilite_db`). Pour utiliser une base de données de test séparée, définissez la variable d'environnement `TEST_DATABASE_URL` :

```bash
export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/comptabilite_test_db"
```

### Appliquer les migrations

Avant de lancer les tests, assurez-vous que les migrations Alembic sont appliquées :

```bash
cd backend
alembic upgrade head
```

Cela créera toutes les tables, vues matérialisées, triggers et contraintes nécessaires pour les tests.

## Exécution des tests

```bash
# Depuis le répertoire backend
python -m pytest tests/ -v

# Avec couverture
python -m pytest tests/ -v --cov=app --cov-report=html
```

## Isolation des tests

Les tests utilisent des **transactions avec savepoints** pour isoler chaque test :

- Chaque test s'exécute dans sa propre transaction
- Toutes les modifications sont automatiquement annulées (rollback) après chaque test
- Cela garantit que les tests ne s'influencent pas mutuellement
- Plus rapide que de supprimer/créer les tables à chaque test

## Notes importantes

- Les migrations Alembic (vues matérialisées, triggers, etc.) doivent être appliquées avant de lancer les tests
- Si vous créez de nouvelles migrations, réexécutez `alembic upgrade head` avant les tests
- Les tests utilisent la même base de données par défaut, mais avec isolation via transactions

